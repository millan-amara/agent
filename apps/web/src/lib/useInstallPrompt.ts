"use client";

import { useCallback, useSyncExternalStore } from "react";

/** Chromium's `beforeinstallprompt` — not in lib.dom, so declare the bits we use. */
interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

/**
 * Chrome fires `beforeinstallprompt` ONCE, early, and never replays it. So the
 * listener cannot live inside a component: the install button sits in the nav rail,
 * which doesn't mount until `api.me()` resolves — by then the event has come and
 * gone, and the button stays hidden until something incidental re-triggers it.
 *
 * Instead we capture it here at module scope, the moment this bundle evaluates, and
 * hold it in a tiny store. Components subscribe whenever they happen to mount and
 * read whatever was already caught.
 */
type Snapshot = { canInstall: boolean; needsManualInstructions: boolean };

const EMPTY: Snapshot = { canInstall: false, needsManualInstructions: false };

let deferred: BeforeInstallPromptEvent | null = null;
let installed = false;
let isIos = false;
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();

/** Recompute the cached snapshot; useSyncExternalStore needs a stable identity. */
function refresh() {
  const next: Snapshot = {
    canInstall: !installed && (deferred !== null || isIos),
    // iOS has no programmatic prompt — installing is a manual Share > Add to Home
    // Screen, so we show instructions rather than a button that can't do anything.
    needsManualInstructions: !installed && deferred === null && isIos,
  };
  if (next.canInstall === snapshot.canInstall && next.needsManualInstructions === snapshot.needsManualInstructions) {
    return;
  }
  snapshot = next;
  listeners.forEach((l) => l());
}

// "use client" modules still execute during SSR, so guard on window.
if (typeof window !== "undefined") {
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

  const ua = window.navigator.userAgent;
  // iPadOS 13+ reports a Mac UA, hence the touch-points check.
  isIos = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && window.navigator.maxTouchPoints > 1);

  if (standalone) {
    installed = true;
  } else {
    window.addEventListener("beforeinstallprompt", (e) => {
      // Suppresses Chrome's own mini-infobar so our button is the only prompt.
      e.preventDefault();
      deferred = e as BeforeInstallPromptEvent;
      refresh();
    });
    window.addEventListener("appinstalled", () => {
      installed = true;
      deferred = null;
      refresh();
    });
  }
  refresh();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export type InstallState = Snapshot & {
  /** Fires the native install prompt. Resolves true if the user accepted. */
  promptInstall: () => Promise<boolean>;
};

export function useInstallPrompt(): InstallState {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot,
    // Nothing is installable on the server; React re-reads the real snapshot
    // immediately after hydration.
    () => EMPTY,
  );

  const promptInstall = useCallback(async () => {
    if (!deferred) return false;
    const event = deferred;
    // The event is single-use whatever the answer, so retire it up front.
    deferred = null;
    refresh();
    await event.prompt();
    const { outcome } = await event.userChoice;
    return outcome === "accepted";
  }, []);

  return { ...state, promptInstall };
}
