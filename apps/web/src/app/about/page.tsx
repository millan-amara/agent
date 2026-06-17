import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Wand2,
  UserCheck,
  MapPin,
  Tag,
  ShieldCheck,
  type LucideIcon,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { JsonLd } from "@/components/JsonLd";
import { Reveal } from "@/components/Reveal";
import { breadcrumbSchema } from "@/lib/structured-data";

const ABOUT_DESCRIPTION =
  "We're building the operating system for WhatsApp-first businesses, helping small and growing teams respond faster, sell better, and stay in control.";

export const metadata: Metadata = {
  title: "About",
  description: ABOUT_DESCRIPTION,
  alternates: { canonical: "/about" },
  openGraph: {
    url: "/about",
    title: "About Azayon",
    description: ABOUT_DESCRIPTION,
  },
};

const VALUES: { icon: LucideIcon; title: string; body: string }[] = [
  {
    icon: Wand2,
    title: "Practical automation",
    body: "Automate the busywork that actually slows businesses down, not novelty for its own sake.",
  },
  {
    icon: UserCheck,
    title: "Human control",
    body: "The owner stays in charge. The AI escalates, and sensitive actions can wait for a person.",
  },
  {
    icon: MapPin,
    title: "Local business realities",
    body: "KES pricing, M-Pesa, WhatsApp-first, built around how business is really done here.",
  },
  {
    icon: Tag,
    title: "Clear pricing",
    body: "Honest, predictable plans with no hidden fees and a free trial to start.",
  },
  {
    icon: ShieldCheck,
    title: "Trust with customer data",
    body: "Your data is yours. We protect it, we don't sell it, and you can export it anytime.",
  },
];

export default function AboutPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <JsonLd
        schema={breadcrumbSchema([
          { name: "Home", path: "/" },
          { name: "About", path: "/about" },
        ])}
      />
      <MarketingHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-24">
          <span className="az-fade-up inline-block text-xs font-semibold uppercase tracking-wide text-primary-600">
            About Azayon
          </span>
          <h1 className="az-fade-up az-delay-1 mt-3 text-4xl font-semibold leading-tight tracking-tight sm:text-5xl">
            We&apos;re building the operating system for WhatsApp-first businesses.
          </h1>
          <p className="az-fade-up az-delay-2 mt-5 text-lg leading-relaxed text-muted">
            Most business software is built around email, CRMs, and dashboards. But a huge number of
            businesses already sell, book, and get paid in one place: WhatsApp. Azayon is built for
            them.
          </p>
        </section>

        {/* Story */}
        <section className="border-y border-line bg-surface">
          <Reveal className="mx-auto max-w-3xl px-5 py-16 lg:py-20">
            <h2 className="text-2xl font-semibold tracking-tight">The story</h2>
            <div className="mt-5 space-y-4 text-[15px] leading-relaxed text-ink/80">
              <p>
                Walk through any market, clinic, salon, or workshop and you&apos;ll find the same
                thing: customers messaging on WhatsApp to ask prices, book slots, and confirm
                payments. It&apos;s where business actually happens.
              </p>
              <p>
                But the tools meant to help (CRMs, booking apps, invoicing software) are built for a
                different way of working. They assume email threads and web forms, not chat. So owners
                end up juggling a phone in one hand and three apps in the other, and leads slip through
                the cracks after hours.
              </p>
              <p>
                Azayon closes that gap. It answers WhatsApp instantly, qualifies leads, books
                appointments, sends invoices, and follows up on payments, while keeping the owner in
                control of anything that matters. The goal is simple: let a small team run like a much
                bigger one, without leaving the app their customers already use.
              </p>
            </div>
          </Reveal>
        </section>

        {/* Mission */}
        <section className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-20">
          <Reveal>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-primary-600">
              Our mission
            </h2>
            <p className="mt-4 text-2xl font-semibold leading-snug tracking-tight sm:text-3xl">
              Help small and growing teams respond faster, sell better, and stay in control.
            </p>
          </Reveal>
        </section>

        {/* Values */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
            <h2 className="text-2xl font-semibold tracking-tight">What we believe</h2>
            <Reveal stagger className="mt-10 grid gap-x-8 gap-y-8 sm:grid-cols-2 lg:grid-cols-3">
              {VALUES.map((v) => (
                <div key={v.title} className="flex gap-3.5">
                  <span className="grid size-10 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-700">
                    <v.icon className="size-5" />
                  </span>
                  <div>
                    <h3 className="text-base font-semibold">{v.title}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-muted">{v.body}</p>
                  </div>
                </div>
              ))}
            </Reveal>
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <Reveal className="overflow-hidden rounded-[20px] bg-gradient-to-br from-primary-700 to-primary-900 px-8 py-14 text-center text-white sm:px-12">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight">
              Built for businesses that run on WhatsApp.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-primary-100/85">
              Set up your AI, test it, and connect WhatsApp when you&apos;re ready.
            </p>
            <Link
              href="/signup"
              className="mt-7 inline-flex h-11 items-center justify-center gap-2 rounded-card bg-white px-6 text-sm font-semibold text-primary-800 shadow-card transition-colors hover:bg-primary-50"
            >
              Start free trial
              <ArrowRight className="size-[18px]" />
            </Link>
          </Reveal>
        </section>
      </main>
      <MarketingFooter />
    </div>
  );
}
