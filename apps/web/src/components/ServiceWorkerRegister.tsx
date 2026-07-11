"use client";

import { useEffect } from "react";

/**
 * Registers the PWA service worker (/sw.js) on the client after the page loads.
 * Renders nothing. Registration is skipped in development so the SW's caching
 * never interferes with Fast Refresh / HMR.
 */
export function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const onLoad = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        // Non-fatal: the app works fine without the SW, it just isn't installable/offline.
        console.error("Service worker registration failed:", err);
      });
    };

    window.addEventListener("load", onLoad);
    return () => window.removeEventListener("load", onLoad);
  }, []);

  return null;
}
