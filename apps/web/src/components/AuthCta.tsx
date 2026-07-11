"use client";

import { useEffect, useState, type ReactNode } from "react";
import { api } from "@/lib/api";

/**
 * Swaps the marketing call-to-action for signed-in visitors.
 *
 * The landing page is a server component and deliberately auth-unaware, so it showed
 * "Log in" to people who already had a valid 30-day session — which is what made the
 * app look like it had signed them out.
 *
 * Renders `signedOut` until we know otherwise: the signed-out CTA is the correct
 * default for SSR and for crawlers, and it avoids a flash of empty space.
 */
export function AuthCta({ signedOut, signedIn }: { signedOut: ReactNode; signedIn: ReactNode }) {
  const [authed, setAuthed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(() => !cancelled && setAuthed(true))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  return <>{authed ? signedIn : signedOut}</>;
}
