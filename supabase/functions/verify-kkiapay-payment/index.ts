import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { finalizePayment } from "../_shared/finalize-payment.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Client-triggered verification after the KkiaPay widget returns.
 * The client "success" event is NOT trusted: the transaction is re-checked
 * against KkiaPay with the private/secret keys held server-side only.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!);
    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (authError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const transactionId: string | undefined = body?.transactionId;
    const paymentId: string | undefined = body?.paymentId;

    if (!transactionId) return json({ error: "transactionId requis" }, 400);

    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Ownership check when a paymentId is supplied
    if (paymentId) {
      const { data: payment } = await supabase
        .from("payments").select("id, user_id").eq("id", paymentId).maybeSingle();
      if (!payment || payment.user_id !== user.id) return json({ error: "Forbidden" }, 403);
    }

    const result = await finalizePayment(supabase, { transactionId, paymentId });
    return json(result, result.ok ? 200 : 400);
  } catch (error) {
    console.error("verify-kkiapay-payment error:", error);
    return json({ error: "Erreur serveur" }, 500);
  }
});
