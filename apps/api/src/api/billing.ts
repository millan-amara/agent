import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { requireAuth, requireOwner } from "../auth/auth.js";
import {
  billingStatus,
  createSubscriptionCheckout,
  disableSubscription,
  enableSubscription,
  PLANS,
  platformBillingConfigured,
  type TierId,
} from "../billing.js";

/** Subscription/plan endpoints. Subscribe is owner-only. */
export function registerBillingRoutes(app: FastifyInstance): void {
  app.get("/api/billing", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return {
      status: await billingStatus(auth.tenant),
      plans: Object.values(PLANS).map((p) => ({
        tier: p.tier,
        name: p.name,
        priceKes: p.priceKes,
        convLimit: p.convLimit,
        available: Boolean(p.planCode),
      })),
      checkoutEnabled: platformBillingConfigured,
    };
  });

  app.post("/api/billing/subscribe", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { tier } = req.body as { tier?: string };
    if (!tier || !(tier in PLANS)) {
      return reply.code(400).send({ error: "A valid plan tier is required." });
    }
    try {
      const url = await createSubscriptionCheckout(auth.tenant, auth.user.email, tier as TierId);
      return { url };
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
  });

  // Cancel at period end: stop renewal on Paystack; access stays until planRenewsAt.
  app.post("/api/billing/cancel", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    if (auth.tenant.plan !== "active") {
      return reply.code(400).send({ error: "You don't have an active subscription to cancel." });
    }
    try {
      if (auth.tenant.paystackSubscriptionCode) {
        await disableSubscription(auth.tenant.paystackSubscriptionCode);
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    await db.tenant.update({ where: { id: auth.tenant.id }, data: { cancelAtPeriodEnd: true } });
    return { ok: true };
  });

  // Undo a scheduled cancellation before the period ends.
  app.post("/api/billing/resume", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    if (!auth.tenant.cancelAtPeriodEnd) return { ok: true };
    try {
      if (auth.tenant.paystackSubscriptionCode) {
        await enableSubscription(auth.tenant.paystackSubscriptionCode);
      }
    } catch (err) {
      return reply.code(400).send({ error: (err as Error).message });
    }
    await db.tenant.update({ where: { id: auth.tenant.id }, data: { cancelAtPeriodEnd: false } });
    return { ok: true };
  });

  // Dev-only helper to exercise enforcement without Paystack: flip plan state.
  // Guarded so it never runs in production.
  if (process.env.NODE_ENV !== "production") {
    app.post("/api/billing/_dev_set", async (req, reply) => {
      const auth = await requireAuth(req, reply);
      if (!auth) return;
      const { plan, planTier, trialEndsAt } = req.body as {
        plan?: string;
        planTier?: string | null;
        trialEndsAt?: string | null;
      };
      await db.tenant.update({
        where: { id: auth.tenant.id },
        data: {
          ...(plan ? { plan } : {}),
          ...(planTier !== undefined ? { planTier } : {}),
          ...(trialEndsAt !== undefined
            ? { trialEndsAt: trialEndsAt ? new Date(trialEndsAt) : null }
            : {}),
        },
      });
      return { ok: true };
    });
  }
}
