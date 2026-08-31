// Routage automatique des messages sortants SCOLY.
// Zone UEMOA -> SMS via smsing.app (TP Cloud API)
// Hors UEMOA -> WhatsApp au nom de SCOLY avec le logo officiel joint,
//               repli automatique en SMS si le canal WhatsApp échoue.

import { createClient, type SupabaseClient } from "npm:@supabase/supabase-js@2";

const SMSING_API_URL = Deno.env.get("SMSING_API_URL") ?? "https://panel.smsing.app/smsAPI";
const SMSING_API_KEY = Deno.env.get("SMSING_API_KEY");
const SMSING_API_TOKEN = Deno.env.get("SMSING_API_TOKEN");
const SMSING_SENDER = Deno.env.get("SMSING_SENDER_ID") ?? "SCOLY";
const SITE_URL = Deno.env.get("PUBLIC_SITE_URL") ?? "https://scoly.ci";

/** Logo officiel SCOLY joint aux messages WhatsApp (jamais un logo généré). */
export const SCOLY_LOGO_URL = `${SITE_URL}/logo-scoly-officiel-800.png`;

/** Indicatifs de la zone UEMOA : SMS direct. */
export const UEMOA_DIAL_CODES = ["229", "226", "225", "245", "223", "227", "221", "228"];

export type Channel = "sms" | "whatsapp";

export interface SendResult {
  ok: boolean;
  channel: Channel;
  to: string;
  providerMessageId?: string | null;
  error?: string;
  httpStatus?: number;
}

/** Normalise en E.164 sans le « + » (format attendu par le fournisseur). */
export function normalizePhone(raw: string, defaultDial = "225"): string {
  let cleaned = String(raw ?? "").replace(/[^\d+]/g, "");
  if (cleaned.startsWith("+")) return cleaned.slice(1);
  cleaned = cleaned.replace(/^00/, "");
  if (UEMOA_DIAL_CODES.some((d) => cleaned.startsWith(d)) && cleaned.length > 8) return cleaned;
  return `${defaultDial}${cleaned.replace(/^0+/, "")}`;
}

export function dialCodeOf(msisdn: string): string {
  const hit = UEMOA_DIAL_CODES.find((d) => msisdn.startsWith(d));
  if (hit) return hit;
  // Repli : les 1 à 3 premiers chiffres servent d'indicatif indicatif.
  return msisdn.slice(0, 3);
}

export function isUemoa(msisdn: string): boolean {
  return UEMOA_DIAL_CODES.some((d) => msisdn.startsWith(d));
}

/** Canal retenu automatiquement selon le pays du destinataire. */
export function channelFor(msisdn: string): Channel {
  return isUemoa(msisdn) ? "sms" : "whatsapp";
}

export function renderTemplate(
  template: string,
  vars: Record<string, string | number | undefined>,
): string {
  return template
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(vars[k] ?? ""))
    .replace(/\{\s*(\w+)\s*\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

async function callProvider(params: Record<string, string>, action: "sendsms" | "sendwhatsapp") {
  const qs = new URLSearchParams({
    apikey: SMSING_API_KEY!,
    apitoken: SMSING_API_TOKEN!,
    ...params,
  });
  const res = await fetch(`${SMSING_API_URL}?${action}&${qs.toString()}`, { method: "GET" });
  const raw = await res.text();
  let parsed: Record<string, unknown> | null = null;
  try {
    parsed = JSON.parse(raw);
  } catch {
    /* réponse texte brute */
  }
  const status = String((parsed?.status as string) ?? "").toLowerCase();
  const ok = res.ok && ["queued", "success", "sent", "ok"].includes(status);
  return {
    ok,
    parsed,
    httpStatus: res.status,
    raw: (parsed?.message ? String(parsed.message) : raw).slice(0, 500),
  };
}

async function sendSms(to: string, body: string) {
  return callProvider(
    { type: "sms", from: SMSING_SENDER, to, text: body.slice(0, 480), route: "0" },
    "sendsms",
  );
}

async function sendWhatsapp(to: string, body: string) {
  return callProvider(
    {
      type: "whatsapp",
      from: SMSING_SENDER,
      to,
      text: body.slice(0, 900),
      media: SCOLY_LOGO_URL,
      mediaurl: SCOLY_LOGO_URL,
      caption: body.slice(0, 900),
    },
    "sendwhatsapp",
  );
}

export interface SendOptions {
  templateKey?: string | null;
  orderId?: string | null;
  sentBy?: string | null;
  metadata?: Record<string, unknown>;
  /** Force un canal ; sinon le canal est déterminé automatiquement. */
  forceChannel?: Channel;
}

/**
 * Envoie un message et journalise le canal réellement utilisé dans sms_logs.
 */
export async function sendMessage(
  admin: SupabaseClient,
  rawTo: string,
  body: string,
  options: SendOptions = {},
): Promise<SendResult> {
  if (!SMSING_API_KEY || !SMSING_API_TOKEN) {
    return { ok: false, channel: "sms", to: rawTo, error: "SMS non configuré" };
  }

  const to = normalizePhone(rawTo);
  let channel: Channel = options.forceChannel ?? channelFor(to);
  let outcome;
  let fellBack = false;

  try {
    outcome = channel === "whatsapp" ? await sendWhatsapp(to, body) : await sendSms(to, body);
    // Repli SMS si le canal WhatsApp n'est pas disponible chez le fournisseur.
    if (!outcome.ok && channel === "whatsapp") {
      fellBack = true;
      channel = "sms";
      outcome = await sendSms(to, body);
    }
  } catch (e) {
    outcome = { ok: false, parsed: null, httpStatus: 0, raw: (e as Error).message };
  }

  const providerMessageId =
    (outcome.parsed?.group_id as string) ?? (outcome.parsed?.id as string) ?? null;

  await admin.from("sms_logs").insert({
    recipient: to,
    body,
    template_key: options.templateKey ?? null,
    status: outcome.ok ? "sent" : "failed",
    provider: "smsing",
    channel,
    country_code: null,
    dial_code: dialCodeOf(to),
    order_id: options.orderId ?? null,
    provider_message_id: providerMessageId,
    error_message: outcome.ok ? null : outcome.raw,
    sent_by: options.sentBy ?? null,
    metadata: {
      ...(options.metadata ?? {}),
      http_status: outcome.httpStatus,
      whatsapp_fallback_to_sms: fellBack,
    },
  });

  return {
    ok: outcome.ok,
    channel,
    to,
    providerMessageId,
    error: outcome.ok ? undefined : outcome.raw,
    httpStatus: outcome.httpStatus,
  };
}

export function adminClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export { SITE_URL };
