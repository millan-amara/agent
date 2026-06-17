import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/**
 * Allow crawling of the public marketing site, but keep the authenticated app
 * and hosted invoice pages out of the index — they require a session or a
 * private token and have no SEO value.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/api/",
          "/dashboard",
          "/inbox",
          "/contacts",
          "/pipeline",
          "/appointments",
          "/invoices",
          "/billing",
          "/broadcasts",
          "/settings",
          "/simulator",
          "/onboarding",
          "/login",
          "/signup",
          "/forgot-password",
          "/reset-password",
          "/verify-email",
          "/i/",
        ],
      },
    ],
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
