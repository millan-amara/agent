"use client";

import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Home,
  MessagesSquare,
  Columns3,
  Calendar,
  Receipt,
  Megaphone,
  Users,
  FlaskConical,
  CreditCard,
  Settings,
  LogOut,
  AlertTriangle,
  MailWarning,
  Loader2,
  Info,
  ExternalLink,
  X,
  type LucideIcon,
} from "lucide-react";
import { api, AuthError, type Me } from "@/lib/api";
import { useLocale } from "@/lib/i18n";
import { Logo } from "@/components/Logo";

type Tab = {
  href: string;
  tkey: string;
  label: string;
  Icon: LucideIcon;
  group: "main" | "secondary";
  mobileHidden?: boolean;
  ownerOnly?: boolean;
};

const TABS: Tab[] = [
  { href: "/dashboard", tkey: "nav.home", label: "Home", Icon: Home, group: "main" },
  { href: "/inbox", tkey: "nav.inbox", label: "Inbox", Icon: MessagesSquare, group: "main" },
  { href: "/pipeline", tkey: "nav.pipeline", label: "Pipeline", Icon: Columns3, group: "main" },
  { href: "/appointments", tkey: "nav.bookings", label: "Bookings", Icon: Calendar, group: "main" },
  { href: "/invoices", tkey: "nav.invoices", label: "Invoices", Icon: Receipt, group: "main", mobileHidden: true },
  { href: "/broadcasts", tkey: "nav.broadcasts", label: "Broadcasts", Icon: Megaphone, group: "main", mobileHidden: true },
  { href: "/contacts", tkey: "nav.contacts", label: "Contacts", Icon: Users, group: "main", mobileHidden: true },
  { href: "/simulator", tkey: "nav.simulator", label: "Simulator", Icon: FlaskConical, group: "secondary", mobileHidden: true },
  { href: "/billing", tkey: "nav.billing", label: "Billing", Icon: CreditCard, group: "secondary", mobileHidden: true, ownerOnly: true },
  { href: "/settings", tkey: "nav.settings", label: "Settings", Icon: Settings, group: "secondary" },
];

const PUBLIC_PATHS = ["/login", "/signup", "/forgot-password", "/reset-password", "/verify-email", "/i/"];
// Public marketing pages — rendered bare (own header/footer), no auth, allowed to scroll.
const MARKETING_PATHS = ["/pricing", "/about", "/privacy", "/terms"];

export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { t, locale, setLocale } = useLocale();
  const [me, setMe] = useState<Me | null>(null);
  const [checked, setChecked] = useState(false);

  const isMarketing = pathname === "/" || MARKETING_PATHS.some((p) => pathname === p);
  const isPublic = isMarketing || PUBLIC_PATHS.some((p) => pathname.startsWith(p));
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
  }, [pathname]);

  if (isMarketing) return <>{children}</>;
  if (isPublic || isOnboarding) return <div className="h-dvh">{children}</div>;
  if (!checked) {
    return (
      <div className="flex h-dvh items-center justify-center text-sm text-muted">Loading…</div>
    );
  }

  const logout = async () => {
    await api.logout().catch(() => {});
    router.replace("/login");
  };

  const visible = TABS.filter((tab) => !tab.ownerOnly || me?.role === "owner");
  const mainTabs = visible.filter((tab) => tab.group === "main");
  const secondaryTabs = visible.filter((tab) => tab.group === "secondary");

  const NavLink = ({ tab }: { tab: Tab }) => {
    const active = pathname.startsWith(tab.href);
    return (
      <Link
        href={tab.href}
        aria-current={active ? "page" : undefined}
        className={`group relative flex items-center gap-3 rounded-card px-3 py-2 text-sm font-medium ${
          active ? "bg-primary-soft text-primary-700" : "text-muted hover:bg-canvas hover:text-ink"
        }`}
      >
        {active && (
          <span className="absolute inset-y-1.5 left-0 w-0.5 rounded-full bg-primary-600" />
        )}
        <NavIcon Icon={tab.Icon} active={active} />
        {t(tab.tkey)}
      </Link>
    );
  };

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* Desktop rail */}
      <nav className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="px-4 py-5">
          <Logo />
          {me && <p className="mt-2 truncate text-xs text-muted">{me.tenant.name}</p>}
        </div>

        <div className="flex flex-1 flex-col gap-0.5 px-3">
          {mainTabs.map((tab) => (
            <NavLink key={tab.href} tab={tab} />
          ))}

          <div className="my-2 border-t border-line" />

          {secondaryTabs.map((tab) => (
            <NavLink key={tab.href} tab={tab} />
          ))}
        </div>

        <button
          onClick={() => void logout()}
          className="mx-3 mb-4 flex items-center gap-3 rounded-card px-3 py-2 text-left text-sm font-medium text-muted hover:bg-canvas hover:text-ink"
        >
          <LogOut className="size-[18px] shrink-0" strokeWidth={2} />
          {t("nav.logout")}
        </button>
      </nav>

      <main className="flex min-h-0 flex-1 flex-col">
        {me && !me.emailVerified && <VerifyBanner />}
        {me && <BillingBanner state={me.tenant.billing?.state} isOwner={me.role === "owner"} />}
        {me && <OldPlatformBanner />}
        <div className="min-h-0 flex-1">{children}</div>
      </main>

      {/* Mobile bottom nav — five tabs max; the rest live on desktop */}
      <nav className="flex shrink-0 border-t border-line bg-surface md:hidden">
        {visible
          .filter((tab) => !tab.mobileHidden)
          .map((tab) => {
            const active = pathname.startsWith(tab.href);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`flex flex-1 flex-col items-center gap-1 py-2 text-[11px] font-medium ${
                  active ? "text-primary-700" : "text-muted"
                }`}
              >
                <NavIcon Icon={tab.Icon} active={active} size="size-5" inherit />
                {t(tab.tkey)}
              </Link>
            );
          })}
      </nav>
    </div>
  );
}

/** Nav icon that flips to a spinner while its link's navigation is pending. */
function NavIcon({
  Icon,
  active,
  size = "size-[18px]",
  inherit = false,
}: {
  Icon: LucideIcon;
  active: boolean;
  size?: string;
  inherit?: boolean;
}) {
  const { pending } = useLinkStatus();
  if (pending) return <Loader2 className={`${size} shrink-0 animate-spin`} />;
  if (inherit) return <Icon className={`${size} shrink-0`} strokeWidth={active ? 2.25 : 2} />;
  return (
    <Icon
      className={`${size} shrink-0 ${active ? "text-primary-600" : "text-muted group-hover:text-ink"}`}
      strokeWidth={active ? 2.25 : 2}
    />
  );
}

function BillingBanner({ state, isOwner }: { state?: string; isOwner: boolean }) {
  if (state !== "readonly" && state !== "over_limit") return null;
  const readonly = state === "readonly";
  return (
    <div
      className={`flex items-center justify-between gap-3 border-b px-4 py-2.5 text-xs ${
        readonly
          ? "border-danger/20 bg-danger-soft text-danger"
          : "border-warning/20 bg-warning-soft text-warning"
      }`}
    >
      <span className="flex items-center gap-2">
        <AlertTriangle className="size-4 shrink-0" />
        {readonly
          ? "Your subscription is inactive — the app is read-only and your AI has paused."
          : "You've reached your plan's conversation limit — new conversations are paused."}
      </span>
      {isOwner && (
        <Link href="/billing" className="shrink-0 font-semibold underline underline-offset-2">
          {readonly ? "Subscribe" : "Upgrade"}
        </Link>
      )}
    </div>
  );
}

/**
 * Soft, dismissible notice pointing users to the previous Azayon platform —
 * for anyone whose data didn't fully migrate or who simply prefers it. Temporary;
 * dismissal is remembered per-browser so it doesn't nag.
 */
function OldPlatformBanner() {
  // Default hidden so dismissed users never see a flash before storage is read.
  const [dismissed, setDismissed] = useState(true);
  useEffect(() => {
    setDismissed(localStorage.getItem("azayon_old_platform_dismissed") === "1");
  }, []);
  if (dismissed) return null;
  return (
    <div className="flex items-center justify-between gap-3 border-b border-line bg-primary-soft px-4 py-2.5 text-xs text-primary-800">
      <span className="flex items-center gap-2">
        <Info className="size-4 shrink-0" />
        Looking for something from the old Azayon? You can still use the previous platform while we
        finish moving everything over.
      </span>
      <span className="flex shrink-0 items-center gap-3">
        <a
          href="https://azayon-crm-client.netlify.app"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-semibold underline underline-offset-2"
        >
          Open old platform
          <ExternalLink className="size-3.5" />
        </a>
        <button
          onClick={() => {
            localStorage.setItem("azayon_old_platform_dismissed", "1");
            setDismissed(true);
          }}
          aria-label="Dismiss"
          className="text-primary-700/70 hover:text-primary-800"
        >
          <X className="size-4" />
        </button>
      </span>
    </div>
  );
}

function VerifyBanner() {
  const [state, setState] = useState<"idle" | "sent">("idle");
  return (
    <div className="flex items-center justify-between gap-3 border-b border-warning/20 bg-warning-soft px-4 py-2.5 text-xs text-warning">
      <span className="flex items-center gap-2">
        <MailWarning className="size-4 shrink-0" />
        Verify your email to secure your account — check your inbox for the link.
      </span>
      <button
        onClick={() => void api.resendVerification().then(() => setState("sent")).catch(() => {})}
        className="shrink-0 font-semibold underline underline-offset-2 disabled:opacity-50"
        disabled={state === "sent"}
      >
        {state === "sent" ? "Sent ✓" : "Resend"}
      </button>
    </div>
  );
}
