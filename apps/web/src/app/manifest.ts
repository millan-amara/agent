import type { MetadataRoute } from "next";
import { SITE } from "@/lib/site";

/** PWA / web app manifest. Also feeds richer install + theming metadata. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: SITE.name,
    short_name: SITE.name,
    description: SITE.description,
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#0F5132",
    // 192 + 512 (any) satisfy Android/Chrome installability; the maskable variant
    // fills Android's adaptive-icon mask (padded onto the brand-green square so the
    // logo stays inside the ~80% safe zone after the OS crops it).
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
