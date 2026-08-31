// One-shot migration: move base64 media blobs out of the database into Storage.
// Handles:
//   - advertisements.media_url  -> advertisement-media bucket
//   - articles.media[].url      -> article-media bucket
// Base64 payloads stored in TOAST make every SELECT slow; public URLs are cheap.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function base64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

const DATA_URL_RE = /^data:([a-zA-Z0-9.+/-]+);base64,(.+)$/;

function extFromMime(mime: string): string {
  const raw = (mime.split("/")[1] ?? "bin").split("+")[0];
  return raw === "jpeg" ? "jpg" : raw === "quicktime" ? "mov" : raw;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const authed = createClient(SUPABASE_URL, ANON_KEY);
  const token = authHeader.replace("Bearer ", "");
  const { data: userData, error: userErr } = await authed.auth.getUser(token);
  if (userErr || !userData?.user) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: roles } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userData.user.id);
  const roleList = (roles ?? []).map((r: { role: string }) => r.role);
  if (!roleList.includes("admin") && !roleList.includes("super_admin")) {
    return json({ error: "Forbidden" }, 403);
  }

  const results: Record<string, unknown>[] = [];

  const uploadDataUrl = async (bucket: string, path: string, dataUrl: string) => {
    const m = dataUrl.match(DATA_URL_RE);
    if (!m) return null;
    const mime = m[1];
    const bytes = base64ToBytes(m[2]);
    const fullPath = `${path}.${extFromMime(mime)}`;
    const up = await supabase.storage
      .from(bucket)
      .upload(fullPath, bytes, { contentType: mime, upsert: true });
    if (up.error) throw up.error;
    const { data: pub } = supabase.storage.from(bucket).getPublicUrl(fullPath);
    return { url: pub.publicUrl, bytes: bytes.length };
  };

  // 1) advertisements.media_url
  const { data: ads, error: adsErr } = await supabase
    .from("advertisements")
    .select("id, media_url")
    .like("media_url", "data:%");
  if (adsErr) return json({ error: adsErr.message }, 500);

  for (const ad of ads ?? []) {
    try {
      const res = await uploadDataUrl("advertisement-media", `migrated/${ad.id}`, ad.media_url);
      if (!res) {
        results.push({ table: "advertisements", id: ad.id, skipped: "not-base64" });
        continue;
      }
      const { error: updErr } = await supabase
        .from("advertisements")
        .update({ media_url: res.url })
        .eq("id", ad.id);
      if (updErr) throw updErr;
      results.push({ table: "advertisements", id: ad.id, url: res.url, bytes: res.bytes });
    } catch (e) {
      results.push({ table: "advertisements", id: ad.id, error: String(e) });
    }
  }

  // 2) articles.media[].url
  const { data: articles, error: artErr } = await supabase
    .from("articles")
    .select("id, media")
    .not("media", "is", null);
  if (artErr) return json({ error: artErr.message }, 500);

  for (const article of articles ?? []) {
    const media = article.media;
    if (!Array.isArray(media)) continue;
    if (!media.some((item) => typeof item?.url === "string" && item.url.startsWith("data:"))) {
      continue;
    }

    try {
      const next: unknown[] = [];
      let index = 0;
      let migrated = 0;
      for (const item of media) {
        if (item && typeof item.url === "string" && item.url.startsWith("data:")) {
          const res = await uploadDataUrl(
            "article-media",
            `migrated/${article.id}-${index}`,
            item.url,
          );
          if (res) {
            next.push({ ...item, url: res.url });
            migrated++;
            index++;
            continue;
          }
        }
        next.push(item);
        index++;
      }

      const { error: updErr } = await supabase
        .from("articles")
        .update({ media: next })
        .eq("id", article.id);
      if (updErr) throw updErr;
      results.push({ table: "articles", id: article.id, migrated });
    } catch (e) {
      results.push({ table: "articles", id: article.id, error: String(e) });
    }
  }

  return json({ success: true, processed: results.length, results });
});
