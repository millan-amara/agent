import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { NavShell } from "@/components/NavShell";
import { LocaleProvider } from "@/lib/i18n";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter" });

export const metadata: Metadata = {
  title: "Azayon",
  description: "WhatsApp-first AI lead system",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans">
        <LocaleProvider>
          <NavShell>{children}</NavShell>
        </LocaleProvider>
      </body>
    </html>
  );
}
