import type { Tenant } from "@prisma/client";
import { config } from "./config.js";
import { db } from "./db.js";
import { fetchWithTimeout } from "./http.js";
import { sendEmail } from "./email.js";

/**
 * Azayon subscription billing. Tenants get a 7-day full trial, then must
 * subscribe to a tier (metered by active conversations/month = a contact with
 * ≥1 inbound message that month). Over the tier limit → new conversations are
 * soft-blocked (existing keep working). Expired trial / past_due → read-only.
 *
 * Subscriptions run on Azayon's OWN Paystack account (PAYSTACK_PLATFORM_SECRET),
 * which is separate from each tenant's paystackSecretKey used to collect from
 * their customers. Enforcement works with or without Paystack configured.
 */
const PAYSTACK = "https://api.paystack.co";

export type TierId = "starter" | "growth" | "pro";

export interface PlanDef {
  tier: TierId;
  name: string;
  priceKes: number;
  convLimit: number;
  planCode: string | undefined;
}

/**
 * Conversation cap during the free trial. Keeps a trial from running an entire
 * business for a week — once hit, the trial goes `over_limit` (same enforcement
 * as a paid plan over its cap: the AI stops auto-replying to new-this-month
 * contacts) until the tenant subscribes. 10 conversations is enough to see real
 * leads captured (~KES 68 of LLM cost) without funding a free business.
 */
export const TRIAL_CONV_LIMIT = 10;

/**
 * The tiers. Measured LLM cost is ~KES 6.8 per 6-turn conversation, and it is
 * FLAT — it does not fall with volume. So the price per conversation must never
 * approach it. The previous ladder discounted per-conversation price as volume
 * rose (Starter 16.67 → Growth 10.00 → Pro 6.67/conv) with no cost curve behind
 * it, which put Pro underwater at its own cap: the best customers were the least
 * profitable. Caps are now set so every tier clears ~15 KES/conversation or more.
 *
 * IMPORTANT: `priceKes` is for display and margin maths only. What a subscriber
 * is actually CHARGED is whatever the matching Paystack plan (`planCode`) says —
 * createSubscriptionCheckout sends the plan code, not an amount. Change a price
 * here and you must change it in the Paystack dashboard too, or the two silently
 * disagree.
 */
export const PLANS: Record<TierId, PlanDef> = {
  // 20.00 KES/conversation → ~66% margin
  starter: { tier: "starter", name: "Starter", priceKes: 3_000, convLimit: 150, planCode: config.PAYSTACK_PLAN_STARTER },
  // 15.00 KES/conversation → ~55% margin
  growth: { tier: "growth", name: "Growth", priceKes: 7_500, convLimit: 500, planCode: config.PAYSTACK_PLAN_GROWTH },
  // 13.33 KES/conversation → ~49% margin. Deliberately the cheapest per
  // conversation: the ladder must reward volume, or upgrading reads as a
  // downgrade and no one moves up.
  pro: { tier: "pro", name: "Pro", priceKes: 20_000, convLimit: 1_500, planCode: config.PAYSTACK_PLAN_PRO },
};

export type BillingState = "trial" | "active" | "over_limit" | "readonly";

export interface BillingStatus {
  state: BillingState;
  plan: string;
  planTier: TierId | null;
  conversationCount: number;
  limit: number | null; // null during trial (no cap)
  trialEndsAt: Date | null;
  planRenewsAt: Date | null;
  cancelAtPeriodEnd: boolean;
}

export function monthStart(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Active conversations this month: distinct real contacts with an inbound msg. */
export async function activeConversationCount(tenantId: string): Promise<number> {
  const rows = await db.message.findMany({
    where: {
      tenantId,
      direction: "in",
      createdAt: { gte: monthStart() },
      contact: { isSimulated: false },
    },
    select: { contactId: true },
    distinct: ["contactId"],
  });
  return rows.length;
}

export async function billingStatus(tenant: Tenant): Promise<BillingStatus> {
  const conversationCount = await activeConversationCount(tenant.id);
  const tier = (tenant.planTier as TierId | null) ?? null;

  if (tenant.plan === "active" && tier && PLANS[tier]) {
    const limit = PLANS[tier].convLimit;
    return {
      state: conversationCount >= limit ? "over_limit" : "active",
      plan: tenant.plan,
      planTier: tier,
      conversationCount,
      limit,
      trialEndsAt: tenant.trialEndsAt,
      planRenewsAt: tenant.planRenewsAt,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
    };
  }

  // A null trialEndsAt means "trial, no expiry set" (seeded/legacy tenants) —
  // treat as on-trial, not expired. Only a past date ends the trial.
  const onTrial =
    tenant.plan === "trial" && (tenant.trialEndsAt === null || tenant.trialEndsAt > new Date());
  if (onTrial) {
    // The trial is full-featured but capped at TRIAL_CONV_LIMIT conversations
    // this month; past the cap it behaves like an over-limit paid plan.
    return {
      state: conversationCount >= TRIAL_CONV_LIMIT ? "over_limit" : "trial",
      plan: tenant.plan,
      planTier: tier,
      conversationCount,
      limit: TRIAL_CONV_LIMIT,
      trialEndsAt: tenant.trialEndsAt,
      planRenewsAt: tenant.planRenewsAt,
      cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
    };
  }
  return {
    state: "readonly",
    plan: tenant.plan,
    planTier: tier,
    conversationCount,
    limit: tier ? PLANS[tier]?.convLimit ?? null : null,
    trialEndsAt: tenant.trialEndsAt,
    planRenewsAt: tenant.planRenewsAt,
    cancelAtPeriodEnd: tenant.cancelAtPeriodEnd,
  };
}

/** Can the tenant send any outbound right now? (false in read-only.) */
export const canSend = (s: BillingState): boolean => s !== "readonly";

/** Can the AI auto-reply to a conversation created this month? */
export const canAutoReplyNew = (s: BillingState): boolean => s !== "readonly" && s !== "over_limit";

export const platformBillingConfigured = Boolean(config.PAYSTACK_PLATFORM_SECRET);

/**
 * Starts a Paystack subscription checkout on the platform account for a tier.
 * Returns the hosted authorization URL. Throws when not configured.
 */
export async function createSubscriptionCheckout(
  tenant: Tenant,
  email: string,
  tier: TierId,
): Promise<string> {
  const plan = PLANS[tier];
  if (!config.PAYSTACK_PLATFORM_SECRET || !plan?.planCode) {
    throw new Error("Subscription billing is not configured yet.");
  }
  const res = await fetchWithTimeout(`${PAYSTACK}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.PAYSTACK_PLATFORM_SECRET}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      plan: plan.planCode,
      currency: "KES",
      callback_url: `${config.APP_BASE_URL}/billing?status=success`,
      metadata: { azayon_tenant_id: tenant.id, tier },
    }),
  });
  const data = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string };
  };
  if (!res.ok || !data.status || !data.data?.authorization_url) {
    throw new Error(data.message ?? "Paystack rejected the subscription request.");
  }
  return data.data.authorization_url;
}

/** Authenticated call to the platform Paystack account. */
async function paystackPlatform(
  path: string,
  method: "GET" | "POST" = "GET",
  body?: unknown,
): Promise<Record<string, unknown>> {
  const res = await fetchWithTimeout(`${PAYSTACK}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${config.PAYSTACK_PLATFORM_SECRET}`,
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const data = (await res.json()) as { status?: boolean; message?: string; data?: unknown };
  if (!res.ok || data.status === false) {
    throw new Error(data.message ?? "Paystack request failed.");
  }
  return (data.data ?? {}) as Record<string, unknown>;
}

/**
 * Disables a subscription on the platform account. Paystack's disable endpoint
 * needs the subscription code AND its email_token, which we fetch first. Used by
 * cancel and by plan-change (to retire the superseded subscription). No-op when
 * platform billing isn't configured.
 */
export async function disableSubscription(code: string): Promise<void> {
  if (!config.PAYSTACK_PLATFORM_SECRET || !code) return;
  const sub = await paystackPlatform(`/subscription/${code}`);
  const token = sub.email_token as string | undefined;
  if (!token) throw new Error("Could not read subscription token from Paystack.");
  await paystackPlatform("/subscription/disable", "POST", { code, token });
}

/** Re-enables a previously cancelled subscription. */
export async function enableSubscription(code: string): Promise<void> {
  if (!config.PAYSTACK_PLATFORM_SECRET || !code) return;
  const sub = await paystackPlatform(`/subscription/${code}`);
  const token = sub.email_token as string | undefined;
  if (!token) throw new Error("Could not read subscription token from Paystack.");
  await paystackPlatform("/subscription/enable", "POST", { code, token });
}

/** Owner email addresses for a tenant (falls back to the branding email). */
async function ownerEmails(tenant: Tenant): Promise<string[]> {
  const owners = await db.user.findMany({
    where: { tenantId: tenant.id, role: "owner" },
    select: { email: true },
  });
  const emails = owners.map((u) => u.email);
  if (emails.length === 0 && tenant.businessEmail) emails.push(tenant.businessEmail);
  return emails;
}

async function emailOwners(tenant: Tenant, subject: string, lines: string[]): Promise<void> {
  const to = await ownerEmails(tenant);
  if (to.length === 0) return;
  const text = lines.join("\n");
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">${lines
    .map((l) => (l ? `<div>${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</div>` : "<div>&nbsp;</div>"))
    .join("")}</div>`;
  await sendEmail({ to: to.join(", "), subject, html, text });
}

const HOURS_LEFT = (d: Date, now: Date) => Math.max(0, Math.round((d.getTime() - now.getTime()) / 3_600_000));

/**
 * Periodic billing housekeeping (runs on the worker tick):
 *  - Emails the owner ~2 days before the trial ends, and once when it ends.
 *  - Lapses cancelled subscriptions to past_due once the paid period is over.
 * All steps are idempotent (timestamps / state transitions), so re-running is safe.
 */
export async function runBillingSweep(now: Date = new Date()): Promise<void> {
  const soon = new Date(now.getTime() + 2 * 86_400_000);

  // 1. Trial ending soon (within 48h, not yet notified).
  const ending = await db.tenant.findMany({
    where: {
      plan: "trial",
      trialEndsAt: { gt: now, lte: soon },
      trialEndingNoticeSentAt: null,
    },
    take: 50,
  });
  for (const t of ending) {
    const hrs = HOURS_LEFT(t.trialEndsAt!, now);
    const when = hrs <= 24 ? `about ${hrs} hour${hrs === 1 ? "" : "s"}` : `${Math.round(hrs / 24)} days`;
    await emailOwners(t, `Your ${t.name} free trial ends in ${when}`, [
      `Hi ${t.name},`,
      "",
      `Your Azayon free trial ends in ${when}. To keep your AI replying to customers on WhatsApp after that, pick a plan — it takes a minute and there's no interruption.`,
      "",
      `Choose a plan: ${config.APP_BASE_URL}/billing`,
      "",
      "If you have any questions, just reply to this email.",
    ]).catch((e) => console.error("[billing] trial-ending email failed:", e));
    await db.tenant.update({ where: { id: t.id }, data: { trialEndingNoticeSentAt: now } });
  }

  // 2. Trial just ended (expired, not yet notified). plan still "trial" = not subscribed.
  const ended = await db.tenant.findMany({
    where: {
      plan: "trial",
      trialEndsAt: { lt: now },
      trialEndedNoticeSentAt: null,
    },
    take: 50,
  });
  for (const t of ended) {
    await emailOwners(t, `Your ${t.name} free trial has ended`, [
      `Hi ${t.name},`,
      "",
      "Your Azayon free trial has ended, so your AI has paused replying to new WhatsApp messages. Your data, contacts and settings are all safe.",
      "",
      `Subscribe to switch it back on: ${config.APP_BASE_URL}/billing`,
    ]).catch((e) => console.error("[billing] trial-ended email failed:", e));
    await db.tenant.update({ where: { id: t.id }, data: { trialEndedNoticeSentAt: now } });
  }

  // 3. Lapse cancelled subscriptions once the paid period is over.
  const lapsed = await db.tenant.findMany({
    where: { plan: "active", cancelAtPeriodEnd: true, planRenewsAt: { lt: now } },
    take: 50,
  });
  for (const t of lapsed) {
    await db.tenant.update({ where: { id: t.id }, data: { plan: "past_due" } });
  }
}
