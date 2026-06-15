import type { Tenant } from "@prisma/client";
import { config } from "./config.js";
import { db } from "./db.js";
import { fetchWithTimeout } from "./http.js";

/**
 * Azayon subscription billing. Tenants get a 14-day full trial, then must
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

export const PLANS: Record<TierId, PlanDef> = {
  starter: { tier: "starter", name: "Starter", priceKes: 2_500, convLimit: 150, planCode: config.PAYSTACK_PLAN_STARTER },
  growth: { tier: "growth", name: "Growth", priceKes: 7_500, convLimit: 750, planCode: config.PAYSTACK_PLAN_GROWTH },
  pro: { tier: "pro", name: "Pro", priceKes: 20_000, convLimit: 3_000, planCode: config.PAYSTACK_PLAN_PRO },
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
    };
  }

  // A null trialEndsAt means "trial, no expiry set" (seeded/legacy tenants) —
  // treat as on-trial, not expired. Only a past date ends the trial.
  const onTrial =
    tenant.plan === "trial" && (tenant.trialEndsAt === null || tenant.trialEndsAt > new Date());
  return {
    state: onTrial ? "trial" : "readonly",
    plan: tenant.plan,
    planTier: tier,
    conversationCount,
    limit: tier ? PLANS[tier]?.convLimit ?? null : null,
    trialEndsAt: tenant.trialEndsAt,
    planRenewsAt: tenant.planRenewsAt,
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
