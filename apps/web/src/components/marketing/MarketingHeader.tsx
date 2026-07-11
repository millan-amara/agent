"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { api } from "@/lib/api";
import { LogoFull } from "@/components/Logo";
import { buttonStyles } from "@/components/ui/Button";

const NAV = [
  { href: "/#product", label: "Product" },
  { href: "/pricing", label: "Pricing" },
  { href: "/about", label: "About" },
  { href: "/#security", label: "Security" },
];

/** Sticky, restrained marketing header. Shared across public pages. */
export function MarketingHeader() {
  const [open, setOpen] = useState(false);
  // Sessions last 30 days, but this header used to offer "Log in" regardless — so a
  // signed-in user would click it and sign in all over again. Default to signed-out
  // (correct for SSR and crawlers) and swap once we know.
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

  return (
    <header className="sticky top-0 z-40 border-b border-line bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/70">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5">
        <Link href="/" aria-label="Azayon home">
          <LogoFull className="h-8" priority />
        </Link>

        <nav className="hidden items-center gap-7 md:flex">
          {NAV.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="text-sm font-medium text-muted hover:text-ink"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        <div className="hidden items-center gap-2 md:flex">
          {authed ? (
            <Link href="/dashboard" className={buttonStyles("primary", "md")}>
              Open Azayon
            </Link>
          ) : (
            <>
              <Link href="/login" className={buttonStyles("ghost", "md")}>
                Log in
              </Link>
              <Link href="/signup" className={buttonStyles("primary", "md")}>
                Start free trial
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          className="grid size-10 place-items-center rounded-card text-ink hover:bg-canvas md:hidden"
        >
          {open ? <X className="size-5" /> : <Menu className="size-5" />}
        </button>
      </div>

      {open && (
        <div className="border-t border-line bg-surface md:hidden">
          <nav className="mx-auto flex max-w-6xl flex-col gap-1 px-5 py-3">
            {NAV.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className="rounded-card px-3 py-2.5 text-sm font-medium text-ink hover:bg-canvas"
              >
                {item.label}
              </Link>
            ))}
            <div className="mt-2 flex flex-col gap-2 border-t border-line pt-3">
              {authed ? (
                <Link href="/dashboard" className={buttonStyles("primary", "lg")}>
                  Open Azayon
                </Link>
              ) : (
                <>
                  <Link href="/login" className={buttonStyles("secondary", "lg")}>
                    Log in
                  </Link>
                  <Link href="/signup" className={buttonStyles("primary", "lg")}>
                    Start free trial
                  </Link>
                </>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
