import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Check, Minus } from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { JsonLd } from "@/components/JsonLd";
import { Reveal } from "@/components/Reveal";
import { softwareApplicationSchema, faqSchema, breadcrumbSchema } from "@/lib/structured-data";

const PRICING_DESCRIPTION =
  "Simple KES pricing for WhatsApp-first businesses. Every plan includes the full toolkit: AI replies, inbox, bookings, invoices, payments, and broadcasts. 7-day free trial.";

export const metadata: Metadata = {
  title: "Pricing",
  description: PRICING_DESCRIPTION,
  alternates: { canonical: "/pricing" },
  openGraph: {
    url: "/pricing",
    title: "Pricing · Azayon",
    description: PRICING_DESCRIPTION,
  },
};

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    priceKes: "2,500",
    blurb: "For solo businesses starting with WhatsApp automation.",
    convos: "150 conversations / month",
    seats: "1 team member",
    popular: false,
  },
  {
    tier: "growth",
    name: "Growth",
    priceKes: "7,500",
    blurb: "For busy teams handling more leads and payments.",
    convos: "750 conversations / month",
    seats: "Up to 5 team members",
    popular: true,
  },
  {
    tier: "pro",
    name: "Pro",
    priceKes: "20,000",
    blurb: "For higher-volume businesses and larger teams.",
    convos: "3,000 conversations / month",
    seats: "Unlimited team members",
    popular: false,
  },
];

const PLAN_FEATURES = [
  "AI WhatsApp replies",
  "Lead inbox & pipeline",
  "Bookings & reminders",
  "Invoices & payment links",
  "Automated follow-ups",
  "Broadcast templates",
];

type Row = { label: string; values: [string | boolean, string | boolean, string | boolean] };

const COMPARISON: { group: string; rows: Row[] }[] = [
  {
    group: "Usage",
    rows: [
      { label: "Conversations / month", values: ["150", "750", "3,000"] },
      { label: "Team members", values: ["1", "Up to 5", "Unlimited"] },
      { label: "WhatsApp Business connection", values: [true, true, true] },
    ],
  },
  {
    group: "Automation",
    rows: [
      { label: "AI WhatsApp replies", values: [true, true, true] },
      { label: "Lead inbox & pipeline", values: [true, true, true] },
      { label: "Bookings & reminders", values: [true, true, true] },
      { label: "Automated follow-ups", values: [true, true, true] },
      { label: "Knowledge base", values: [true, true, true] },
    ],
  },
  {
    group: "Money",
    rows: [
      { label: "Invoices & line items", values: [true, true, true] },
      { label: "M-Pesa & card payment links", values: [true, true, true] },
      { label: "Payment approval controls", values: [false, true, true] },
    ],
  },
  {
    group: "Reach & control",
    rows: [
      { label: "Broadcast templates", values: [true, true, true] },
      { label: "Roles & audit trail", values: [false, true, true] },
      { label: "Data export", values: [true, true, true] },
      { label: "Priority support", values: [false, false, true] },
    ],
  },
];

const FAQS = [
  {
    q: "What counts as a conversation?",
    a: "An active conversation is a customer who sends at least one message in a calendar month. Multiple messages from the same customer in that month still count as one.",
  },
  {
    q: "What happens if I go over my limit?",
    a: "New conversations are paused until the next billing cycle or until you upgrade, but your existing conversations keep working, so no one is left hanging.",
  },
  {
    q: "Is there a free trial?",
    a: "Yes. Every plan starts with a 7-day free trial of the full Service — up to 15 conversations — and no card is required to begin.",
  },
  {
    q: "Can I change or cancel my plan?",
    a: "Any time, from your account. Upgrades take effect immediately; downgrades and cancellations take effect at the end of your current billing period.",
  },
  {
    q: "How do payments work?",
    a: "Subscriptions are billed in KES through Paystack. Separately, the M-Pesa and card payment links you send to your own customers settle directly to your Paystack account.",
  },
];

export default function PricingPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <JsonLd
        schema={[
          softwareApplicationSchema,
          faqSchema(FAQS),
          breadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Pricing", path: "/pricing" },
          ]),
        ]}
      />
      <MarketingHeader />
      <main>
        {/* Hero */}
        <section className="mx-auto max-w-3xl px-5 py-16 text-center lg:py-20">
          <span className="az-fade-up inline-block text-xs font-semibold uppercase tracking-wide text-primary-600">
            Pricing
          </span>
          <h1 className="az-fade-up az-delay-1 mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Simple pricing for WhatsApp-first businesses
          </h1>
          <p className="az-fade-up az-delay-2 mt-4 text-lg text-muted">
            Every plan includes the full toolkit. Pick the size that matches your volume, and change
            it anytime. All prices in KES.
          </p>
        </section>

        {/* Cards */}
        <section className="mx-auto max-w-6xl px-5">
          <Reveal stagger className="grid items-start gap-6 lg:grid-cols-3">
            {PLANS.map((plan) => (
              <div
                key={plan.tier}
                className={`relative rounded-card bg-surface p-7 transition-transform duration-200 hover:-translate-y-1 ${
                  plan.popular ? "border-2 border-primary-500 shadow-panel" : "border border-line"
                }`}
              >
                {plan.popular && (
                  <span className="absolute -top-3 left-7 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">
                    Most popular
                  </span>
                )}
                <h2 className="text-lg font-semibold">{plan.name}</h2>
                <p className="mt-1 min-h-10 text-sm text-muted">{plan.blurb}</p>
                <p className="mt-5 flex items-baseline gap-1.5">
                  <span className="tnum text-3xl font-semibold tracking-tight">
                    KES {plan.priceKes}
                  </span>
                  <span className="text-sm text-muted">/ month</span>
                </p>
                <p className="mt-1 text-sm font-medium text-primary-700">{plan.convos}</p>
                <Link
                  href="/signup"
                  className={`mt-6 w-full ${buttonStyles(plan.popular ? "primary" : "secondary", "lg")}`}
                >
                  Start free trial
                </Link>
                <ul className="mt-6 space-y-2.5">
                  <li className="flex items-center gap-2.5 text-sm">
                    <Check className="size-4 shrink-0 text-primary-600" />
                    {plan.seats}
                  </li>
                  {PLAN_FEATURES.map((f) => (
                    <li key={f} className="flex items-center gap-2.5 text-sm">
                      <Check className="size-4 shrink-0 text-primary-600" />
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </Reveal>
          <p className="mt-8 text-center text-sm text-muted">
            All plans include a 7-day free trial. No card required to start.
          </p>
        </section>

        {/* Comparison table */}
        <section className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
          <h2 className="text-2xl font-semibold tracking-tight">Compare plans</h2>
          <Reveal className="mt-6 overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-sm">
              <thead>
                <tr className="border-b border-line">
                  <th className="w-2/5 py-4 text-left font-semibold">Feature</th>
                  {PLANS.map((p) => (
                    <th key={p.tier} className="px-3 py-4 text-center font-semibold">
                      {p.name}
                      <span className="block text-xs font-normal text-muted">
                        KES {p.priceKes}/mo
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {COMPARISON.map((section) => (
                  <FeatureGroup key={section.group} group={section.group} rows={section.rows} />
                ))}
              </tbody>
            </table>
          </Reveal>
        </section>

        {/* FAQ */}
        <section className="border-t border-line bg-surface">
          <div className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
            <h2 className="text-center text-3xl font-semibold tracking-tight">Pricing questions</h2>
            <Reveal stagger className="mt-10 divide-y divide-line border-y border-line">
              {FAQS.map((f) => (
                <details key={f.q} className="group py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-base font-semibold">
                    {f.q}
                    <span className="grid size-6 shrink-0 place-items-center rounded-full border border-line text-muted transition-transform group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-relaxed text-muted">{f.a}</p>
                </details>
              ))}
            </Reveal>
          </div>
        </section>

        {/* CTA band */}
        <section className="mx-auto max-w-6xl px-5 py-16">
          <Reveal className="overflow-hidden rounded-[20px] bg-gradient-to-br from-primary-700 to-primary-900 px-8 py-14 text-center text-white sm:px-12">
            <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight">
              Start free, upgrade when you grow.
            </h2>
            <p className="mx-auto mt-3 max-w-xl text-lg text-primary-100/85">
              Set up your AI, test it, and connect WhatsApp, all within your 7-day trial.
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

function FeatureGroup({ group, rows }: { group: string; rows: Row[] }) {
  return (
    <>
      <tr>
        <td
          colSpan={4}
          className="pb-2 pt-7 text-xs font-semibold uppercase tracking-wide text-muted"
        >
          {group}
        </td>
      </tr>
      {rows.map((row) => (
        <tr key={row.label} className="border-b border-line">
          <td className="py-3 text-ink/80">{row.label}</td>
          {row.values.map((v, i) => (
            <td key={i} className="px-3 py-3 text-center">
              <Cell value={v} />
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}

function Cell({ value }: { value: string | boolean }) {
  if (value === true)
    return <Check className="mx-auto size-4 text-primary-600" aria-label="Included" />;
  if (value === false)
    return <Minus className="mx-auto size-4 text-line-strong" aria-label="Not included" />;
  return <span className="font-medium">{value}</span>;
}
