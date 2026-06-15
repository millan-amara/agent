import { db } from "./db.js";

/**
 * Data-retention sweep (Kenya DPA / ODPC). Tenants that set a retention window
 * have their old message bodies deleted on a rolling basis. Contacts, pipeline
 * state, and aggregate stats are kept; only the conversation content ages out.
 * Runs from the worker tick; throttled implicitly by being cheap and idempotent.
 */
export async function runRetentionSweep(): Promise<void> {
  const tenants = await db.tenant.findMany({
    where: { NOT: { dataRetentionDays: null } },
    select: { id: true, dataRetentionDays: true },
  });
  for (const t of tenants) {
    const days = t.dataRetentionDays;
    if (!days || days <= 0) continue;
    const cutoff = new Date(Date.now() - days * 86_400_000);
    try {
      const { count } = await db.message.deleteMany({
        where: { tenantId: t.id, createdAt: { lt: cutoff } },
      });
      if (count > 0) console.log(`[retention] purged ${count} messages for tenant ${t.id}`);
    } catch (err) {
      console.error(`[retention] sweep failed for tenant ${t.id}:`, err);
    }
  }
}
