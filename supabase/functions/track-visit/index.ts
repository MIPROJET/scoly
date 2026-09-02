// Enregistre une visite avec géolocalisation IP pour l'onglet Trafic de l'admin.
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function clientIp(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") ?? req.headers.get("x-real-ip");
}

async function geolocate(ip: string | null) {
  if (!ip || ip.startsWith("127.") || ip.startsWith("::1") || ip.startsWith("192.168.")) return {};
  try {
    const res = await fetch(
      `http://ip-api.com/json/${encodeURIComponent(ip)}?fields=status,country,countryCode,continent,regionName,city`,
    );
    if (!res.ok) return {};
    const data = await res.json();
    if (data?.status !== "success") return {};
    return {
      country_code: data.countryCode ?? null,
      country_name: data.country ?? null,
      continent: data.continent ?? null,
      region: data.regionName ?? null,
      city: data.city ?? null,
    };
  } catch {
    return {};
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const path = typeof body.path === "string" ? body.path.slice(0, 500) : null;
    const sessionId = typeof body.session_id === "string" ? body.session_id.slice(0, 100) : null;
    if (!path || !sessionId) return json({ error: "path et session_id requis" }, 400);

    // Utilisateur éventuellement connecté (non bloquant).
    let userId: string | null = null;
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.replace("Bearer ", "").trim();
    if (token && token !== ANON_KEY) {
      try {
        const authed = createClient(SUPABASE_URL, ANON_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
        });
        const { data } = await authed.auth.getClaims(token);
        userId = (data?.claims?.sub as string) ?? null;
      } catch {
        userId = null;
      }
    }

    const geo = await geolocate(clientIp(req));
    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { error } = await admin.rpc("record_visit", {
      _session_id: sessionId,
      _path: path,
      _referrer: typeof body.referrer === "string" ? body.referrer.slice(0, 500) : null,
      _country_code: (geo as Record<string, string | null>).country_code ?? null,
      _country_name: (geo as Record<string, string | null>).country_name ?? null,
      _continent: (geo as Record<string, string | null>).continent ?? null,
      _region: (geo as Record<string, string | null>).region ?? null,
      _city: (geo as Record<string, string | null>).city ?? null,
      _device_type: typeof body.device_type === "string" ? body.device_type : null,
      _browser: typeof body.browser === "string" ? body.browser : null,
      _language: typeof body.language === "string" ? body.language : null,
      _user_id: userId,
    });

    if (error) {
      console.error("[track-visit]", error);
      return json({ ok: false }, 200);
    }
    return json({ ok: true });
  } catch (e) {
    console.error("[track-visit]", e);
    return json({ ok: false }, 200);
  }
});
