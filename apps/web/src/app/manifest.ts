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
    icons: [
      { src: "/icon.png", sizes: "120x120", type: "image/png" },
      { src: "/apple-icon.png", sizes: "120x120", type: "image/png", purpose: "any" },
    ],
  };
}
