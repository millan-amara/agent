import type { Contact, Tenant } from "@prisma/client";
import { db } from "./db.js";
import { publish } from "./events.js";
import { runAgentTurn } from "./agent/agent.js";
import { renderTemplate, sendTemplateMessage } from "./whatsapp/templates.js";
import { windowIsOpen, type MessageSender } from "./whatsapp/sender.js";

export interface FollowUpConfig {
  enabled?: boolean;
  delaysHours?: number[];
  templateId?: string;
}

const AUTO_NOTE_PREFIX = "auto:no-reply:";

export function parseFollowUpConfig(tenant: Tenant): Required<FollowUpConfig> {
  const raw = JSON.parse(tenant.followUpConfig || "{}") as FollowUpConfig;
  return {
    enabled: raw.enabled ?? false,
    delaysHours: raw.delaysHours?.length ? raw.delaysHours : [24, 72],
    templateId: raw.templateId ?? "",
  };
}

/**
 * Follow-up engine. Two jobs per tick:
 *
 * 1. Execute due follow-ups, window-aware:
 *    - window open  → the AI composes a contextual free-form check-in
 *    - window closed → send the tenant's approved follow-up template;
 *      no approved template configured = skip (never violate the 24h rule)
 *
 * 2. Auto no-reply sequences (per-tenant opt-in): when a customer goes
 *    silent after our last message, schedule check-ins at the configured
 *    delays. A reply, opt-out, or human takeover stops the sequence.
 */
export function startFollowUpWorker(sender: MessageSender, intervalMs = 60_000): NodeJS.Timeout {
  const tick = async () => {
    try {
      await executeDueFollowUps(sender);
      await scheduleAutoFollowUps();
      await sendAppointmentReminders(sender);
    } catch (err) {
      console.error("[followups] tick failed:", err);
    }
  };
  return setInterval(() => void tick(), intervalMs);
}

/** Reminds customers ~24h before their appointment (window-aware, once). */
async function sendAppointmentReminders(sender: MessageSender): Promise<void> {
  const soon = new Date(Date.now() + 24 * 3600_000);
  const due = await db.appointment.findMany({
    where: { status: "booked", reminderSentAt: null, startsAt: { gte: new Date(), lte: soon } },
    include: { contact: true, tenant: true },
    take: 20,
  });
  for (const appt of due) {
    if (appt.contact.optedOut) continue;
    if (!windowIsOpen(appt.contact) && !appt.contact.isSimulated) {
      // Reminders are utility messages but still need templates out-of-window;
      // mark handled so we don't spin. Template-based reminders: later.
      await db.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      console.log(`[reminders] window closed for ${appt.contact.phone} — reminder skipped`);
      continue;
    }
    const when = appt.startsAt.toLocaleString("en-KE", {
      weekday: "long",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    try {
      await sender.sendText(
        appt.tenant,
        appt.contact,
        `Reminder from ${appt.tenant.name}: your appointment is on ${when}. Reply here if you need to change it.`,
      );
      await db.message.create({
        data: {
          tenantId: appt.tenantId,
          contactId: appt.contactId,
          direction: "out",
          author: "ai",
          text: `Reminder from ${appt.tenant.name}: your appointment is on ${when}. Reply here if you need to change it.`,
        },
      });
      await db.appointment.update({
        where: { id: appt.id },
        data: { reminderSentAt: new Date() },
      });
      publish({ type: "message", tenantId: appt.tenantId, contactId: appt.contactId });
    } catch (err) {
      console.error(`[reminders] failed for appointment ${appt.id}:`, err);
    }
  }
}

async function executeDueFollowUps(sender: MessageSender): Promise<void> {
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

    // A reply after scheduling makes the follow-up moot — the AI already responded.
    const lastMessage = await db.message.findFirst({
      where: { contactId: contact.id, kind: "text" },
      orderBy: { createdAt: "desc" },
    });
    if (lastMessage && lastMessage.direction === "in") {
      await db.followUp.update({ where: { id: fu.id }, data: { status: "canceled" } });
      continue;
    }

    try {
      if (windowIsOpen(contact) || contact.isSimulated) {
        const note = fu.note.startsWith(AUTO_NOTE_PREFIX)
          ? "The customer hasn't replied to your last message. Write one short, friendly check-in that makes it easy to respond."
          : fu.note;
        await runAgentTurn(fu.tenantId, fu.contactId, sender, { followUpNote: note });
        await db.followUp.update({ where: { id: fu.id }, data: { status: "sent" } });
      } else {
        await sendClosedWindowFollowUp(fu.id, fu.tenantId, contact);
      }
    } catch (err) {
      console.error(`[followups] failed for ${fu.id}:`, err);
    }
  }
}

async function sendClosedWindowFollowUp(
  followUpId: string,
  tenantId: string,
  contact: Contact,
): Promise<void> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  const cfg = parseFollowUpConfig(tenant);
  const template = cfg.templateId
    ? await db.template.findFirst({
        where: { id: cfg.templateId, tenantId, status: "approved" },
      })
    : null;

  if (!template) {
    console.log(
      `[followups] window closed for ${contact.phone} and no approved follow-up template — skipping`,
    );
    await db.followUp.update({ where: { id: followUpId }, data: { status: "skipped" } });
    return;
  }

  await sendTemplateMessage(tenant, contact, template);
  await db.message.create({
    data: {
      tenantId,
      contactId: contact.id,
      direction: "out",
      author: "ai",
      text: renderTemplate(template, tenant, contact),
    },
  });
  await db.message.create({
    data: {
      tenantId,
      contactId: contact.id,
      direction: "out",
      author: "system",
      kind: "event",
      text: `Follow-up sent as template "${template.name}" (24h window closed)`,
    },
  });
  publish({ type: "message", tenantId, contactId: contact.id });
  await db.followUp.update({ where: { id: followUpId }, data: { status: "sent" } });
}

async function scheduleAutoFollowUps(): Promise<void> {
  const tenants = await db.tenant.findMany({ where: { aiEnabled: true } });
  for (const tenant of tenants) {
    const cfg = parseFollowUpConfig(tenant);
    if (!cfg.enabled) continue;

    const candidates = await db.contact.findMany({
      where: {
        tenantId: tenant.id,
        isSimulated: false,
        optedOut: false,
        aiPaused: false,
        needsHuman: false,
        followUps: { none: { status: "scheduled" } },
      },
      include: { messages: { where: { kind: "text" }, orderBy: { createdAt: "desc" }, take: 1 } },
    });

    for (const contact of candidates) {
      const last = contact.messages[0];
      // Sequence only continues while we're the last to speak.
      if (!last || last.direction !== "out") continue;

      const autoCount = await db.followUp.count({
        where: {
          contactId: contact.id,
          note: { startsWith: AUTO_NOTE_PREFIX },
          status: { in: ["sent", "skipped"] },
        },
      });
      if (autoCount >= cfg.delaysHours.length) continue; // sequence exhausted

      const delayMs = (cfg.delaysHours[autoCount] ?? 24) * 3600_000;
      if (Date.now() - last.createdAt.getTime() < delayMs) continue;

      await db.followUp.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          dueAt: new Date(),
          note: `${AUTO_NOTE_PREFIX}${autoCount + 1}`,
        },
      });
    }
  }
}
