import { db } from "./db.js";
import { publish } from "./events.js";
import { contactKey, type QueueDriver } from "./queue/queue.js";

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
  },
): Promise<void> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: args.tenantId } });
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
