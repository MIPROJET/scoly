import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { hmacSha256Hex, safeEqual } from "../_shared/kkiapay.ts";
import { finalizePayment } from "../_shared/finalize-payment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-kkiapay-signature, x-kkiapay-secret",
};

/**
 * KkiaPay webhook.
 * Accepted authentication (either one):
 *  - `x-kkiapay-secret` header equal to the configured secret hash (KKIAPAY_WEBHOOK_SECRET)
 *  - `x-kkiapay-signature` HMAC-SHA256 of the raw body with the secret hash
 * The transaction is then re-verified directly against the KkiaPay API.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const webhookSecret = Deno.env.get("KKIAPAY_WEBHOOK_SECRET") || Deno.env.get("KKIAPAY_SECRET");
    if (!webhookSecret) {
      console.error("[Security] KKIAPAY_WEBHOOK_SECRET not configured");
      return json({ error: "Webhook not configured" }, 503);
    }

    const rawBody = await req.text();
    const headerSecret = req.headers.get("x-kkiapay-secret");
    const signature = req.headers.get("x-kkiapay-signature");

    let authenticated = false;
    if (headerSecret && safeEqual(headerSecret.trim(), webhookSecret)) {
      authenticated = true;
    } else if (signature) {
      const expected = await hmacSha256Hex(rawBody, webhookSecret);
      authenticated = safeEqual(signature.trim().toLowerCase(), expected);
    }

    if (!authenticated) {
      console.error("[Security] Webhook rejected: invalid secret/signature");
      return json({ error: "Invalid signature" }, 401);
    }

    const payload = JSON.parse(rawBody || "{}");
    const data = payload?.data ?? payload;
    const eventName: string = payload?.event ?? "unknown";

    const transactionId: string | undefined = data?.transactionId || data?.transaction_id ||
      data?.id;
    const custom = data?.custom_data || data?.state || payload?.custom_data || {};

    console.log("[KkiaPay webhook]", eventName, transactionId);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const result = await finalizePayment(supabase, {
      transactionId,
      paymentId: custom?.paymentId ?? null,
      orderId: custom?.orderId ?? null,
    });

    console.log("[KkiaPay webhook] result:", JSON.stringify(result));

    // Always acknowledge so KkiaPay does not retry indefinitely.
    return json({ received: true, ...result });
  } catch (error) {
    console.error("Webhook error:", error);
    return json({ received: true, error: "internal_error" });
  }
});
