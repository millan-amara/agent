/**
 * Seeds the Azayon house tenant — the automations business we sell *with*, run on
 * the product itself. Idempotent: re-run it after any copy edit.
 *
 * It writes only what the settings UI would write, and validates through the same
 * `businessProfileSchema` / `normalizeProfile` the API uses, so a bad edit fails here
 * rather than at the first inbound message.
 *
 *   npx tsx scripts/seed-azayon-tenant.ts --email you@example.com          (preview)
 *   npx tsx scripts/seed-azayon-tenant.ts --email you@example.com --yes    (write)
 *   npx tsx scripts/seed-azayon-tenant.ts --tenant <tenantId> --yes
 *   npx tsx scripts/seed-azayon-tenant.ts --email x --password y --create --yes
 *
 * It previews unless you pass --yes. That guard matters: the same owner email maps to
 * a *different* tenant in dev than in prod, and this overwrites the profile in place.
 * Read the "Target:" line before confirming.
 *
 * Payments are left deliberately disconnected: with `paystackSecretKey` set the agent
 * gains create_invoice, and the plan prices are *subscriptions* billed through
 * Azayon's own Paystack plans — a one-off AI invoice for "Growth" would have to be
 * unwound by hand. Money goes through a human.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { businessProfileSchema, normalizeProfile } from "../src/agent/prompt.js";
import { PLANS } from "../src/billing.js";

// Target the DB explicitly when SEED_DATABASE_URL is set. Prisma otherwise resolves
// DATABASE_URL through .env, which points at dev SQLite — the reason an earlier "prod"
// seed silently rewrote the dev database instead.
const db = new PrismaClient(
  process.env.SEED_DATABASE_URL ? { datasourceUrl: process.env.SEED_DATABASE_URL } : {},
);

const arg = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i === -1 ? undefined : process.argv[i + 1];
};
const has = (flag: string) => process.argv.includes(flag);

// Renders directly into the system prompt: "You are the WhatsApp assistant for ___".
const TENANT_NAME = arg("--name") ?? "Azayon";

/**
 * Only written when --stages is passed. Off by default and deliberately so: a live
 * tenant's stage names carry real pipeline position (Klick had 18 contacts on
 * "Signed Up"), and Contact.stage stores the NAME — so dropping a stage silently
 * dumps everyone on it back to the first one. Rewriting a populated pipeline is a
 * data migration, not a config change. Check the preview's "Current pipeline" table.
 */
const STAGES = [
  "New Lead",
  "Qualified",
  "Call Booked",
  "Trial Started",
  "Proposal Sent",
  "Won",
  "Lost",
];

/**
 * Carries each existing lead to its equivalent position in STAGES. Without this, a
 * contact on a dropped stage falls back to STAGES[0] — which would have reset 18
 * signed-up customers to "New Lead". Any stage NOT listed here falls back, loudly.
 */
const STAGE_MAP: Record<string, string> = {
  "New Lead": "New Lead",
  Contacted: "Qualified",
  "First Followup": "Qualified",
  "Second Followup": "Qualified",
  "Demo Scheduled": "Call Booked",
  // They've had the demo and are deciding — "Proposal Sent" is the closest
  // waiting-on-them bucket in the new list. The old name was more precise.
  "Demo Done": "Proposal Sent",
  "Signed Up": "Trial Started",
  "Team Onboarded": "Won",
  Won: "Won",
  Lost: "Lost",
};

const FOLLOW_UP_CONFIG = {
  enabled: true,
  // 4h catches the ad-click who got distracted while intent is still warm — inside
  // the 24h window, so the agent composes it freely. 24h/72h are the cool-down nudges.
  delaysHours: [4, 24, 72],
  // Must be an approved WhatsApp template before any nudge can land outside the 24h
  // window; until then `sendClosedWindowFollowUp` marks those follow-ups "skipped".
  templateId: "",
};

const BOOKING_CONFIG = {
  enabled: true,
  slotMinutes: 15,
  daysAhead: 14,
  hours: {
    0: null,
    1: { start: "09:00", end: "18:00" },
    2: { start: "09:00", end: "18:00" },
    3: { start: "09:00", end: "18:00" },
    4: { start: "09:00", end: "18:00" },
    5: { start: "09:00", end: "18:00" },
    6: { start: "10:00", end: "14:00" },
  },
};

const DESCRIPTION = `Azayon sets up WhatsApp automation for Kenyan businesses: a customer messages them and gets a real answer in seconds, day or night, while their details land in a CRM, not a lost chat thread.

WHO YOU ARE
You are Hughes's automated assistant. Hughes builds and sets these systems up. Speak as the assistant — for anything a human does (scoping a build, quoting, negotiating, the setup call), refer to Hughes in the third person: "Hughes will scope that and come back with a number." Never pretend to be him, and never imply there's a team: it's one person.

Be upfront that you're automated, early and without apology. This conversation is a live demo of the product. A customer realising "a bot handled me this whole time, and it was good" is the most persuasive thing that can happen here. Don't hide it and don't be embarrassed by it.

HOW TO WRITE
Default to 1-3 short lines. Go longer only if they've genuinely asked "how does it work" or "compare the plans" — then use short bullet lines, never a block paragraph. Answer first, then ask the single next thing you need.

HOW TO HANDLE AN INQUIRY
Most people here clicked an ad and know nothing. Don't pitch. Find out what business they run and what's going wrong, then answer in terms of their problem. Work toward these, one at a time:
1. What kind of business?
2. Roughly how many WhatsApp inquiries a week — 10, 50, 200?
3. Who replies to those today, and how fast?
4. What annoys them most — slow replies, lost leads, repeating answers, no follow-up?
Once you have 2-3, recommend ONE plan and say why. Don't list all three unless asked to compare.

WHAT TO SAVE (use these exact field names with update_lead)
business_name, industry, team_size, inquiries_per_week, who_replies_now, main_pain, budget, timeline, location, project_type, referral_source
Save each the moment you learn it.

TALKING ABOUT THE PRODUCT
Sell the outcome, not the software: "we'll set up your automatic replies and your CRM", not "you'll be using a platform called Azayon". But if they ask what it's called, whether it's an app, or how it works — say plainly: it's Azayon, they get a web dashboard, and their WhatsApp number keeps working as now, on the same phone. Never be cagey.

If they ask whether they're talking to a human or a bot, tell the truth: you're Azayon's automated assistant, a live demo of the exact thing we'd set up for them — and offer to bring Hughes in.

CUSTOM WORK (anything not on the plans)
Some want something else: an internal-process automation, a system wired to tools they use, or a website. Don't turn them away and don't quote them.

Get the specifics — you're briefing a human, so be concrete. What exactly should it do? How is it handled today? What tools do they use? When do they need it? For a website: how many pages, what should it DO (information, bookings, payments, logins?), and do they have a domain, branding, content?

Don't interrogate. Ask at most TWO rounds of questions, then hand over even if details are missing — Hughes fills gaps on the call. A custom-work lead that never reaches him is the worst thing you can do.

By your second reply at the latest: save everything with update_lead (project_type, main_pain), move them forward with set_stage, say it starts from KES 20,000 depending on scope and that Hughes will come back with a proper quote, then escalate_to_human. Never put a number on it.

HAND OVER TO A HUMAN (escalate_to_human) WHEN
- They want custom automation or a website.
- They ask for a discount or terms not listed here.
- They're an agency or reseller, or want to onboard several businesses.
- They ask anything about pricing or capability not answered here.
- They're ready to buy and want to talk to someone.
- They're frustrated, or they ask for a person.

Handing over pauses you: you will NOT see their next message. So that reply must answer what they just asked and say Hughes will come back to them personally. End there — a question you can't answer reads as being ignored.`;

const SERVICES = [
  { name: "Free trial", price: "Free for 7 days — no card needed, up to 10 conversations" },
  { name: "Starter", price: "KES 3,000 per month — up to 150 customer conversations a month, 1 user" },
  { name: "Growth", price: "KES 7,500 per month — up to 500 customer conversations a month, up to 5 users" },
  { name: "Pro", price: "KES 20,000 per month — up to 1,500 customer conversations a month, unlimited users" },
  { name: "Setup & onboarding", price: "KES 5,000 one-off — waived if you start a paid plan in your first week" },
  { name: "Custom automation build", price: "From KES 20,000 — scoped and quoted by Hughes after a short call" },
  { name: "Website / web app", price: "From KES 20,000 — scoped and quoted by Hughes after a short call" },
];

const FAQS = [
  {
    q: "Do I need a new phone number?",
    a: "No. We use your existing WhatsApp Business number. It keeps working on your phone exactly as it does now — you can still read and reply to any chat yourself, any time. The assistant just handles what you don't get to.",
  },
  {
    q: "Will I lose control? Can I take over a conversation?",
    a: "Any time. You open the chat, reply, and the assistant steps back for that customer. It also hands over to you on its own when someone asks for a human, gets frustrated, or asks something it can't answer.",
  },
  {
    q: "How long does setup take?",
    a: "Usually the same day. We go through your services, prices and common questions on a short call, and it's live once your WhatsApp is connected.",
  },
  {
    q: "How does it know about my business?",
    a: "You tell it once — what you sell, your prices, your opening hours, and the questions customers always ask. It answers from that and only that. If it doesn't know something, it says so and flags it for you rather than making something up.",
  },
  {
    q: "Will it make up prices or promise things I can't deliver?",
    a: "No. It can only quote prices you've given it. Anything outside that, it tells the customer it will check and passes it to you.",
  },
  {
    q: "What is a conversation?",
    a: "One customer who messages you in a calendar month, no matter how many messages they send. Ten messages from the same person is still one conversation.",
  },
  {
    q: "What happens if I go over my plan's conversations?",
    a: "Your existing conversations keep running. New customers that month won't get an automatic reply until you move up a plan — nothing gets deleted and nothing breaks.",
  },
  {
    q: "Can it book appointments?",
    a: "Yes. It offers real open times from your calendar, books the slot, and can reschedule or cancel when the customer asks. It won't offer a time that isn't actually free.",
  },
  {
    q: "Does it follow up with people who go quiet?",
    a: "Yes — automatically, after a few hours and again over the next days, referencing what you were actually talking about. That's usually where the extra sales come from.",
  },
  {
    q: "Can it reply in Swahili?",
    a: "Yes. It replies in whatever the customer writes in — English, Swahili, or a mix.",
  },
  {
    q: "Do I need a computer?",
    a: "No. You get a dashboard you can open on your phone, and a daily summary on WhatsApp: leads today, who's waiting on you, what's overdue.",
  },
  {
    q: "Is my customer data safe?",
    a: "Your data is yours. It's stored securely, it isn't shared with other businesses, and you can export all of it or delete it whenever you want.",
  },
  {
    q: "Can I cancel?",
    a: "Yes, any time. It's month to month, no contract.",
  },
  {
    q: "How is this different from a WhatsApp auto-reply or a chatbot with buttons?",
    a: "An auto-reply says 'thanks, we'll get back to you'. This actually answers the question, works out what the customer wants, saves them to your CRM, and follows up if they go quiet. No menus, no 'press 1'.",
  },
];

const NEVER_SAY = [
  "Never quote a price for a custom automation or a website — those start from KES 20,000 and must be scoped by Hughes.",
  "Never promise a delivery date or timeline for custom work.",
  "Never offer a discount, a free month, an extended trial, or a payment plan.",
  "Never guarantee results, revenue, or a percentage increase in sales.",
  "Never say a business will 'never miss a lead again' or make any other absolute promise.",
  "Never invent a client, a case study, a testimonial, or a number of businesses using this.",
  "Never say 'our team', 'our engineers', or anything implying a company bigger than one person.",
  "Never name, criticise, or compare us against a competitor.",
  "Never claim we connect to a tool or platform that isn't listed above.",
  "Never ask for a password, an M-Pesa PIN, or card details.",
  // The model would promise a callback in Swahili while skipping the tool, leaving a
  // lead that thinks it's been handed over and an owner who never sees it flagged.
  "Never tell a customer that Hughes will look at it, quote them, check, or get back to them unless you actually called escalate_to_human in that same turn. Saying it is not doing it — the promise is worthless without the tool call.",
  "Never send a second message when the customer hasn't replied to your first.",
];

const RAW_PROFILE = {
  description: DESCRIPTION,
  services: SERVICES,
  faqs: FAQS,
  tone: "Like a sharp, friendly Kenyan founder texting back — never a brochure or a call-centre script. Mirror their register: casual or Sheng if they are, crisp and professional if they're formal. Answer first, then ask one thing. Never open with 'Thank you for reaching out.' At most one emoji.",
  languages:
    "Reply in whatever the customer uses — English, Swahili, or mixed Sheng. Once they write in Swahili or Sheng, STAY in it for the rest of the conversation; never drift back to English. Money always in KES.",
  neverSay: NEVER_SAY,
  bookingInfo:
    "Free 15-minute call (WhatsApp or phone) with Hughes: he looks at how the business handles inquiries today and shows exactly what the setup would do for them. No obligation, no card.",
  businessHours: "Mon–Sat, 8am–6pm EAT. Automated replies run 24/7.",
};

async function main() {
  // Preview by default. The same owner email resolves to a different tenant in dev
  // than in prod, and this overwrites a profile in place — so writing is opt-in.
  const dry = !has("--yes");

  const plan = arg("--plan");
  if (plan && !PLANS[plan as keyof typeof PLANS]) {
    console.error(`Unknown plan "${plan}". Valid: ${Object.keys(PLANS).join(", ")}`);
    process.exit(1);
  }

  // Validate through the app's own schema first — a field over its cap fails here,
  // not at the first inbound message.
  const parsed = businessProfileSchema.safeParse(RAW_PROFILE);
  if (!parsed.success) {
    console.error("Profile failed validation:");
    for (const issue of parsed.error.issues) {
      console.error(`  ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  const profile = normalizeProfile(parsed.data);

  const invoiceable = profile.services?.filter((s) => s.amountKes !== undefined) ?? [];
  console.log(`Profile OK — ${profile.services?.length ?? 0} services, ${profile.faqs?.length ?? 0} FAQs, ${profile.neverSay?.length ?? 0} never-say rules.`);
  console.log(`description ${DESCRIPTION.length}/4000 chars, tone ${RAW_PROFILE.tone.length}/300, languages ${RAW_PROFILE.languages.length}/300`);
  console.log(
    invoiceable.length
      ? `Parsed as a fixed invoiceable amount: ${invoiceable.map((s) => `${s.name}=${s.amountKes}`).join(", ")}`
      : "No service parsed as a fixed invoiceable amount (all are ranges/rates) — the agent must escalate for every quote.",
  );

  // --- resolve the target tenant -------------------------------------------------
  const tenantId = arg("--tenant");
  const email = arg("--email")?.toLowerCase();
  let tenant = tenantId
    ? await db.tenant.findUnique({ where: { id: tenantId } })
    : email
      ? (await db.user.findUnique({ where: { email }, include: { tenant: true } }))?.tenant ?? null
      : null;

  if (!tenant && has("--create")) {
    const password = arg("--password");
    if (!email || !password) throw new Error("--create needs --email and --password");
    if (dry) {
      console.log(`\n[dry] would CREATE tenant "${TENANT_NAME}" with owner ${email}`);
      return;
    }
    tenant = await db.tenant.create({
      data: {
        name: TENANT_NAME,
        vertical: "general",
        businessProfile: JSON.stringify(profile),
        stages: JSON.stringify(STAGES),
        trialEndsAt: new Date(Date.now() + 7 * 86_400_000),
      },
    });
    await db.user.create({
      data: {
        email,
        passwordHash: await bcrypt.hash(password, 10),
        tenantId: tenant.id,
        role: "owner",
      },
    });
    console.log(`\nCreated tenant ${tenant.id} with owner ${email}`);
  }

  if (!tenant) {
    console.error("\nNo tenant found. Pass --tenant <id>, or --email <owner email>, or add --create --password <pw>.");
    process.exit(1);
  }

  const contacts = await db.contact.count({ where: { tenantId: tenant.id } });
  console.log(`\nTarget:   ${tenant.name} (${tenant.id}) — ${contacts} contact(s)`);
  console.log(`Plan:     ${tenant.plan}${tenant.planTier ? ` / ${tenant.planTier}` : ""}${tenant.trialEndsAt ? ` (trial ends ${tenant.trialEndsAt.toISOString().slice(0, 10)})` : ""}`);
  console.log(`Stages:   ${JSON.parse(tenant.stages || "[]").join(" → ")}`);

  const byStage = await db.contact.groupBy({
    by: ["stage"],
    where: { tenantId: tenant.id },
    _count: { _all: true },
  });
  const rewriteStages = has("--stages");
  const fate = (s: string) => {
    if (!rewriteStages) return "keep";
    const to = STAGE_MAP[s];
    if (!to) return "\x1b[31mUNMAPPED → New Lead (position lost)\x1b[0m";
    return to === s ? "keep" : `→ ${to}`;
  };
  console.log(`Current pipeline:${rewriteStages ? "" : "  (unchanged — pass --stages to rewrite)"}`);
  for (const row of byStage.sort((a, b) => b._count._all - a._count._all)) {
    console.log(`  ${String(row._count._all).padStart(3)}  ${row.stage.padEnd(20)} ${fate(row.stage)}`);
  }
  const target = process.env.SEED_DATABASE_URL ?? process.env.DATABASE_URL ?? "?";
  console.log(`DB:       ${target.replace(/:\/\/[^:]+:[^@]+@/, "://***:***@")}`);
  if (tenant.name !== TENANT_NAME) {
    console.log(`Rename:   "${tenant.name}" → "${TENANT_NAME}"  (this is what the agent calls itself; pass --name to change)`);
  }
  if (tenant.paystackSecretKey) {
    console.warn(
      "WARNING: this tenant has a Paystack key set, so the agent has create_invoice. Plan prices are subscriptions — clear the key in Settings → Payments.",
    );
  }

  // --- stage migration -----------------------------------------------------------
  // Contacts store the stage NAME, so every contact on a stage we're dropping must be
  // carried to its mapped equivalent. Anything unmapped falls back to STAGES[0], which
  // loses its pipeline position — so say so loudly rather than doing it quietly.
  const moves: Array<{ from: string; to: string; count: number; mapped: boolean }> = [];
  if (rewriteStages) {
    for (const row of byStage) {
      if (STAGES.includes(row.stage) && STAGE_MAP[row.stage] === row.stage) continue;
      const mapped = STAGE_MAP[row.stage];
      moves.push({
        from: row.stage,
        to: mapped ?? STAGES[0]!,
        count: row._count._all,
        mapped: Boolean(mapped),
      });
    }
    if (moves.length) {
      console.log("\nStage migration:");
      for (const m of moves) {
        const flag = m.mapped ? "" : "  \x1b[31m← UNMAPPED, position lost\x1b[0m";
        console.log(`  ${String(m.count).padStart(3)}  ${m.from.padEnd(20)} → ${m.to}${flag}`);
      }
    }
    const unmapped = moves.filter((m) => !m.mapped);
    if (unmapped.length && !has("--force-unmapped")) {
      console.error(
        `\nRefusing: ${unmapped.length} stage(s) have no entry in STAGE_MAP, so their leads would be reset to "${STAGES[0]}".`,
      );
      console.error("Add them to STAGE_MAP, or pass --force-unmapped if the reset is genuinely intended.");
      process.exit(1);
    }
  }

  if (dry) {
    console.log("\nPreview only — nothing written. Re-run with --yes to apply.");
    return;
  }

  await db.$transaction([
    db.tenant.update({
      where: { id: tenant.id },
      data: {
        name: TENANT_NAME,
        businessProfile: JSON.stringify(profile),
        ...(rewriteStages ? { stages: JSON.stringify(STAGES) } : {}),
        followUpConfig: JSON.stringify(FOLLOW_UP_CONFIG),
        bookingConfig: JSON.stringify(BOOKING_CONFIG),
        aiEnabled: true,
        // Manual plan set. cancelAtPeriodEnd stays false and planRenewsAt null so the
        // billing sweep's lapse step (which only touches cancelAtPeriodEnd) leaves it be.
        ...(plan ? { plan: "active", planTier: plan, cancelAtPeriodEnd: false } : {}),
      },
    }),
    // One updateMany per source stage, inside the same transaction as the stages
    // rewrite — so the pipeline and the contacts on it can never disagree.
    ...moves.map((m) =>
      db.contact.updateMany({
        where: { tenantId: tenant.id, stage: m.from },
        data: { stage: m.to },
      }),
    ),
  ]);

  console.log("\nSeeded:");
  console.log(`  name            ${TENANT_NAME}`);
  console.log(`  stages          ${rewriteStages ? STAGES.join(" → ") : "left unchanged"}`);
  if (plan) {
    const p = PLANS[plan as keyof typeof PLANS]!;
    console.log(`  plan            active / ${plan} — KES ${p.priceKes}/mo, ${p.convLimit} conversations/month`);
  }
  console.log(`  follow-ups      on, at ${FOLLOW_UP_CONFIG.delaysHours.join("h / ")}h  (no closed-window template yet)`);
  console.log(`  booking         on, ${BOOKING_CONFIG.slotMinutes}-min slots, ${BOOKING_CONFIG.daysAhead} days ahead`);
  console.log(`  payments        left disconnected — the agent cannot invoice`);
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());
