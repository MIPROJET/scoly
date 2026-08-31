// Shared, authoritative payment finalization used by both the KkiaPay webhook
// and the client-triggered verification endpoint.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { mapKkiapayStatus, verifyKkiapayTransaction } from "./kkiapay.ts";

export interface FinalizeResult {
  ok: boolean;
  status: "completed" | "failed" | "pending";
  message: string;
}

export async function finalizePayment(
  supabase: SupabaseClient,
  opts: { paymentId?: string | null; transactionId?: string | null; orderId?: string | null },
): Promise<FinalizeResult> {
  const { paymentId, transactionId, orderId } = opts;

  if (!transactionId) {
    return { ok: false, status: "pending", message: "transactionId manquant" };
  }

  // 1. Authoritative check against KkiaPay servers (never trust client/webhook body)
  const tx = await verifyKkiapayTransaction(transactionId);
  if (!tx) {
    return { ok: false, status: "pending", message: "Vérification KkiaPay impossible" };
  }
  const newStatus = mapKkiapayStatus(tx.status);

  // 2. Locate the payment record
  let payment: Record<string, any> | null = null;
  if (paymentId) {
    const { data } = await supabase.from("payments").select("*").eq("id", paymentId).maybeSingle();
    payment = data;
  }
  if (!payment && transactionId) {
    const { data } = await supabase.from("payments").select("*").eq("transaction_id", transactionId)
      .maybeSingle();
    payment = data;
  }
  if (!payment && orderId) {
    const { data } = await supabase.from("payments").select("*").eq("order_id", orderId)
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    payment = data;
  }
  if (!payment) {
    return { ok: false, status: newStatus, message: "Paiement introuvable" };
  }

  const metadata = {
    ...(payment.metadata || {}),
    kkiapay_status: tx.status,
    kkiapay_transaction_id: transactionId,
    kkiapay_payment_method: tx.paymentMethod || tx.source,
    verified_at: new Date().toISOString(),
  };

  // 3. Amount check against the authoritative order total
  if (newStatus === "completed" && payment.order_id) {
    const { data: order } = await supabase
      .from("orders").select("total_amount, status").eq("id", payment.order_id).maybeSingle();

    const paid = Number(tx.amount ?? 0);
    const expected = Number(order?.total_amount ?? 0);

    if (!order || paid + 1 < expected) {
      const { error: rejectError } = await supabase.rpc("finalize_payment_atomic", {
        _payment_id: payment.id,
        _transaction_id: transactionId,
        _status: "failed",
        _metadata: { ...metadata, security_reject: "amount_mismatch", paid_amount: paid, order_total: expected },
      });
      if (rejectError) console.error("[KkiaPay] Atomic rejection failed:", rejectError);
      return { ok: false, status: "failed", message: "Montant payé inférieur au total de la commande" };
    }
  }

  // 4. Persist the payment, confirm its order and create notifications in one
  // database transaction. This RPC is idempotent and never downgrades a payment.
  const { error: finalizeError } = await supabase.rpc("finalize_payment_atomic", {
    _payment_id: payment.id,
    _transaction_id: transactionId,
    _status: newStatus,
    _metadata: metadata,
  });

  if (finalizeError) {
    console.error("[KkiaPay] Atomic finalization failed:", finalizeError);
    return { ok: false, status: "pending", message: "Finalisation du paiement impossible" };
  }

  return {
    ok: true,
    status: newStatus,
    message: newStatus === "completed" ? "Paiement confirmé" : `Paiement ${newStatus}`,
  };
}
