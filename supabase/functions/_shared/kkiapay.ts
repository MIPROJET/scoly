// Shared KkiaPay server-side helpers.
// Secrets are NEVER exposed to the client: only edge functions read them.

export const KKIAPAY_API_BASE = "https://api.kkiapay.me/api/v1";

export interface KkiapayTransaction {
  status: string;
  amount: number;
  transactionId?: string;
  performed_at?: string;
  paymentMethod?: string;
  source?: string;
  client?: { fullname?: string; email?: string; phone?: string };
  state?: Record<string, unknown>;
  raw?: unknown;
}

/**
 * Authoritative transaction verification against KkiaPay servers.
 * Never trust a client-side "success" callback without this check.
 */
export async function verifyKkiapayTransaction(
  transactionId: string,
): Promise<KkiapayTransaction | null> {
  const publicKey = Deno.env.get("KKIAPAY_PUBLIC_KEY");
  const privateKey = Deno.env.get("KKIAPAY_PRIVATE_KEY");
  const secret = Deno.env.get("KKIAPAY_SECRET");

  if (!publicKey || !privateKey || !secret) {
    console.error("[KkiaPay] Missing API credentials in environment");
    return null;
  }

  try {
    const res = await fetch(`${KKIAPAY_API_BASE}/transactions/status`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": publicKey,
        "x-private-key": privateKey,
        "x-secret-key": secret,
      },
      body: JSON.stringify({ transactionId }),
    });

    if (!res.ok) {
      console.error("[KkiaPay] Verification HTTP error", res.status, await res.text());
      return null;
    }

    const data = await res.json();
    return { ...data, raw: data } as KkiapayTransaction;
  } catch (error) {
    console.error("[KkiaPay] Verification failed:", error);
    return null;
  }
}

export function mapKkiapayStatus(status: string | undefined): "completed" | "failed" | "pending" {
  const s = (status || "").toUpperCase();
  if (["SUCCESS", "APPROVED", "COMPLETED", "PAID"].includes(s)) return "completed";
  if (["FAILED", "DECLINED", "CANCELLED", "CANCELED", "INSUFFICIENT_FUNDS", "EXPIRED"].includes(s)) {
    return "failed";
  }
  return "pending";
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

export async function hmacSha256Hex(payload: string, secret: string): Promise<string> {
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, encoder.encode(payload));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, "0")).join("");
}
