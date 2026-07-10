import { db } from "./db.js";
import { publish } from "./events.js";
import { contactKey, ownerKey, type QueueDriver } from "./queue/queue.js";

/**
 * Records an inbound customer message and queues an agent turn.
 * Shared by the webhook and the simulator so both exercise the same path.
 * Idempotent on waMessageId (Meta redelivers webhooks).
 */
export async function handleInboundText(
  queue: QueueDriver,
  args: {
    tenantId: string;
    phone: string;
    text: string;
    waMessageId?: string;
    profileName?: string;
    source?: string;
    mediaType?: string;
    mediaUrl?: string;
    // The channel this inbound arrived on. WhatsApp today; the seam lets a future
    // email/meeting adapter emit the same normalized shape without re-plumbing.
    channel?: string;
  },
): Promise<void> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: args.tenantId } });

  // Owner chat fork: a message from the owner's own number goes to the private
  // read-only assistant, not the customer sales agent — and never becomes a lead.
  if (
    tenant.ownerChatEnabled &&
    tenant.ownerPhone &&
    args.phone.replace(/\D/g, "") === tenant.ownerPhone
  ) {
    await handleOwnerInbound(queue, args.tenantId, args.text, args.waMessageId);
    return;
  }

  const stages = JSON.parse(tenant.stages) as string[];

  const contact = await db.contact.upsert({
    where: { tenantId_phone: { tenantId: args.tenantId, phone: args.phone } },
    create: {
      tenantId: args.tenantId,
      phone: args.phone,
      name: args.profileName,
      stage: stages[0] ?? "New Lead",
      source: args.source,
      lastInboundAt: new Date(),
    },
    update: { lastInboundAt: new Date() },
  });

  try {
    await db.message.create({
      data: {
        tenantId: args.tenantId,
        contactId: contact.id,
        direction: "in",
        author: "customer",
        text: args.text,
        waMessageId: args.waMessageId,
        channel: args.channel ?? "whatsapp",
        mediaType: args.mediaType,
        mediaUrl: args.mediaUrl,
      },
    });
  } catch (err: unknown) {
    // Unique violation on waMessageId = webhook redelivery. Already handled.
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return;
    }
    throw err;
  }

  publish({ type: "message", tenantId: args.tenantId, contactId: contact.id });
  queue.enqueue(contactKey(args.tenantId, contact.id));
}

/**
 * Records an owner's inbound message and queues an owner turn. Idempotent on
 * waMessageId (Meta redelivers). The owner turn runs on the same debounced queue
 * so rapid messages batch into one reply.
 */
async function handleOwnerInbound(
  queue: QueueDriver,
  tenantId: string,
  text: string,
  waMessageId?: string,
): Promise<void> {
  try {
    await db.ownerMessage.create({ data: { tenantId, direction: "in", text, waMessageId } });
  } catch (err: unknown) {
    if (typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002") {
      return; // webhook redelivery — already recorded
    }
    throw err;
  }
  queue.enqueue(ownerKey(tenantId));
}
