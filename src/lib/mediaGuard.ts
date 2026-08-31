/**
 * Bandwidth guard.
 *
 * Inline `data:` media stored in database rows is re-downloaded on every single
 * page view and can never be cached by the browser or the CDN. A handful of such
 * rows is enough to burn a whole monthly egress quota, so they are dropped here
 * instead of being rendered.
 *
 * Media must live in Supabase Storage (or any CDN) and the database must only
 * hold its URL.
 */

/** Anything above this is definitely not a tiny inline SVG placeholder. */
const MAX_INLINE_BYTES = 20_000;

export const isHeavyInlineMedia = (url?: string | null): boolean =>
  typeof url === "string" && url.startsWith("data:") && url.length > MAX_INLINE_BYTES;

/** Returns the URL when it is safe to render, otherwise `null`. */
export const safeMediaUrl = (url?: string | null): string | null => {
  if (!url) return null;
  if (isHeavyInlineMedia(url)) {
    if (import.meta.env.DEV) {
      console.warn("[mediaGuard] Inline base64 media skipped — upload it to Storage instead.");
    }
    return null;
  }
  return url;
};

/**
 * Tiny session-scoped response cache: avoids re-querying the same public
 * payload on every client-side navigation within a session.
 */
export const sessionCache = {
  get<T>(key: string, maxAgeMs: number): T | null {
    try {
      const raw = sessionStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as { at: number; value: T };
      if (Date.now() - parsed.at > maxAgeMs) {
        sessionStorage.removeItem(key);
        return null;
      }
      return parsed.value;
    } catch {
      return null;
    }
  },
  set<T>(key: string, value: T) {
    try {
      sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), value }));
    } catch {
      // Quota exceeded or storage unavailable — caching is best effort.
    }
  },
};
