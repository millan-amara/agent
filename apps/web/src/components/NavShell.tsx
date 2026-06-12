"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, AuthError, type Me } from "@/lib/api";

const TABS = [
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/pipeline", label: "Pipeline", icon: "📋" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
  { href: "/simulator", label: "Simulator", icon: "🧪" },
  { href: "/settings", label: "Settings", icon: "⚙️" },
];

const PUBLIC_PATHS = ["/login", "/signup"];

/**
 * Auth-aware shell. Public pages render bare; app pages get the nav and a
 * session guard (→ /login when unauthenticated, → /onboarding until complete).
 */
export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  const isPublic = PUBLIC_PATHS.some((p) => pathname.startsWith(p));
  const isOnboarding = pathname.startsWith("/onboarding");

  useEffect(() => {
    if (isPublic) {
      setChecked(true);
      return;
    }
    api
      .me()
      .then((m) => {
        setMe(m);
        setChecked(true);
        if (!m.tenant.onboarded && !isOnboarding) router.replace("/onboarding");
      })
      .catch((err) => {
        if (err instanceof AuthError) router.replace("/login");
        else setChecked(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  if (isPublic || isOnboarding) return <div className="h-dvh">{children}</div>;
  if (!checked) {
    return <div className="flex h-dvh items-center justify-center text-sm text-muted">Loading…</div>;
  }

  const logout = async () => {
    await api.logout().catch(() => {});
    router.replace("/login");
  };

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* Desktop rail */}
      <nav className="hidden w-48 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="px-4 py-5">
          <span className="text-lg font-semibold text-primary-dark">Azayon</span>
          {me && <p className="mt-0.5 truncate text-xs text-muted">{me.tenant.name}</p>}
        </div>
        <div className="flex flex-1 flex-col gap-1 px-2">
          {TABS.map((t) => {
            const active = pathname.startsWith(t.href);
            return (
              <Link
                key={t.href}
                href={t.href}
                className={`rounded-card px-3 py-2 text-sm font-medium ${
                  active ? "bg-primary-soft text-primary-dark" : "text-muted hover:bg-canvas"
                }`}
              >
                <span className="mr-2">{t.icon}</span>
                {t.label}
              </Link>
            );
          })}
        </div>
        <button
          onClick={() => void logout()}
          className="mx-2 mb-4 rounded-card px-3 py-2 text-left text-sm text-muted hover:bg-canvas"
        >
          Log out
        </button>
      </nav>

      <main className="min-h-0 flex-1">{children}</main>

      {/* Mobile bottom nav */}
      <nav className="flex shrink-0 border-t border-line bg-white md:hidden">
        {TABS.map((t) => {
          const active = pathname.startsWith(t.href);
          return (
            <Link
              key={t.href}
              href={t.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                active ? "text-primary-dark" : "text-muted"
              }`}
            >
              <span className="text-base leading-none">{t.icon}</span>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
