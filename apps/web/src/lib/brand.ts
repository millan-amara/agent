"use client";

/**
 * The app shell renders the tenant's logo and name, but NavShell only refetches
 * `me` on route change — so editing your branding in Settings (same route) would
 * leave a stale sidebar until you navigated away. Settings fires this after a save;
 * NavShell listens and refreshes.
 */
export const BRAND_CHANGED = "azayon:brand-changed";

export function notifyBrandChanged() {
  window.dispatchEvent(new Event(BRAND_CHANGED));
}
