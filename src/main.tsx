import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";

if (typeof window !== "undefined" && "serviceWorker" in navigator) {
  // Defensive reset: prevents stale SW/cached bundles from serving outdated env keys.
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    registrations.forEach((registration) => {
      void registration.unregister();
    });
  }).catch(() => {});

  if ("caches" in window) {
    void caches.keys().then((keys) => {
      keys.forEach((key) => {
        if (key.includes("workbox") || key.includes("vite-plugin-pwa")) {
          void caches.delete(key);
        }
      });
    }).catch(() => {});
  }
}

createRoot(document.getElementById("root")!).render(<App />);
