import type { Tenant } from "@prisma/client";
import { db } from "./db.js";
import { renderTemplate, sendTemplateMessage } from "./whatsapp/templates.js";
import { withinDailyCap } from "./whatsapp/ratelimit.js";

/**
 * Broadcasts — opt-in template campaigns to a segment. Outside the 24h window
 * only approved templates are legal, so a broadcast always sends an approved
 * Template. Recipients always exclude opted-out contacts and respect the
 * per-contact daily cap; if the number's quality is RED we refuse to send.
 */
export interface Segment {
  stage?: string;
  source?: string;
  all?: boolean;
}

/** Contacts matching a segment (real, non-opted-out). */
export async function resolveRecipients(tenantId: string, segment: Segment) {
  return db.contact.findMany({
    where: {
      tenantId,
      isSimulated: false,
      optedOut: false,
      ...(segment.stage ? { stage: segment.stage } : {}),
      ...(segment.source ? { source: segment.source } : {}),
    },
  });
}

/**
 * Runs a broadcast: sends the approved template to each recipient, throttled,
 * updating progress. Best-effort per recipient (failures increment `failed`).
 */
export async function runBroadcast(broadcastId: string): Promise<void> {
  const broadcast = await db.broadcast.findUnique({ where: { id: broadcastId } });
  if (!broadcast) return;
  const tenant = await db.tenant.findUnique({ where: { id: broadcast.tenantId } });
  const template = await db.template.findFirst({
    where: { id: broadcast.templateId, tenantId: broadcast.tenantId, status: "approved" },
  });
  if (!tenant || !template) {
    await db.broadcast.update({ where: { id: broadcastId }, data: { status: "failed" } });
    return;
  }

  const segment = JSON.parse(broadcast.segment) as Segment;
  const recipients = await resolveRecipients(tenant.id, segment);
  await db.broadcast.update({
    where: { id: broadcastId },
    data: { status: "sending", total: recipients.length },
  });

  for (const contact of recipients) {
    try {
      if (!(await withinDailyCap(tenant, contact.id))) {
        await db.broadcast.update({ where: { id: broadcastId }, data: { failed: { increment: 1 } } });
        continue;
      }
      await sendTemplateMessage(tenant, contact, template);
      await db.message.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          direction: "out",
          author: "ai",
          text: renderTemplate(template, tenant, contact),
        },
      });
      await db.broadcast.update({ where: { id: broadcastId }, data: { sent: { increment: 1 } } });
    } catch (err) {
      console.error(`[broadcast] send failed for ${contact.phone}:`, err);
      await db.broadcast.update({ where: { id: broadcastId }, data: { failed: { increment: 1 } } });
    }
    // Gentle throttle so we don't burst the WhatsApp send rate.
    await new Promise((r) => setTimeout(r, 250));
  }

  await db.broadcast.update({ where: { id: broadcastId }, data: { status: "done" } });
}

/** True when the tenant's number quality is too low to broadcast safely. */
export function qualityBlocksBroadcast(tenant: Tenant): boolean {
  return tenant.waQualityRating === "RED";
}
