import { timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireAuth } from "../auth/auth.js";
import { usdFor, usdToKes } from "../costs.js";

/** Constant-time compare of a request-supplied token against the configured one. */
function tokenMatches(provided: unknown, expected: string): boolean {
  if (typeof provided !== "string") return false;
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * The ROI dashboard: answers "what did Azayon make me this month?".
 * This screen is the churn defense — keep the numbers business-shaped
 * (leads, bookings, shillings), not technical.
 */
export function registerDashboardRoutes(app: FastifyInstance): void {
  // Internal-only: per-tenant LLM cost (KES), split by model. Guarded by a
  // shared admin token, not the tenant session. Disabled when ADMIN_TOKEN unset.
  app.get("/api/admin/costs", async (req, reply) => {
    if (!config.ADMIN_TOKEN || !tokenMatches(req.headers["x-admin-token"], config.ADMIN_TOKEN)) {
      return reply.code(404).send({ error: "not found" });
    }
    const monthStart = new Date().toISOString().slice(0, 8) + "01";
    const rows = await db.usage.findMany({ where: { day: { gte: monthStart } } });
    const tenants = await db.tenant.findMany({ select: { id: true, name: true, plan: true } });
    const nameById = new Map(tenants.map((t) => [t.id, { name: t.name, plan: t.plan }]));

    const byTenant = new Map<
      string,
      { name: string; plan: string; usd: number; inputTokens: number; outputTokens: number; llmCalls: number; byModel: Record<string, number> }
    >();
    for (const r of rows) {
      const meta = nameById.get(r.tenantId);
      if (!meta) continue;
      const usd = usdFor(r.model, r.inputTokens, r.outputTokens);
      const cur =
        byTenant.get(r.tenantId) ??
        { name: meta.name, plan: meta.plan, usd: 0, inputTokens: 0, outputTokens: 0, llmCalls: 0, byModel: {} };
      cur.usd += usd;
      cur.inputTokens += r.inputTokens;
      cur.outputTokens += r.outputTokens;
      cur.llmCalls += r.llmCalls;
      cur.byModel[r.model] = (cur.byModel[r.model] ?? 0) + usd;
      byTenant.set(r.tenantId, cur);
    }

    return {
      period: monthStart,
      tenants: [...byTenant.entries()]
        .map(([id, v]) => ({
          tenantId: id,
          name: v.name,
          plan: v.plan,
          llmCalls: v.llmCalls,
          inputTokens: v.inputTokens,
          outputTokens: v.outputTokens,
          costUsd: Number(v.usd.toFixed(4)),
          costKes: Math.round(usdToKes(v.usd)),
          byModelKes: Object.fromEntries(
            Object.entries(v.byModel).map(([m, usd]) => [m, Math.round(usdToKes(usd))]),
          ),
        }))
        .sort((a, b) => b.costUsd - a.costUsd),
    };
  });

  // Ad / lead-source attribution: turn captured CTWA click data into revenue.
  app.get("/api/attribution", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const tenantId = auth.tenant.id;
    const firstStage = (JSON.parse(auth.tenant.stages) as string[])[0] ?? "New Lead";

    const label = (s: string | null): string =>
      !s ? "Direct / organic" : s.startsWith("ctwa:") ? s.slice(5) || "Click-to-WhatsApp ad" : s;

    const [contacts, appts, invoices] = await Promise.all([
      db.contact.findMany({
        where: { tenantId, isSimulated: false },
        select: { id: true, source: true, stage: true },
      }),
      db.appointment.findMany({
        where: { tenantId, status: "booked" },
        select: { contactId: true },
      }),
      db.invoice.findMany({
        where: { tenantId, status: "paid" },
        select: { contactId: true, amountCents: true },
      }),
    ]);

    const sourceOf = new Map<string, string>();
    const rows = new Map<
      string,
      { source: string; leads: number; qualified: number; booked: number; paidKes: number }
    >();
    const get = (src: string) => {
      let r = rows.get(src);
      if (!r) {
        r = { source: src, leads: 0, qualified: 0, booked: 0, paidKes: 0 };
        rows.set(src, r);
      }
      return r;
    };

    for (const c of contacts) {
      const src = label(c.source);
      sourceOf.set(c.id, src);
      const r = get(src);
      r.leads++;
      if (c.stage !== firstStage) r.qualified++;
    }
    for (const a of appts) {
      const src = sourceOf.get(a.contactId);
      if (src) get(src).booked++;
    }
    for (const i of invoices) {
      const src = sourceOf.get(i.contactId);
      if (src) get(src).paidKes += i.amountCents / 100;
    }

    return {
      sources: [...rows.values()].sort((a, b) => b.paidKes - a.paidKes || b.leads - a.leads),
    };
  });

  app.get("/api/dashboard", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const tenantId = auth.tenant.id;
    const since = new Date(Date.now() - 30 * 86_400_000);
    const monthStart = new Date().toISOString().slice(0, 8) + "01";

    const stages = JSON.parse(auth.tenant.stages) as string[];
    const firstStage = stages[0] ?? "New Lead";

    const [
      newLeads,
      qualified,
      booked,
      followUpsSent,
      paidInvoices,
      needsHuman,
      activeConversations,
      usageRows,
    ] = await Promise.all([
      db.contact.count({
        where: { tenantId, isSimulated: false, createdAt: { gte: since } },
      }),
      db.contact.count({
        where: {
          tenantId,
          isSimulated: false,
          createdAt: { gte: since },
          NOT: { stage: firstStage },
        },
      }),
      db.appointment.count({
        where: { tenantId, createdAt: { gte: since }, status: "booked" },
      }),
      db.followUp.findMany({
        where: { tenantId, status: "sent", dueAt: { gte: since } },
        select: { contactId: true, dueAt: true },
      }),
      db.invoice.findMany({
        where: { tenantId, status: "paid", paidAt: { gte: since } },
        select: { amountCents: true },
      }),
      db.contact.count({
        where: {
          tenantId,
          isSimulated: false,
          OR: [{ needsHuman: true }, { needsReview: true }],
        },
      }),
      db.contact.count({
        where: {
          tenantId,
          isSimulated: false,
          optedOut: false,
          lastInboundAt: { gte: new Date(Date.now() - 86_400_000) },
        },
      }),
      db.usage.findMany({ where: { tenantId, day: { gte: monthStart } } }),
    ]);

    // "Recovered": the customer wrote back within 7 days of a follow-up nudge.
    let recovered = 0;
    const seenContacts = new Set<string>();
    for (const fu of followUpsSent) {
      if (seenContacts.has(fu.contactId)) continue;
      const replied = await db.message.findFirst({
        where: {
          contactId: fu.contactId,
          direction: "in",
          createdAt: { gte: fu.dueAt, lte: new Date(fu.dueAt.getTime() + 7 * 86_400_000) },
        },
        select: { id: true },
      });
      if (replied) {
        recovered++;
        seenContacts.add(fu.contactId);
      }
    }

    return {
      period: "30d",
      newLeads,
      qualified,
      booked,
      followUpsSent: followUpsSent.length,
      recovered,
      paidKes: paidInvoices.reduce((sum, i) => sum + i.amountCents, 0) / 100,
      needsHuman,
      activeConversations,
      health: {
        waConnected: Boolean(auth.tenant.waPhoneNumberId),
        aiEnabled: auth.tenant.aiEnabled,
        qualityRating: auth.tenant.waQualityRating,
        messagingLimit: auth.tenant.waMessagingLimit,
      },
      billing: {
        plan: auth.tenant.plan,
        trialEndsAt: auth.tenant.trialEndsAt,
        usageThisMonth: {
          llmCalls: usageRows.reduce((s, u) => s + u.llmCalls, 0),
          inputTokens: usageRows.reduce((s, u) => s + u.inputTokens, 0),
          outputTokens: usageRows.reduce((s, u) => s + u.outputTokens, 0),
        },
      },
    };
  });
}
