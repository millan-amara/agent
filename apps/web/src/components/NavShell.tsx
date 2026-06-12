"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/inbox", label: "Inbox", icon: "💬" },
  { href: "/pipeline", label: "Pipeline", icon: "📋" },
  { href: "/contacts", label: "Contacts", icon: "👥" },
];

/** Mobile: bottom tab bar. Desktop: slim left rail. The inbox is the heart. */
export function NavShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="flex h-dvh flex-col md:flex-row">
      {/* Desktop rail */}
      <nav className="hidden w-48 shrink-0 flex-col border-r border-line bg-white md:flex">
        <div className="px-4 py-5">
          <span className="text-lg font-semibold text-primary-dark">Azayon</span>
        </div>
        <div className="flex flex-col gap-1 px-2">
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
