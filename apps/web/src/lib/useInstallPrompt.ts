"use client";

import { useCallback, useEffect, useState } from "react";

/** Chromium's `beforeinstallprompt` — not in lib.dom, so declare the bits we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/** True when the app is already running as an installed PWA. */
function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    // iOS Safari's non-standard flag for home-screen launches.
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  );
}

/**
 * iOS/iPadOS never fires `beforeinstallprompt` — installing there is a manual
 * Share > "Add to Home Screen". Detect it so we can show instructions instead of
 * a button that can't do anything. iPadOS 13+ reports a Mac UA, hence maxTouchPoints.
 */
function isIos(): boolean {
  if (typeof window === "undefined") return false;
  const ua = window.navigator.userAgent;
  return (
    /iphone|ipad|ipod/i.test(ua) ||
    (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1)
  );
}

export type InstallState = {
  /** Show an install affordance at all? False once installed, or on unsupported browsers. */
  canInstall: boolean;
  /** iOS can't be prompted programmatically — show manual instructions instead. */
  needsManualInstructions: boolean;
  /** Fires the native install prompt. Resolves true if the user accepted. */
  promptInstall: () => Promise<boolean>;
};

/**
 * Drives the in-app "Install app" affordance.
 *
 * Chromium fires `beforeinstallprompt` when the PWA is installable; we intercept it
 * (preventDefault suppresses the browser's own mini-infobar) and stash the event so
 * the user can trigger installation from inside our UI instead. The event is
 * single-use, so it's cleared after prompting.
 */
export function useInstallPrompt(): InstallState {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);

  useEffect(() => {
    if (isStandalone()) {
      setInstalled(true);
      return;
    }
    setIos(isIos());

    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
    };
    // Hide the affordance the moment the install completes.
    const onInstalled = () => {
      setInstalled(true);
      setDeferred(null);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    await deferred.prompt();
    const { outcome } = await deferred.userChoice;
    // The event can only be prompted once, regardless of the answer.
    setDeferred(null);
    return outcome === "accepted";
  }, [deferred]);

  return {
    canInstall: !installed && (deferred !== null || ios),
    needsManualInstructions: !installed && deferred === null && ios,
    promptInstall,
  };
}
