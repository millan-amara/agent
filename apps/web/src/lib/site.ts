/**
 * Single source of truth for SEO-facing site metadata. The production origin can
 * be overridden with NEXT_PUBLIC_SITE_URL (inlined at build time) but defaults to
 * the live domain so canonical/OG/sitemap URLs are correct even if the env var is
 * missing at build time.
 */
export const SITE = {
  name: "Azayon",
  legalName: "Peskaya Limited",
  url: (process.env.NEXT_PUBLIC_SITE_URL || "https://azayon.com").replace(/\/+$/, ""),
  tagline: "Your WhatsApp, answered. Leads booked. Payments followed up.",
  description:
    "Azayon is the AI front desk for WhatsApp-first businesses: reply instantly, qualify leads, book appointments, send invoices, and collect M-Pesa or card payments, all from WhatsApp.",
  email: "hello@azayon.com",
  locale: "en_KE",
  /** Used for OpenGraph locale and Organization area served. */
  country: "Kenya",
  keywords: [
    "WhatsApp CRM",
    "WhatsApp automation",
    "AI WhatsApp assistant",
    "WhatsApp Business API",
    "lead capture",
    "appointment booking WhatsApp",
    "M-Pesa payment links",
    "WhatsApp chatbot Kenya",
    "small business automation Kenya",
    "WhatsApp invoicing",
  ],
} as const;

/** Absolute URL for a path on the site (path should start with "/"). */
export function absoluteUrl(path = "/"): string {
  if (path === "/") return `${SITE.url}/`;
  return `${SITE.url}${path.startsWith("/") ? path : `/${path}`}`;
}
