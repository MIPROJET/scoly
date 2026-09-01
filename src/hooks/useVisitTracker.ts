import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";

const SESSION_KEY = "scoly_visit_session_id";

const getSessionId = () => {
  try {
    let sessionId = sessionStorage.getItem(SESSION_KEY);
    if (!sessionId) {
      sessionId =
        typeof crypto !== "undefined" && "randomUUID" in crypto
          ? crypto.randomUUID()
          : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem(SESSION_KEY, sessionId);
    }
    return sessionId;
  } catch {
    return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
};

const getDeviceType = () => {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/tablet|ipad/i.test(ua)) return "tablet";
  if (/mobile|iphone|android/i.test(ua)) return "mobile";
  return "desktop";
};

const getBrowser = () => {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (ua.includes("Edg")) return "Edge";
  if (ua.includes("Chrome")) return "Chrome";
  if (ua.includes("Firefox")) return "Firefox";
  if (ua.includes("Safari")) return "Safari";
  return "Other";
};

/**
 * Suit les changements de route et notifie l'edge function `track-visit`
 * pour alimenter les statistiques de trafic (géolocalisation IP côté serveur).
 * Échoue silencieusement si la fonction n'existe pas encore ou est indisponible.
 */
export const useVisitTracker = () => {
  const location = useLocation();
  const lastPathRef = useRef<string | null>(null);

  useEffect(() => {
    const path = location.pathname + location.search;
    if (lastPathRef.current === path) return;
    lastPathRef.current = path;

    const sessionId = getSessionId();

    supabase.functions
      .invoke("track-visit", {
        body: {
          path,
          referrer: document.referrer || null,
          session_id: sessionId,
          language: navigator.language || null,
          device_type: getDeviceType(),
          browser: getBrowser(),
        },
      })
      .catch(() => {
        // Suivi de trafic non bloquant : on ignore silencieusement les erreurs.
      });
  }, [location.pathname, location.search]);
};

export default useVisitTracker;
