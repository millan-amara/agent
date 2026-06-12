import type { FastifyInstance } from "fastify";
import type { Contact, Message } from "@prisma/client";
import { db } from "../db.js";
import { publish, subscribe } from "../events.js";
import { requireAuth } from "../auth/auth.js";
import { getTemplate } from "../templates.js";
import { handleInboundText } from "../inbound.js";
import type { QueueDriver } from "../queue/queue.js";
import { windowIsOpen, WindowClosedError, type MessageSender } from "../whatsapp/sender.js";
import {
  submitTemplate,
  syncTemplateStatuses,
  TemplateSubmitError,
  variableCount,
} from "../whatsapp/templates.js";
import { parseFollowUpConfig } from "../followups.js";
import type { BusinessProfile } from "../agent/prompt.js";

const serializeContact = (c: Contact) => ({
  id: c.id,
  phone: c.phone,
  name: c.name,
  stage: c.stage,
  source: c.source,
  fields: JSON.parse(c.fields) as Record<string, unknown>,
  isSimulated: c.isSimulated,
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

/** Tenant-scoped inbox/CRM/onboarding API. Tenant comes from the session. */
export function registerApiRoutes(
  app: FastifyInstance,
  sender: MessageSender,
  queue: QueueDriver,
): void {
  app.get("/api/tenant", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return {
      id: auth.tenant.id,
      name: auth.tenant.name,
      vertical: auth.tenant.vertical,
      onboarded: auth.tenant.onboarded,
      waConnected: Boolean(auth.tenant.waPhoneNumberId),
      wabaConfigured: Boolean(auth.tenant.waWabaId),
      stages: JSON.parse(auth.tenant.stages) as string[],
      profile: JSON.parse(auth.tenant.businessProfile) as BusinessProfile,
      followUps: parseFollowUpConfig(auth.tenant),
    };
  });

  // Save the guided prompt-builder output. Marks onboarding complete when asked.
  app.put("/api/tenant/profile", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { profile, stages, name, completeOnboarding } = req.body as {
      profile?: BusinessProfile;
      stages?: string[];
      name?: string;
      completeOnboarding?: boolean;
    };
    if (!profile?.description?.trim()) {
      return reply.code(400).send({ error: "A business description is required." });
    }
    const cleanStages =
      Array.isArray(stages) && stages.length >= 2
        ? stages.map((s) => String(s).trim()).filter(Boolean)
        : (JSON.parse(auth.tenant.stages) as string[]);
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        name: name?.trim() || auth.tenant.name,
        businessProfile: JSON.stringify(profile),
        stages: JSON.stringify(cleanStages),
        ...(completeOnboarding ? { onboarded: true } : {}),
      },
    });
    return { ok: true };
  });

  // Auto no-reply follow-up sequence configuration.
  app.put("/api/tenant/followups", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { enabled, delaysHours, templateId } = req.body as {
      enabled?: boolean;
      delaysHours?: number[];
      templateId?: string;
    };
    const delays = (delaysHours ?? [24, 72])
      .map(Number)
      .filter((h) => Number.isFinite(h) && h >= 1 && h <= 24 * 30)
      .slice(0, 4);
    if (delays.length === 0) {
      return reply.code(400).send({ error: "At least one delay (1h–30d) is required." });
    }
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        followUpConfig: JSON.stringify({
          enabled: Boolean(enabled),
          delaysHours: delays,
          templateId: templateId ?? "",
        }),
      },
    });
    return { ok: true };
  });

  // ---- WhatsApp template messages (24h-window compliance) ----

  app.get("/api/message-templates", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return db.template.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { createdAt: "desc" },
    });
  });

  app.post("/api/message-templates", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { name, category, language, body } = req.body as {
      name?: string;
      category?: string;
      language?: string;
      body?: string;
    };
    if (!name || !/^[a-z0-9_]{1,100}$/.test(name)) {
      return reply.code(400).send({
        error: "Template name must be lowercase letters, numbers, and underscores only.",
      });
    }
    if (!body?.trim()) return reply.code(400).send({ error: "Body text is required." });
    if (variableCount(body) > 2) {
      return reply
        .code(400)
        .send({ error: "Only {{1}} (customer name) and {{2}} (business name) are supported." });
    }
    const existing = await db.template.findUnique({
      where: { tenantId_name: { tenantId: auth.tenant.id, name } },
    });
    if (existing) return reply.code(409).send({ error: "A template with this name exists." });

    const template = await db.template.create({
      data: {
        tenantId: auth.tenant.id,
        name,
        category: category === "MARKETING" ? "MARKETING" : "UTILITY",
        language: language?.trim() || "en",
        body: body.trim(),
      },
    });
    return template;
  });

  app.post("/api/message-templates/:id/submit", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const template = await db.template.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!template) return reply.code(404).send({ error: "not found" });
    try {
      const status = await submitTemplate(auth.tenant, template);
      return db.template.update({ where: { id }, data: { status, rejectionReason: null } });
    } catch (err) {
      if (err instanceof TemplateSubmitError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  app.post("/api/message-templates/sync", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const updated = await syncTemplateStatuses(auth.tenant);
    return { updated };
  });

  app.delete("/api/message-templates/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const template = await db.template.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!template) return reply.code(404).send({ error: "not found" });
    await db.template.delete({ where: { id } });
    return { ok: true };
  });

  // Manual WhatsApp connection (Embedded Signup replaces this post-app-review):
  // tenant pastes their phone number ID + a Cloud API token; we verify both work.
  app.post("/api/tenant/whatsapp", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { phoneNumberId, accessToken, wabaId } = req.body as {
      phoneNumberId?: string;
      accessToken?: string;
      wabaId?: string;
    };
    if (!phoneNumberId?.trim() || !accessToken?.trim()) {
      return reply.code(400).send({ error: "Phone number ID and access token are required." });
    }
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId.trim()}?fields=display_phone_number,verified_name`,
      { headers: { Authorization: `Bearer ${accessToken.trim()}` } },
    );
    if (!res.ok) {
      return reply.code(400).send({
        error: "Meta rejected those credentials — check the phone number ID and token.",
      });
    }
    const info = (await res.json()) as { display_phone_number: string; verified_name: string };

    // A phone number routes to exactly one tenant.
    await db.tenant.updateMany({
      where: { waPhoneNumberId: phoneNumberId.trim(), NOT: { id: auth.tenant.id } },
      data: { waPhoneNumberId: null },
    });
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        waPhoneNumberId: phoneNumberId.trim(),
        waAccessToken: accessToken.trim(),
        ...(wabaId?.trim() ? { waWabaId: wabaId.trim() } : {}),
      },
    });
    return { ok: true, number: info.display_phone_number, name: info.verified_name };
  });

  // ---- In-app simulator: the real agent loop, no WhatsApp ----

  app.post("/api/simulator/messages", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return reply.code(400).send({ error: "text is required" });

    const phone = `sim:${auth.user.id}`;
    await db.contact.upsert({
      where: { tenantId_phone: { tenantId: auth.tenant.id, phone } },
      create: {
        tenantId: auth.tenant.id,
        phone,
        name: "Simulator",
        stage: (JSON.parse(auth.tenant.stages) as string[])[0] ?? "New Lead",
        isSimulated: true,
        source: "simulator",
      },
      update: {},
    });
    await handleInboundText(queue, {
      tenantId: auth.tenant.id,
      phone,
      text: text.trim(),
      source: "simulator",
    });
    const contact = await db.contact.findUniqueOrThrow({
      where: { tenantId_phone: { tenantId: auth.tenant.id, phone } },
    });
    return { contactId: contact.id };
  });

  app.post("/api/simulator/reset", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const phone = `sim:${auth.user.id}`;
    const contact = await db.contact.findUnique({
      where: { tenantId_phone: { tenantId: auth.tenant.id, phone } },
    });
    if (contact) {
      await db.followUp.deleteMany({ where: { contactId: contact.id } });
      await db.message.deleteMany({ where: { contactId: contact.id } });
      await db.contact.delete({ where: { id: contact.id } });
    }
    return { ok: true };
  });

  app.get("/api/simulator", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const contact = await db.contact.findUnique({
      where: { tenantId_phone: { tenantId: auth.tenant.id, phone: `sim:${auth.user.id}` } },
      include: {
        messages: { orderBy: { createdAt: "asc" } },
        followUps: { where: { status: "scheduled" } },
      },
    });
    if (!contact) return { contact: null };
    return {
      contact: {
        ...serializeContact(contact),
        messages: contact.messages.map(serializeMessage),
        followUps: contact.followUps.map((f) => ({ id: f.id, dueAt: f.dueAt, note: f.note })),
      },
    };
  });

  // ---- Inbox / CRM ----

  app.get("/api/conversations", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const contacts = await db.contact.findMany({
      where: { tenantId: auth.tenant.id, isSimulated: false },
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
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const contact = await db.contact.findFirst({
      where: { id, tenantId: auth.tenant.id },
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
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const { text } = req.body as { text?: string };
    if (!text?.trim()) return reply.code(400).send({ error: "text is required" });

    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });
    if (contact.optedOut) return reply.code(409).send({ error: "Contact has opted out." });

    try {
      await sender.sendText(auth.tenant, contact, text.trim());
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
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "human",
        text: text.trim(),
      },
    });
    publish({ type: "message", tenantId: auth.tenant.id, contactId: id });
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    return { message: serializeMessage(message), contact: serializeContact(updated) };
  });

  // The light switch: AI on/off per conversation.
  app.post("/api/contacts/:id/ai", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const { enabled } = req.body as { enabled?: boolean };
    if (typeof enabled !== "boolean") {
      return reply.code(400).send({ error: "enabled (boolean) is required" });
    }
    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });

    const updated = await db.contact.update({
      where: { id },
      data: { aiPaused: !enabled, needsHuman: enabled ? false : contact.needsHuman },
    });
    await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: enabled ? "AI resumed by team" : "Human takeover — AI paused",
      },
    });
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    publish({ type: "message", tenantId: auth.tenant.id, contactId: id });
    return serializeContact(updated);
  });

  // Stage change (pipeline drag-and-drop).
  app.patch("/api/contacts/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const { stage } = req.body as { stage?: string };
    const stages = JSON.parse(auth.tenant.stages) as string[];
    if (!stage || !stages.includes(stage)) {
      return reply.code(400).send({ error: `stage must be one of: ${stages.join(", ")}` });
    }
    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });

    const updated = await db.contact.update({ where: { id }, data: { stage } });
    await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: `Team moved lead to "${stage}"`,
      },
    });
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    return serializeContact(updated);
  });

  // Realtime feed, scoped to the session's tenant.
  app.get("/api/ws", { websocket: true }, async (socket, req) => {
    const token = req.cookies["azayon_session"];
    const session = token
      ? await db.session.findUnique({ where: { token }, include: { user: true } })
      : null;
    if (!session || session.expiresAt < new Date()) {
      socket.close(4401, "not authenticated");
      return;
    }
    const tenantId = session.user.tenantId;
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
