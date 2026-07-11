"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { api } from "@/lib/api";

/**
 * Sends an already-signed-in visitor straight into the app instead of showing them a
 * login/signup form.
 *
 * Sessions last 30 days, but nothing on the way in ever checked for one: the landing
 * page is auth-unaware and /login rendered its form unconditionally. So a user with a
 * perfectly valid cookie would be shown "Log in", click it, and sign in again —
 * looking exactly like the app had logged them out.
 *
 * Returns `checking`: true until we know. Render a placeholder while it's true, or the
 * form flashes before the redirect.
 */
export function useRedirectIfAuthed(to = "/inbox"): boolean {
  const router = useRouter();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    api
      .me()
      .then(() => {
        if (!cancelled) router.replace(to);
      })
      // No session — or the API is unreachable. Either way, fall through to the form
      // rather than trapping someone on a spinner.
      .catch(() => {
        if (!cancelled) setChecking(false);
      });
    return () => {
      cancelled = true;
    };
  }, [router, to]);

  return checking;
}
