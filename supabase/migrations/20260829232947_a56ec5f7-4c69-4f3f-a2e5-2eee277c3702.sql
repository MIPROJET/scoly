CREATE OR REPLACE FUNCTION public.finalize_payment_atomic(
  _payment_id uuid,
  _transaction_id text,
  _status text,
  _metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS TABLE(payment_id uuid, order_id uuid, final_status text, order_confirmed boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_payment public.payments%ROWTYPE;
  v_order public.orders%ROWTYPE;
  v_confirmed boolean := false;
BEGIN
  IF _status NOT IN ('completed', 'failed', 'pending') THEN
    RAISE EXCEPTION 'invalid payment status: %', _status;
  END IF;

  SELECT * INTO v_payment FROM public.payments WHERE id = _payment_id FOR UPDATE;
  IF v_payment.id IS NULL THEN
    RAISE EXCEPTION 'payment not found';
  END IF;

  -- Idempotence: a completed payment is never downgraded or re-processed.
  IF v_payment.status = 'completed' THEN
    RETURN QUERY SELECT v_payment.id, v_payment.order_id, 'completed'::text, false;
    RETURN;
  END IF;

  UPDATE public.payments
  SET status = _status,
      transaction_id = COALESCE(_transaction_id, transaction_id),
      metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(_metadata, '{}'::jsonb),
      completed_at = CASE WHEN _status = 'completed' THEN COALESCE(completed_at, now()) ELSE completed_at END
  WHERE id = _payment_id;

  IF _status = 'completed' AND v_payment.order_id IS NOT NULL THEN
    SELECT * INTO v_order FROM public.orders WHERE id = v_payment.order_id FOR UPDATE;

    IF v_order.id IS NOT NULL AND v_order.status = 'pending'::order_status THEN
      UPDATE public.orders
      SET status = 'confirmed'::order_status,
          payment_reference = COALESCE(_transaction_id, payment_reference),
          payment_method = COALESCE(v_payment.payment_method, payment_method),
          updated_at = now()
      WHERE id = v_order.id;
      v_confirmed := true;

      -- Customer notification
      IF v_payment.user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          v_payment.user_id,
          'payment',
          'Paiement confirmé',
          'Message généré automatiquement, ne pas répondre. Votre paiement de '
            || to_char(COALESCE(v_payment.amount, 0), 'FM999G999G999') || ' FCFA a été confirmé pour la commande #'
            || left(v_order.id::text, 8) || '.',
          jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', 'kkiapay')
        );
      END IF;

      -- Team notifications (admin, comptable, commercial, moderator + assigned delivery)
      INSERT INTO public.notifications (user_id, type, title, message, data)
      SELECT DISTINCT ur.user_id,
             'payment',
             'Nouveau paiement confirmé',
             'Message généré automatiquement, ne pas répondre. Paiement de '
               || to_char(COALESCE(v_payment.amount, 0), 'FM999G999G999') || ' FCFA reçu pour la commande #'
               || left(v_order.id::text, 8) || '.',
             jsonb_build_object('payment_id', v_payment.id, 'order_id', v_order.id, 'provider', 'kkiapay')
      FROM public.user_roles ur
      WHERE ur.role IN ('admin'::app_role, 'super_admin'::app_role, 'comptable'::app_role, 'commercial'::app_role, 'moderator'::app_role);

      IF v_order.delivery_user_id IS NOT NULL THEN
        INSERT INTO public.notifications (user_id, type, title, message, data)
        VALUES (
          v_order.delivery_user_id,
          'order',
          'Commande payée à livrer',
          'Message généré automatiquement, ne pas répondre. La commande #' || left(v_order.id::text, 8) || ' est payée et prête pour la livraison.',
          jsonb_build_object('order_id', v_order.id)
        );
      END IF;
    END IF;
  END IF;

  RETURN QUERY SELECT v_payment.id, v_payment.order_id, _status, v_confirmed;
END;
$$;

REVOKE ALL ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.finalize_payment_atomic(uuid, text, text, jsonb) TO service_role;

-- Faster receipt/history lookups for every dashboard
CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_status_created ON public.payments(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON public.orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_phone ON public.orders(phone);