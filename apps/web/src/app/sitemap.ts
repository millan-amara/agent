import type { MetadataRoute } from "next";
import { SITE, absoluteUrl } from "@/lib/site";

/**
 * Public marketing pages only. Authenticated app routes (dashboard, inbox, etc.)
 * are intentionally excluded and blocked in robots.ts. Mirrors the priorities of
 * the previously-submitted sitemap so Search Console sees a consistent picture.
 */
const lastModified = new Date("2026-06-17");

const PAGES: ReadonlyArray<{
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
}> = [
  { path: "/", changeFrequency: "weekly", priority: 1.0 },
  { path: "/pricing", changeFrequency: "monthly", priority: 0.9 },
  { path: "/about", changeFrequency: "monthly", priority: 0.7 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.4 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.4 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return PAGES.map((page) => ({
    url: absoluteUrl(page.path),
    lastModified,
    changeFrequency: page.changeFrequency,
    priority: page.priority,
  }));
}
