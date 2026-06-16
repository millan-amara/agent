import Link from "next/link";
import { LogoFull } from "@/components/Logo";

const COLUMNS = [
  {
    title: "Product",
    links: [
      { href: "/#product", label: "Features" },
      { href: "/pricing", label: "Pricing" },
      { href: "/#how", label: "How it works" },
      { href: "/#security", label: "Security" },
    ],
  },
  {
    title: "Company",
    links: [
      { href: "/about", label: "About" },
      { href: "/privacy", label: "Privacy" },
      { href: "/terms", label: "Terms" },
    ],
  },
  {
    title: "Get started",
    links: [
      { href: "/signup", label: "Start free trial" },
      { href: "/login", label: "Log in" },
    ],
  },
];

/** Dark deep-teal footer. Shared across public pages. */
export function MarketingFooter() {
  return (
    <footer className="bg-primary-900 text-primary-50">
      <div className="mx-auto max-w-6xl px-5 py-14">
        <div className="grid gap-10 sm:grid-cols-2 md:grid-cols-4">
          <div className="max-w-xs">
            <LogoFull className="h-8" white />
            <p className="mt-3 text-sm text-primary-100/80">
              The AI front desk for WhatsApp-first businesses. Reply, book, and collect
              payments — even when your team is busy.
            </p>
          </div>

          {COLUMNS.map((col) => (
            <div key={col.title}>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-primary-200/80">
                {col.title}
              </h3>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-primary-100/90 hover:text-white"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="mt-12 flex flex-col gap-2 border-t border-white/10 pt-6 text-xs text-primary-100/70 sm:flex-row sm:items-center sm:justify-between">
          <p>© 2026 Azayon. Built for businesses that run on WhatsApp.</p>
          <p>KES pricing · M-Pesa &amp; card payments</p>
        </div>
      </div>
    </footer>
  );
}
