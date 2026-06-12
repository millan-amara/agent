import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { requireAuth } from "../auth/auth.js";

/**
 * The ROI dashboard: answers "what did Azayon make me this month?".
 * This screen is the churn defense — keep the numbers business-shaped
 * (leads, bookings, shillings), not technical.
 */
export function registerDashboardRoutes(app: FastifyInstance): void {
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
      db.contact.count({ where: { tenantId, isSimulated: false, needsHuman: true } }),
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
