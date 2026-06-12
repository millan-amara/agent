import type { FastifyInstance } from "fastify";
import type { Contact, Message } from "@prisma/client";
import { db } from "../db.js";
import { publish, subscribe } from "../events.js";
import { windowIsOpen, WindowClosedError, type MessageSender } from "../whatsapp/sender.js";

/**
 * Inbox/CRM API. Slice 2 is single-tenant (the dev tenant resolved at boot);
 * Slice 3 replaces `tenantId` with auth-derived tenant scoping.
 */
export function registerApiRoutes(
  app: FastifyInstance,
  tenantId: string,
  sender: MessageSender,
): void {
  const serializeContact = (c: Contact) => ({
    id: c.id,
    phone: c.phone,
    name: c.name,
    stage: c.stage,
    source: c.source,
    fields: JSON.parse(c.fields) as Record<string, unknown>,
    aiPaused: c.aiPaused,
    optedOut: c.optedOut,
    needsHuman: c.needsHuman,
    windowOpen: windowIsOpen(c),
    lastInboundAt: c.lastInboundAt,
    createdAt: c.createdAt,
  });

  const serializeMessage = (m: Message) => ({
    id: m.id,
    direction: m.direction,
    author: m.author,
    kind: m.kind,
    text: m.text,
    createdAt: m.createdAt,
  });

  app.get("/api/tenant", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    return { id: tenant.id, name: tenant.name, stages: JSON.parse(tenant.stages) as string[] };
  });

  // Conversation list: every contact with their latest message, newest first.
  app.get("/api/conversations", async () => {
    const contacts = await db.contact.findMany({
      where: { tenantId },
      include: { messages: { orderBy: { createdAt: "desc" }, take: 1 } },
      orderBy: { updatedAt: "desc" },
    });
    return contacts
      .map((c) => ({
        ...serializeContact(c),
        lastMessage: c.messages[0] ? serializeMessage(c.messages[0]) : null,
      }))
      .sort((a, b) => {
        const ta = a.lastMessage ? new Date(a.lastMessage.createdAt).getTime() : 0;
        const tb = b.lastMessage ? new Date(b.lastMessage.createdAt).getTime() : 0;
        return tb - ta;
      });
  });

  app.get("/api/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const contact = await db.contact.findFirst({
      where: { id, tenantId },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        followUps: { where: { status: "scheduled" }, orderBy: { dueAt: "asc" } },
      },
    });
    if (!contact) return reply.code(404).send({ error: "not found" });
    return {
      ...serializeContact(contact),
      messages: contact.messages.map(serializeMessage),
      followUps: contact.followUps.map((f) => ({ id: f.id, dueAt: f.dueAt, note: f.note })),
    };
  });

  // Human reply. Sending manually takes the conversation over (pauses the AI).
  app.post("/api/contacts/:id/messages", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return reply.code(400).send({ error: "text is required" });

    const contact = await db.contact.findFirst({ where: { id, tenantId } });
    if (!contact) return reply.code(404).send({ error: "not found" });
    if (contact.optedOut) return reply.code(409).send({ error: "Contact has opted out." });

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    try {
      await sender.sendText(tenant, contact, text.trim());
    } catch (err) {
      if (err instanceof WindowClosedError) {
        return reply.code(409).send({
          error:
            "The 24h window is closed — this customer can't receive free-form messages until they write again. (Template messages arrive in Slice 4.)",
        });
      }
      throw err;
    }

    const updated = await db.contact.update({
      where: { id },
      data: { aiPaused: true, needsHuman: false },
    });
    const message = await db.message.create({
      data: { tenantId, contactId: id, direction: "out", author: "human", text: text.trim() },
    });
    publish({ type: "message", tenantId, contactId: id });
    publish({ type: "contact_updated", tenantId, contactId: id });
    return { message: serializeMessage(message), contact: serializeContact(updated) };
  });

  // The light switch: AI on/off per conversation.
  app.post("/api/contacts/:id/ai", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    const contact = await db.contact.findFirst({ where: { id, tenantId } });
    if (!contact) return reply.code(404).send({ error: "not found" });

    const updated = await db.contact.update({
      where: { id },
      data: { aiPaused: !enabled, needsHuman: enabled ? false : contact.needsHuman },
    });
    await db.message.create({
      data: {
        tenantId,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: enabled ? "AI resumed by team" : "Human takeover — AI paused",
      },
    });
    publish({ type: "contact_updated", tenantId, contactId: id });
    publish({ type: "message", tenantId, contactId: id });
    return serializeContact(updated);
  });

  // Stage change (pipeline drag-and-drop).
  app.patch("/api/contacts/:id", async (req, reply) => {
    const { id } = req.params as { id: string };
    const { stage } = req.body as { stage?: string };
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
    const stages = JSON.parse(tenant.stages) as string[];
    if (!stage || !stages.includes(stage)) {
      return reply.code(400).send({ error: `stage must be one of: ${stages.join(", ")}` });
    }
    const contact = await db.contact.findFirst({ where: { id, tenantId } });
    if (!contact) return reply.code(404).send({ error: "not found" });

    const updated = await db.contact.update({ where: { id }, data: { stage } });
    await db.message.create({
      data: {
        tenantId,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: `Team moved lead to "${stage}"`,
      },
    });
    publish({ type: "contact_updated", tenantId, contactId: id });
    return serializeContact(updated);
  });

  // Realtime feed for the inbox.
  app.get("/api/ws", { websocket: true }, (socket) => {
    const unsubscribe = subscribe((event) => {
      if (event.tenantId !== tenantId) return;
      try {
        socket.send(JSON.stringify(event));
      } catch {
        // socket already closing — the close handler cleans up
      }
    });
    socket.on("close", unsubscribe);
  });
}
