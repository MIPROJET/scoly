/**
 * Garantit que scoly.ci affiche toujours la dernière version publiée.
 *
 * 1. Au chargement : supprime les service workers et le Cache Storage hérités.
 * 2. Compare l'identifiant de build courant à celui mémorisé ; s'il a changé,
 *    purge les caches puis recharge une seule fois (garde anti-boucle).
 * 3. En arrière-plan : vérifie périodiquement l'index déployé et recharge
 *    automatiquement quand une nouvelle version est en ligne.
 *
 * Les données utilisateur (session, panier, langue) ne sont jamais touchées.
 */

const VERSION_KEY = "scoly_build_id";
const RELOAD_GUARD = "scoly_reload_guard";
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

declare const __BUILD_ID__: string;

const buildId = typeof __BUILD_ID__ === "string" ? __BUILD_ID__ : "dev";

const clearBrowserCaches = async () => {
  if ("serviceWorker" in navigator) {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((r) => r.unregister()));
    } catch {
      /* ignore */
    }
  }
  if ("caches" in window) {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
    } catch {
      /* ignore */
    }
  }
};

/** Empreinte de la version déployée : liste des scripts/styles de l'index. */
const fetchDeployedFingerprint = async (): Promise<string | null> => {
  try {
    const res = await fetch(`/index.html?_=${Date.now()}`, { cache: "no-store" });
    if (!res.ok) return null;
    const html = await res.text();
    const assets = html.match(/\/assets\/[A-Za-z0-9._-]+\.(?:js|css)/g);
    return assets ? assets.sort().join("|") : null;
  } catch {
    return null;
  }
};

const reloadOnce = async () => {
  if (sessionStorage.getItem(RELOAD_GUARD) === buildId) return;
  sessionStorage.setItem(RELOAD_GUARD, buildId);
  await clearBrowserCaches();
  window.location.reload();
};

export const initAppVersionGuard = () => {
  if (typeof window === "undefined") return;

  void clearBrowserCaches();

  let stored: string | null = null;
  try {
    stored = localStorage.getItem(VERSION_KEY);
    localStorage.setItem(VERSION_KEY, buildId);
  } catch {
    /* ignore */
  }

  // Nouvelle version détectée localement : purge immédiate.
  if (stored && stored !== buildId) {
    void clearBrowserCaches();
  }

  if (buildId === "dev") return;

  let currentFingerprint: string | null = null;

  const check = async () => {
    if (document.visibilityState !== "visible") return;
    const fingerprint = await fetchDeployedFingerprint();
    if (!fingerprint) return;
    if (currentFingerprint === null) {
      currentFingerprint = fingerprint;
      return;
    }
    if (fingerprint !== currentFingerprint) {
      currentFingerprint = fingerprint;
      void reloadOnce();
    }
  };

  void check();
  window.setInterval(() => void check(), CHECK_INTERVAL_MS);
  window.addEventListener("focus", () => void check());
};
