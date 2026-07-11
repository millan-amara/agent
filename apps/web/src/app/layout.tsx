import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavShell } from "@/components/NavShell";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { LocaleProvider } from "@/lib/i18n";
import { JsonLd } from "@/components/JsonLd";
import { SITE } from "@/lib/site";
import { organizationSchema, websiteSchema } from "@/lib/structured-data";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  // Makes every relative canonical/OG/Twitter URL in child pages absolute.
  metadataBase: new URL(SITE.url),
  title: {
    default: `${SITE.name}: ${SITE.tagline}`,
    template: `%s · ${SITE.name}`,
  },
  description: SITE.description,
  applicationName: SITE.name,
  keywords: [...SITE.keywords],
  authors: [{ name: SITE.legalName }],
  creator: SITE.legalName,
  publisher: SITE.legalName,
  category: "technology",
  // iOS ignores the web manifest's standalone/name fields — these drive the
  // "Add to Home Screen" launch behaviour on iPhone/iPad.
  appleWebApp: {
    capable: true,
    title: SITE.name,
    statusBarStyle: "default",
  },
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE.name,
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
    url: SITE.url,
    locale: SITE.locale,
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE.name}: ${SITE.tagline}`,
    description: SITE.description,
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0F5132",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        {/* Sitewide structured data: publisher + website, referenced by @id
            from per-page nodes (SoftwareApplication, FAQPage, Breadcrumb). */}
        <JsonLd schema={[organizationSchema, websiteSchema]} />
        <ServiceWorkerRegister />
        <LocaleProvider>
          <NavShell>{children}</NavShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
