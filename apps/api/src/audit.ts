import { db } from "./db.js";

/**
 * Append-only activity trail for team accountability — assignments, takeovers,
 * stage/plan/team changes. Best-effort: never let an audit write break the
 * action it's recording.
 */
export async function audit(
  tenantId: string,
  userId: string | null,
  action: string,
  detail = "",
): Promise<void> {
  try {
    await db.auditLog.create({ data: { tenantId, userId, action, detail } });
  } catch (err) {
    console.error("[audit] failed to record:", err);
  }
}
