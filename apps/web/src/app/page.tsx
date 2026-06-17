import type { Metadata } from "next";
import Link from "next/link";
import {
  ArrowRight,
  Building2,
  MessagesSquare,
  MessageCircle,
  Inbox,
  Columns3,
  CalendarCheck,
  Receipt,
  Megaphone,
  LayoutDashboard,
  ShieldCheck,
  UserCheck,
  Download,
  Lock,
  Users,
  Check,
  Clock,
  type LucideIcon,
} from "lucide-react";
import { buttonStyles } from "@/components/ui/Button";
import { MarketingHeader } from "@/components/marketing/MarketingHeader";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";
import { JsonLd } from "@/components/JsonLd";
import { Reveal } from "@/components/Reveal";
import { softwareApplicationSchema, faqSchema } from "@/lib/structured-data";

const HOME_DESCRIPTION =
  "Azayon helps businesses reply instantly, qualify customers, book appointments, send invoices, and collect payments from WhatsApp, even when your team is busy.";

export const metadata: Metadata = {
  // Absolute so the brand line isn't suffixed with the "· Azayon" template.
  title: { absolute: "Azayon: Your WhatsApp, answered. Leads booked. Payments followed up." },
  description: HOME_DESCRIPTION,
  alternates: { canonical: "/" },
  openGraph: {
    url: "/",
    title: "Azayon: Your WhatsApp, answered. Leads booked. Payments followed up.",
    description: HOME_DESCRIPTION,
  },
};

const FAQS = [
  {
    q: "Do I need a WhatsApp Business account?",
    a: "Yes. Azayon connects through the official WhatsApp Business API. We guide you through linking it during setup, and you can test everything before you connect.",
  },
  {
    q: "Can I test the AI before connecting WhatsApp?",
    a: "Absolutely. The built-in simulator lets you chat with your AI exactly as a customer would, so you can tune its answers before anyone messages you.",
  },
  {
    q: "Does Azayon support M-Pesa?",
    a: "Yes. Payment links work with M-Pesa and cards, so customers can pay invoices and deposits straight from the chat.",
  },
  {
    q: "Can a human take over a conversation?",
    a: "Any time. Replying manually pauses the AI on that conversation, and the AI also escalates to your team whenever it's unsure or a human is needed.",
  },
  {
    q: "What happens if the AI is unsure?",
    a: "It escalates instead of guessing. The conversation is flagged as needing a human so nothing sensitive goes out without your team.",
  },
  {
    q: "Is there a free trial, and can I cancel anytime?",
    a: "Every plan starts with a 14-day free trial, no card required. You can upgrade, downgrade, or cancel whenever you like.",
  },
];

export default function LandingPage() {
  return (
    <div className="min-h-dvh bg-canvas text-ink">
      <JsonLd schema={[softwareApplicationSchema, faqSchema(FAQS)]} />
      <MarketingHeader />
      <main>
        <Hero />
        <Problem />
        <HowItWorks />
        <Modules />
        <UseCases />
        <Trust />
        <Pricing />
        <FAQ />
        <FinalCTA />
      </main>
      <MarketingFooter />
    </div>
  );
}

/* ------------------------------------------------------------------ Hero */

function Hero() {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto grid max-w-6xl items-center gap-12 px-5 py-16 lg:grid-cols-[1.05fr_1fr] lg:py-24">
        <div>
          <span className="az-fade-up inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-1 text-xs font-medium text-muted">
            <span className="size-1.5 rounded-full bg-success" />
            Live in about 10 minutes
          </span>
          <h1 className="az-fade-up az-delay-1 mt-5 text-4xl font-semibold leading-[1.1] tracking-tight sm:text-5xl">
            Your WhatsApp, answered.
            <br />
            Leads booked.{" "}
            <span className="text-primary-600">Payments followed up.</span>
          </h1>
          <p className="az-fade-up az-delay-2 mt-5 max-w-xl text-lg leading-relaxed text-muted">
            Azayon helps businesses reply instantly, qualify customers, book appointments,
            send invoices, and collect payments from WhatsApp, even when your team is busy.
          </p>
          <div className="az-fade-up az-delay-3 mt-8 flex flex-col gap-3 sm:flex-row">
            <Link href="/signup" className={buttonStyles("primary", "lg")}>
              Start free trial
              <ArrowRight className="size-[18px]" />
            </Link>
            <a href="#how" className={buttonStyles("secondary", "lg")}>
              See how it works
            </a>
          </div>
          <p className="az-fade-up az-delay-4 mt-5 flex flex-wrap items-center gap-x-5 gap-y-1 text-sm text-muted">
            <span className="flex items-center gap-1.5">
              <Check className="size-4 text-primary-600" /> 14-day free trial
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-4 text-primary-600" /> KES pricing
            </span>
            <span className="flex items-center gap-1.5">
              <Check className="size-4 text-primary-600" /> No card required
            </span>
          </p>
        </div>

        <HeroMockup />
      </div>
    </section>
  );
}

/** Hand-built product mockup: a WhatsApp-style chat beside floating result cards. */
function HeroMockup() {
  return (
    <div className="az-fade-in az-delay-2 relative">
      <div className="rounded-[20px] bg-gradient-to-br from-primary-700 to-primary-900 p-4 shadow-pop sm:p-6">
        {/* Chat surface */}
        <div className="overflow-hidden rounded-2xl bg-[#ECE5DD]">
          <div className="flex items-center gap-3 bg-primary-800 px-4 py-3 text-white">
            <span className="grid size-9 place-items-center rounded-full bg-white/15 text-sm font-semibold">
              AW
            </span>
            <div className="leading-tight">
              <p className="text-sm font-semibold">Amina W.</p>
              <p className="text-[11px] text-primary-100/80">online · via Azayon</p>
            </div>
          </div>
          <div className="space-y-2.5 px-4 py-5">
            <Bubble side="in">Hi, do you have any slots for a facial this Saturday?</Bubble>
            <Bubble side="out">
              Hi Amina! Yes 👋 We have 11:00 and 14:30 open on Saturday. A classic facial is
              KES 3,500 (about 45 min). Which time works?
            </Bubble>
            <Bubble side="in">14:30 please</Bubble>
            <Bubble side="out">
              Booked you for Saturday 14:30 ✅ I&apos;ll send a reminder the day before. Want to
              pay the deposit now?
            </Bubble>
          </div>
        </div>
      </div>

      {/* Floating result cards */}
      <FloatCard className="az-float -left-3 top-6 sm:-left-6">
        <p className="text-xs text-muted">Collected this week</p>
        <p className="tnum text-lg font-semibold text-accent">KES 84,500</p>
      </FloatCard>
      <FloatCard className="az-float-slow -right-3 top-1/3 sm:-right-6">
        <p className="text-xs text-muted">Bookings this week</p>
        <p className="tnum text-lg font-semibold text-ink">12</p>
      </FloatCard>
      <FloatCard className="az-float -right-2 bottom-6 sm:-right-5">
        <p className="flex items-center gap-1.5 text-xs font-medium text-attention">
          <span className="size-1.5 rounded-full bg-attention" /> 4 conversations need you
        </p>
      </FloatCard>
    </div>
  );
}

function Bubble({ side, children }: { side: "in" | "out"; children: React.ReactNode }) {
  const isOut = side === "out";
  return (
    <div className={`flex ${isOut ? "justify-end" : "justify-start"}`}>
      <p
        className={`max-w-[80%] rounded-2xl px-3.5 py-2 text-sm leading-snug shadow-sm ${
          isOut ? "rounded-br-md bg-[#D9FDD3] text-ink" : "rounded-bl-md bg-white text-ink"
        }`}
      >
        {children}
      </p>
    </div>
  );
}

function FloatCard({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <div
      className={`absolute hidden rounded-card border border-line bg-surface px-3.5 py-2.5 shadow-panel sm:block ${className}`}
    >
      {children}
    </div>
  );
}

/* --------------------------------------------------------------- Problem */

function Problem() {
  const items = [
    {
      title: "Missed messages become lost sales",
      body: "Customers message after hours and on weekends. Every unanswered chat is a customer who books somewhere else.",
    },
    {
      title: "Manual follow-up eats the day",
      body: "Chasing quotes, reminders, and payments by hand is slow, and the ones that slip through never come back.",
    },
    {
      title: "Bookings and payments scatter",
      body: "Slots in one place, invoices in another, conversations in a third. Nothing connects, so things fall through.",
    },
  ];
  return (
    <section className="border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-20">
        <Reveal className="max-w-2xl">
          <Eyebrow>The problem</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Customers message after hours. Staff miss follow-ups. Payments get delayed.
          </h2>
        </Reveal>
        <Reveal stagger className="mt-10 grid gap-6 md:grid-cols-3">
          {items.map((it) => (
            <div key={it.title} className="rounded-card border border-line bg-canvas p-6">
              <h3 className="text-base font-semibold">{it.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{it.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------- How it works */

function HowItWorks() {
  const steps: { icon: LucideIcon; step: string; title: string; body: string }[] = [
    {
      icon: Building2,
      step: "1",
      title: "Tell Azayon about your business",
      body: "Services, prices, hours, FAQs, tone, and policies. No code, just describe how you work.",
    },
    {
      icon: MessagesSquare,
      step: "2",
      title: "Test your AI",
      body: "Chat with it in the simulator before any customer does. Tune the answers until they feel right.",
    },
    {
      icon: MessageCircle,
      step: "3",
      title: "Connect WhatsApp",
      body: "Azayon replies, books, follows up, and escalates to your team the moment a human is needed.",
    },
  ];
  return (
    <section id="how" className="scroll-mt-20">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow>How it works</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            From setup to answering customers in three steps
          </h2>
        </Reveal>
        <Reveal stagger className="mt-12 grid gap-8 md:grid-cols-3">
          {steps.map((s) => (
            <div key={s.step} className="relative">
              <div className="flex items-center gap-3">
                <span className="grid size-11 place-items-center rounded-card bg-primary-soft text-primary-700">
                  <s.icon className="size-5" />
                </span>
                <span className="text-sm font-semibold text-muted">Step {s.step}</span>
              </div>
              <h3 className="mt-4 text-lg font-semibold">{s.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Modules */

function Modules() {
  const mods: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: Inbox,
      title: "Inbox",
      body: "AI replies, human handoff, lead status, and full conversation history in one shared place.",
    },
    {
      icon: Columns3,
      title: "Pipeline",
      body: "Watch every lead move from new to qualified to booked, with nothing forgotten in a chat thread.",
    },
    {
      icon: CalendarCheck,
      title: "Bookings",
      body: "Let customers schedule straight through chat, with reminders sent automatically.",
    },
    {
      icon: Receipt,
      title: "Invoices & payments",
      body: "Send proper line-item invoices and collect M-Pesa or card payments from a link.",
    },
    {
      icon: Megaphone,
      title: "Broadcasts",
      body: "Reach customers with approved WhatsApp templates: offers, reminders, and updates.",
    },
    {
      icon: LayoutDashboard,
      title: "Dashboard",
      body: "See revenue, leads, bookings, and follow-ups at a glance: the health of your business.",
    },
  ];
  return (
    <section id="product" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <Reveal className="max-w-2xl">
          <Eyebrow>The product</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Everything your WhatsApp front desk needs
          </h2>
          <p className="mt-4 text-lg text-muted">
            One system for conversations, bookings, and money, instead of three tools that
            don&apos;t talk to each other.
          </p>
        </Reveal>
        <Reveal stagger className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {mods.map((m) => (
            <div
              key={m.title}
              className="rounded-card border border-line bg-canvas p-6 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card"
            >
              <span className="grid size-10 place-items-center rounded-card bg-primary-soft text-primary-700">
                <m.icon className="size-5" />
              </span>
              <h3 className="mt-4 text-base font-semibold">{m.title}</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-muted">{m.body}</p>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* -------------------------------------------------------------- UseCases */

function UseCases() {
  const cases = [
    "Clinics & wellness providers",
    "Salons & beauty businesses",
    "Tutors & training centers",
    "Agencies & consultants",
    "Repair, logistics & services",
    "Shops taking orders on WhatsApp",
  ];
  return (
    <section className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
      <div className="grid items-center gap-10 lg:grid-cols-[1fr_1.1fr]">
        <Reveal>
          <Eyebrow>Who it&apos;s for</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Built for businesses that already run on chat
          </h2>
          <p className="mt-4 text-lg leading-relaxed text-muted">
            If your customers already ask questions, request prices, book slots, or confirm
            payments on WhatsApp, Azayon fits into how your business already works.
          </p>
        </Reveal>
        <Reveal stagger className="grid gap-3 sm:grid-cols-2">
          {cases.map((c) => (
            <div
              key={c}
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-sm font-medium shadow-card transition-transform duration-200 hover:-translate-y-0.5"
            >
              <Check className="size-4 shrink-0 text-primary-600" />
              {c}
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- Trust */

function Trust() {
  const controls: { icon: LucideIcon; title: string; body: string }[] = [
    {
      icon: UserCheck,
      title: "Human handoff when needed",
      body: "The AI escalates to your team the moment it's unsure or a conversation gets sensitive.",
    },
    {
      icon: ShieldCheck,
      title: "Payment approval controls",
      body: "Sensitive actions like collecting money can require a human to approve before they go out.",
    },
    {
      icon: Users,
      title: "Team roles & access",
      body: "Give each person the right level of access, with an audit trail of who did what.",
    },
    {
      icon: MessageCircle,
      title: "Conversation guardrails",
      body: "Your AI stays on-topic, on-brand, and within the policies you set during setup.",
    },
    {
      icon: Download,
      title: "Export your data",
      body: "Your contacts, conversations, and records are yours. Export them whenever you want.",
    },
    {
      icon: Lock,
      title: "Official WhatsApp connection",
      body: "Connects through the WhatsApp Business API, with no unofficial workarounds or risky hacks.",
    },
  ];
  return (
    <section id="security" className="scroll-mt-20 bg-primary-900 text-white">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <Reveal className="max-w-2xl">
          <span className="text-xs font-semibold uppercase tracking-wide text-primary-200/80">
            Trust &amp; control
          </span>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Automation where it helps. Control where it matters.
          </h2>
          <p className="mt-4 text-lg text-primary-100/85">
            Azayon handles the busywork, but you stay in charge of customer data, payments, and
            every sensitive moment.
          </p>
        </Reveal>
        <Reveal stagger className="mt-10 grid gap-x-8 gap-y-7 sm:grid-cols-2 lg:grid-cols-3">
          {controls.map((c) => (
            <div key={c.title} className="flex gap-3.5">
              <span className="grid size-10 shrink-0 place-items-center rounded-card bg-white/10 text-primary-100">
                <c.icon className="size-5" />
              </span>
              <div>
                <h3 className="text-base font-semibold">{c.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-primary-100/80">{c.body}</p>
              </div>
            </div>
          ))}
        </Reveal>
      </div>
    </section>
  );
}

/* --------------------------------------------------------------- Pricing */

const PLANS = [
  {
    tier: "starter",
    name: "Starter",
    priceKes: "2,500",
    blurb: "For solo businesses starting with WhatsApp automation.",
    convos: "150 conversations / month",
    popular: false,
  },
  {
    tier: "growth",
    name: "Growth",
    priceKes: "7,500",
    blurb: "For busy teams handling more leads and payments.",
    convos: "750 conversations / month",
    popular: true,
  },
  {
    tier: "pro",
    name: "Pro",
    priceKes: "20,000",
    blurb: "For higher-volume businesses and larger teams.",
    convos: "3,000 conversations / month",
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

function Pricing() {
  return (
    <section id="pricing" className="scroll-mt-20 border-y border-line bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-16 lg:py-24">
        <Reveal className="mx-auto max-w-2xl text-center">
          <Eyebrow className="justify-center">Pricing</Eyebrow>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
            Simple pricing for WhatsApp-first businesses
          </h2>
          <p className="mt-4 text-lg text-muted">
            Every plan includes the full toolkit. Pick the size that matches your volume, and
            change it anytime.
          </p>
        </Reveal>

        <Reveal stagger className="mt-12 grid items-start gap-6 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.tier}
              className={`relative rounded-card bg-canvas p-7 transition-transform duration-200 hover:-translate-y-1 ${
                plan.popular
                  ? "border-2 border-primary-500 shadow-panel"
                  : "border border-line"
              }`}
            >
              {plan.popular && (
                <span className="absolute -top-3 left-7 rounded-full bg-primary-600 px-3 py-1 text-xs font-semibold text-white">
                  Most popular
                </span>
              )}
              <h3 className="text-lg font-semibold">{plan.name}</h3>
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
          All plans include a 14-day free trial. No card required to start.
        </p>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------- FAQ */

function FAQ() {
  return (
    <section className="mx-auto max-w-3xl px-5 py-16 lg:py-24">
      <Reveal className="text-center">
        <Eyebrow className="justify-center">FAQ</Eyebrow>
        <h2 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
          Questions, answered
        </h2>
      </Reveal>
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
    </section>
  );
}

/* -------------------------------------------------------------- FinalCTA */

function FinalCTA() {
  return (
    <section className="mx-auto max-w-6xl px-5 pb-20">
      <Reveal className="overflow-hidden rounded-[20px] bg-gradient-to-br from-primary-700 to-primary-900 px-8 py-14 text-center text-white sm:px-12 lg:py-20">
        <h2 className="mx-auto max-w-2xl text-3xl font-semibold tracking-tight sm:text-4xl">
          Put your WhatsApp to work.
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-lg text-primary-100/85">
          Start with your business details, test your AI, and connect WhatsApp when you&apos;re
          ready.
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            href="/signup"
            className="inline-flex h-11 items-center justify-center gap-2 rounded-card bg-white px-6 text-sm font-semibold text-primary-800 shadow-card transition-colors hover:bg-primary-50"
          >
            Start free trial
            <ArrowRight className="size-[18px]" />
          </Link>
          <Link
            href="/login"
            className="inline-flex h-11 items-center justify-center rounded-card border border-white/25 px-6 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            Log in
          </Link>
        </div>
        <p className="mt-5 flex items-center justify-center gap-1.5 text-sm text-primary-100/75">
          <Clock className="size-4" /> Live in about 10 minutes
        </p>
      </Reveal>
    </section>
  );
}

/* --------------------------------------------------------------- Helpers */

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={`flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-primary-600 ${className}`}
    >
      {children}
    </span>
  );
}
