/**
 * schema.org node builders for rich results. Nodes reference the Organization and
 * WebSite by "@id" so a page can emit just the page-specific nodes while still
 * pointing back at the sitewide entities (which the root layout always renders).
 */
import { SITE, absoluteUrl } from "./site";

const ORG_ID = `${SITE.url}/#organization`;
const WEBSITE_ID = `${SITE.url}/#website`;

/** The publisher of everything, rendered on every page from the root layout. */
export const organizationSchema = {
  "@type": "Organization",
  "@id": ORG_ID,
  name: SITE.name,
  legalName: SITE.legalName,
  url: SITE.url,
  email: SITE.email,
  description: SITE.description,
  logo: {
    "@type": "ImageObject",
    url: absoluteUrl("/icon.png"),
  },
  areaServed: { "@type": "Country", name: SITE.country },
  contactPoint: {
    "@type": "ContactPoint",
    email: SITE.email,
    contactType: "customer support",
    areaServed: "KE",
    availableLanguage: ["en", "sw"],
  },
};

/** The website entity, rendered on every page from the root layout. */
export const websiteSchema = {
  "@type": "WebSite",
  "@id": WEBSITE_ID,
  url: SITE.url,
  name: SITE.name,
  description: SITE.description,
  inLanguage: "en",
  publisher: { "@id": ORG_ID },
};

/** Plan pricing, mirrored from the pricing page, used to build the offer list. */
const PLANS = [
  { name: "Starter", price: "3000", description: "For solo businesses starting with WhatsApp automation." },
  { name: "Growth", price: "7500", description: "For busy teams handling more leads and payments." },
  { name: "Pro", price: "20000", description: "For higher-volume businesses and larger teams." },
] as const;

/**
 * The product itself, as a SaaS SoftwareApplication with the three plans as an
 * AggregateOffer (KES). No aggregateRating/review is included because none is
 * real. Google requires those to be genuine, on-site, and verifiable.
 */
export const softwareApplicationSchema = {
  "@type": "SoftwareApplication",
  name: SITE.name,
  applicationCategory: "BusinessApplication",
  operatingSystem: "Web, iOS, Android",
  url: SITE.url,
  description: SITE.description,
  provider: { "@id": ORG_ID },
  offers: {
    "@type": "AggregateOffer",
    priceCurrency: "KES",
    lowPrice: "3000",
    highPrice: "20000",
    offerCount: PLANS.length,
    offers: PLANS.map((plan) => ({
      "@type": "Offer",
      name: `${plan.name} plan`,
      description: plan.description,
      price: plan.price,
      priceCurrency: "KES",
      url: absoluteUrl("/pricing"),
      availability: "https://schema.org/InStock",
    })),
  },
};

/** Build a FAQPage node from a list of question/answer pairs. */
export function faqSchema(faqs: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@type": "FAQPage",
    mainEntity: faqs.map((f) => ({
      "@type": "Question",
      name: f.q,
      acceptedAnswer: { "@type": "Answer", text: f.a },
    })),
  };
}

/** Build a BreadcrumbList node from an ordered list of crumbs. */
export function breadcrumbSchema(items: ReadonlyArray<{ name: string; path: string }>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: absoluteUrl(item.path),
    })),
  };
}
