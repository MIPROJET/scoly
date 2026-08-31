import { useState, useCallback, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type PaymentStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';

interface KkiaPayConfig {
  amount: number;
  reason: string;
  name?: string;
  email?: string;
  phone?: string;
  sandbox?: boolean;
}

interface RuntimeKkiaPayConfig {
  publicKey: string;
  sandbox: boolean;
  environment: "live";
  ready: boolean;
}

interface PaymentResult {
  success: boolean;
  paymentId?: string;
  transactionId?: string;
  message: string;
  status: PaymentStatus;
}

declare global {
  interface Window {
    openKkiapayWidget: (config: {
      amount: number;
      position?: string;
      callback?: string;
      data?: string;
      theme?: string;
      key: string;
      sandbox?: boolean;
      name?: string;
      email?: string;
      phone?: string;
    }) => void;
    addKkiapayListener: (event: string, callback: (data: any) => void) => void;
    removeKkiapayListener: (event: string, callback: (data: any) => void) => void;
  }
}

export const useKkiaPay = () => {
  const [loading, setLoading] = useState(false);
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | null>(null);
  const [transactionId, setTransactionId] = useState<string | null>(null);
  const [isScriptLoaded, setIsScriptLoaded] = useState(false);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [configurationError, setConfigurationError] = useState<string | null>(null);

  // Load KkiaPay SDK script
  useEffect(() => {
    if (document.getElementById('kkiapay-sdk')) {
      setIsScriptLoaded(true);
      return;
    }

    const script = document.createElement('script');
    script.id = 'kkiapay-sdk';
    script.src = 'https://cdn.kkiapay.me/k.js';
    script.async = true;
    script.onload = () => setIsScriptLoaded(true);
    document.body.appendChild(script);

    return () => {
      // Don't remove script as it might be needed elsewhere
    };
  }, []);

  // The publishable key is fetched at runtime so a LIVE key rotation does not
  // require rebuilding the frontend. Private credentials remain server-only.
  useEffect(() => {
    let active = true;
    supabase.functions.invoke('kkiapay-config').then(({ data, error }) => {
      if (!active) return;
      if (error || typeof data?.publicKey !== 'string' || data?.ready !== true || data?.sandbox !== false) {
        console.error('KkiaPay configuration unavailable', error);
        setConfigurationError(data?.error || 'Le paiement KkiaPay LIVE est temporairement indisponible.');
        return;
      }
      const runtimeConfig = data as RuntimeKkiaPayConfig;
      if (runtimeConfig.publicKey.toLowerCase().startsWith('tpk_')) {
        setConfigurationError('Une clé KkiaPay de test a été détectée en production.');
        return;
      }
      setPublicKey(runtimeConfig.publicKey);
      setConfigurationError(null);
    });
    return () => {
      active = false;
    };
  }, []);

  const openPaymentWidget = useCallback(
    async (
      config: KkiaPayConfig,
      orderId: string,
      userId: string,
      onSuccess?: (transactionId: string) => void,
      onFailed?: () => void
    ) => {
      if (!isScriptLoaded || !window.openKkiapayWidget || !publicKey || configurationError) {
        console.error(configurationError || 'KkiaPay LIVE configuration not loaded');
        setPaymentStatus('failed');
        return;
      }

      setLoading(true);
      setPaymentStatus('processing');

      // The server verifies ownership and takes the authoritative order total.
      const { data: payment, error } = await supabase.functions.invoke('process-payment', {
        body: {
          orderId,
          amount: config.amount,
          paymentMethod: 'kkiapay',
          phoneNumber: config.phone,
          customerEmail: config.email,
          customerName: config.name,
          description: config.reason,
        },
      });

      if (error) {
        console.error('Error creating payment:', error);
        setLoading(false);
        setPaymentStatus('failed');
        return;
      }

      // Persist minimal context for callback reloads
      try {
        localStorage.setItem(
          'kkiapay_pending',
          JSON.stringify({ paymentId: payment.paymentId, orderId, userId, at: Date.now() })
        );
      } catch {
        // ignore
      }

      // Success listener — the widget result is NEVER trusted directly.
      // The transaction is verified server-side (private/secret keys stay on the server).
      const handleSuccess = async (response: { transactionId: string }) => {
        console.log('KkiaPay widget success, verifying server-side...');
        setTransactionId(response.transactionId);

        const { data: verification, error: verifyError } = await supabase.functions.invoke(
          'verify-kkiapay-payment',
          { body: { transactionId: response.transactionId, paymentId: payment.paymentId } }
        );

        const verifiedStatus = (verification?.status as PaymentStatus | undefined) ?? null;

        if (verifyError || verifiedStatus !== 'completed') {
          console.error('Payment verification failed:', verifyError || verification);
          setPaymentStatus(verifiedStatus === 'failed' ? 'failed' : 'processing');
          setLoading(false);
          if (verifiedStatus === 'failed') {
            onFailed?.();
          }
          window.removeKkiapayListener?.('success', handleSuccess);
          window.removeKkiapayListener?.('failed', handleFailed);
          return;
        }

        setPaymentStatus('completed');
        setLoading(false);

        try {
          localStorage.removeItem('kkiapay_pending');
        } catch {
          // ignore
        }

        onSuccess?.(response.transactionId);
        window.removeKkiapayListener?.('success', handleSuccess);
        window.removeKkiapayListener?.('failed', handleFailed);
      };

      // Failed listener
      const handleFailed = async (error: unknown) => {
        console.log('KkiaPay failed:', error);
        setPaymentStatus('failed');
        setLoading(false);

        await supabase.functions.invoke('confirm-payment', {
          body: { paymentId: payment.paymentId, status: 'failed', transactionId: null },
        });

        try {
          localStorage.removeItem('kkiapay_pending');
        } catch {
          // ignore
        }

        onFailed?.();
        window.removeKkiapayListener?.('success', handleSuccess);
        window.removeKkiapayListener?.('failed', handleFailed);
      };

      window.addKkiapayListener?.('success', handleSuccess);
      window.addKkiapayListener?.('failed', handleFailed);

      const callbackUrl =
        window.location.origin +
        `/checkout?payment=success&paymentId=${encodeURIComponent(payment.paymentId)}&orderId=${encodeURIComponent(orderId)}`;

      window.openKkiapayWidget({
        amount: config.amount,
        key: publicKey,
        sandbox: false, // Production — real payments
        data: JSON.stringify({ orderId, paymentId: payment.paymentId, userId }),
        callback: callbackUrl,
        ...(config.name ? { name: config.name } : {}),
        ...(config.email ? { email: config.email } : {}),
        ...(config.phone ? { phone: config.phone } : {}),
      });

    },
    [configurationError, isScriptLoaded, publicKey]
  );

  const checkPaymentStatus = useCallback(async (
    paymentId?: string,
    orderId?: string
  ) => {
    try {
      let query = supabase.from('payments').select('*');
      
      if (paymentId) {
        query = query.eq('id', paymentId);
      } else if (orderId) {
        query = query.eq('order_id', orderId);
      } else {
        return null;
      }

      const { data, error } = await query.maybeSingle();

      if (error || !data) {
        return null;
      }

      setPaymentStatus(data.status as PaymentStatus);
      setTransactionId(data.transaction_id);

      return {
        id: data.id,
        status: data.status as PaymentStatus,
        transactionId: data.transaction_id,
        amount: data.amount,
        createdAt: data.created_at,
        completedAt: data.completed_at
      };
    } catch (error) {
      console.error('Error checking payment status:', error);
      return null;
    }
  }, []);

  return {
    loading,
    paymentStatus,
    transactionId,
    isScriptLoaded: isScriptLoaded && Boolean(publicKey) && !configurationError,
    configurationError,
    openPaymentWidget,
    checkPaymentStatus,
    setPaymentStatus
  };
};
