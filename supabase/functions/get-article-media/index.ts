// Returns short-lived signed URLs for premium article media stored in the
// private `article-premium-media` bucket. Access is gated on an actual purchase
// (or authorship / admin), so paid media can no longer be fetched by URL alone.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const PREMIUM_BUCKET = "article-premium-media";
const SIGNED_URL_TTL = 60 * 30; // 30 minutes

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

    const { articleId } = await req.json().catch(() => ({ articleId: null }));
    if (!articleId) return json({ error: "articleId is required" }, 400);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const authed = createClient(SUPABASE_URL, ANON_KEY);
    const { data: userData, error: userErr } = await authed.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);
    const userId = userData.user.id;

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: article, error: articleErr } = await admin
      .from("articles")
      .select("id, author_id, is_premium, media, status")
      .eq("id", articleId)
      .maybeSingle();
    if (articleErr) return json({ error: articleErr.message }, 500);
    if (!article) return json({ error: "Article not found" }, 404);

    let allowed = article.author_id === userId;

    if (!allowed) {
      const { data: roles } = await admin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      allowed = (roles ?? []).some((r: { role: string }) =>
        r.role === "admin" || r.role === "moderator" || r.role === "super_admin"
      );
    }

    if (!allowed && article.is_premium) {
      const { data: purchase } = await admin
        .from("article_purchases")
        .select("id")
        .eq("article_id", articleId)
        .eq("user_id", userId)
        .eq("status", "completed")
        .maybeSingle();
      allowed = !!purchase;
    } else if (!allowed && !article.is_premium) {
      allowed = article.status === "published";
    }

    if (!allowed) return json({ error: "Payment required" }, 403);

    const media = Array.isArray(article.media) ? article.media : [];
    const urls: Record<string, string> = {};

    for (const item of media as Array<Record<string, unknown>>) {
      if (!item || item.bucket !== PREMIUM_BUCKET) continue;
      const path = String(item.url ?? "");
      if (!path) continue;
      const { data: signed } = await admin.storage
        .from(PREMIUM_BUCKET)
        .createSignedUrl(path, SIGNED_URL_TTL);
      if (signed?.signedUrl) urls[path] = signed.signedUrl;
    }

    return json({ urls });
  } catch (error) {
    console.error("get-article-media error:", error);
    return json({ error: String(error) }, 500);
  }
});
