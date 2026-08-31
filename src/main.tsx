import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Root element not found");
}

createRoot(rootElement).render(<App />);

// Scoly must always render the currently deployed application. Remove every
// historical service worker and Cache Storage entry without touching auth,
// language, or cart data stored in localStorage.
if ("serviceWorker" in navigator) {
  void navigator.serviceWorker.getRegistrations().then((registrations) =>
    Promise.all(registrations.map((registration) => registration.unregister())),
  );
}

if ("caches" in window) {
  void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
}
