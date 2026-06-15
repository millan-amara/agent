import type { Tenant } from "@prisma/client";
import { db } from "../db.js";

/**
 * Outbound guardrail: a ceiling on messages sent to one customer per day,
 * enforced for *proactive* sends (follow-ups, reminders) so a tenant can't
 * spam a lead into reporting them — which tanks the number's quality rating
 * (PLAN §3). Live replies to a customer's own message are never blocked.
 *
 * DB-counted (no Redis dependency) — pilot volumes make this cheap.
 */
const PLATFORM_DEFAULT_CAP = 6;

export function dailyCap(tenant: Tenant): number {
  return tenant.dailyMessageCap ?? PLATFORM_DEFAULT_CAP;
}

/** True if another proactive message to this contact stays within the cap. */
export async function withinDailyCap(tenant: Tenant, contactId: string): Promise<boolean> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);
  const sentToday = await db.message.count({
    where: {
      contactId,
      tenantId: tenant.id,
      direction: "out",
      kind: "text",
      createdAt: { gte: startOfDay },
    },
  });
  return sentToday < dailyCap(tenant);
}
