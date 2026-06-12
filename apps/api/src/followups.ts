import { db } from "./db.js";
import { runAgentTurn } from "./agent/agent.js";
import { windowIsOpen, type MessageSender } from "./whatsapp/sender.js";

/**
 * Polls for due follow-ups and has the agent compose the check-in message.
 * Window-aware: outside the 24h window a free-form send would violate Meta
 * policy, so the follow-up is marked "skipped" — Slice 4 replaces that branch
 * with approved template messages.
 */
export function startFollowUpWorker(sender: MessageSender, intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    const due = await db.followUp.findMany({
      where: { status: "scheduled", dueAt: { lte: new Date() } },
      take: 20,
    });
    for (const fu of due) {
      const contact = await db.contact.findUnique({ where: { id: fu.contactId } });
      if (!contact || contact.optedOut || contact.aiPaused) {
        await db.followUp.update({ where: { id: fu.id }, data: { status: "canceled" } });
        continue;
      }
      if (!windowIsOpen(contact)) {
        console.log(
          `[followups] window closed for ${contact.phone} — skipping (needs template, Slice 4)`,
        );
        await db.followUp.update({ where: { id: fu.id }, data: { status: "skipped" } });
        continue;
      }
      try {
        await runAgentTurn(fu.tenantId, fu.contactId, sender, { followUpNote: fu.note });
        await db.followUp.update({ where: { id: fu.id }, data: { status: "sent" } });
      } catch (err) {
        console.error(`[followups] failed for ${fu.id}:`, err);
      }
    }
  };
  return setInterval(() => void tick(), intervalMs);
}
