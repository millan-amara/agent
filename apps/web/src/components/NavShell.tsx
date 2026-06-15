"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { api, AuthError, type Me } from "@/lib/api";
import { useLocale } from "@/lib/i18n";

type Tab = { href: string; tkey: string; label: string; icon: string; mobileHidden?: boolean; ownerOnly?: boolean };
const TABS: Tab[] = [
  { href: "/dashboard", tkey: "nav.home", label: "Home", icon: "🏠" },
  { href: "/inbox", tkey: "nav.inbox", label: "Inbox", icon: "💬" },
  { href: "/pipeline", tkey: "nav.pipeline", label: "Pipeline", icon: "📋" },
  { href: "/appointments", tkey: "nav.bookings", label: "Bookings", icon: "📅" },
  { href: "/broadcasts", tkey: "nav.broadcasts", label: "Broadcasts", icon: "📣", mobileHidden: true },
  { href: "/contacts", tkey: "nav.contacts", label: "Contacts", icon: "👥", mobileHidden: true },
  { href: "/simulator", tkey: "nav.simulator", label: "Simulator", icon: "🧪", mobileHidden: true },
  { href: "/billing", tkey: "nav.billing", label: "Billing", icon: "💳", mobileHidden: true, ownerOnly: true },
  { href: "/settings", tkey: "nav.settings", label: "Settings", icon: "⚙️" },
];

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email"];

/**
 * Auth-aware shell. Public pages render bare; app pages get the nav and a
 * session guard (→ /login when unauthenticated, → /onboarding until complete).
 */
export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useLocale();
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
        if (m.locale && m.locale !== locale) setLocale(m.locale);
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
          {TABS.filter((tab) => !tab.ownerOnly || me?.role === "owner").map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                className={`rounded-card px-3 py-2 text-sm font-medium ${
                  active ? "bg-primary-soft text-primary-dark" : "text-muted hover:bg-canvas"
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {t(tab.tkey)}
              </Link>
            );
          })}
        </div>
        <div className="mx-2 mb-2 flex gap-1 text-xs">
          {(["en", "sw"] as const).map((l) => (
            <button
              key={l}
              onClick={() => setLocale(l)}
              className={`flex-1 rounded-card px-2 py-1 font-medium ${
                locale === l ? "bg-primary-soft text-primary-dark" : "text-muted hover:bg-canvas"
              }`}
            >
              {l === "en" ? "English" : "Kiswahili"}
            </button>
          ))}
        </div>
        <button
          onClick={() => void logout()}
          className="mx-2 mb-4 rounded-card px-3 py-2 text-left text-sm text-muted hover:bg-canvas"
        >
          {t("nav.logout")}
        </button>
      </nav>

      <main className="flex min-h-0 flex-1 flex-col">
        {me && !me.emailVerified && <VerifyBanner />}
        {me && <BillingBanner state={me.tenant.billing?.state} isOwner={me.role === "owner"} />}
        <div className="min-h-0 flex-1">{children}</div>
      </main>

      {/* Mobile bottom nav — five tabs max; the rest live on desktop */}
      <nav className="flex shrink-0 border-t border-line bg-white md:hidden">
        {TABS.filter((tab) => !tab.mobileHidden && (!tab.ownerOnly || me?.role === "owner")).map((tab) => {
          const active = pathname.startsWith(tab.href);
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs font-medium ${
                active ? "text-primary-dark" : "text-muted"
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {t(tab.tkey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

function BillingBanner({ state, isOwner }: { state?: string; isOwner: boolean }) {
  if (state !== "readonly" && state !== "over_limit") return null;
  const readonly = state === "readonly";
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-2 text-xs ${
        readonly ? "border-red-200 bg-red-50 text-danger" : "border-amber-200 bg-amber-50 text-warning"
      }`}
    >
      <span>
        {readonly
          ? "Your subscription is inactive — the app is read-only and your AI has paused."
          : "You've reached your plan's conversation limit — new conversations are paused."}
      </span>
      {isOwner && (
        <Link href="/billing" className="shrink-0 font-medium underline">
          {readonly ? "Subscribe" : "Upgrade"}
        </Link>
      )}
    </div>
  );
}

function VerifyBanner() {
  const [state, setState] = useState<"idle" | "sent">("idle");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-amber-200 bg-amber-50 px-4 py-2 text-xs text-warning">
      <span>Verify your email to secure your account — check your inbox for the link.</span>
      <button
        onClick={() => void api.resendVerification().then(() => setState("sent")).catch(() => {})}
        className="shrink-0 font-medium underline disabled:opacity-50"
        disabled={state === "sent"}
      >
        {state === "sent" ? "Sent ✓" : "Resend"}
      </button>
    </div>
  );
}
