import type { FastifyInstance } from "fastify";
import type { Contact, Message } from "@prisma/client";
import { db } from "../db.js";
import { publish, subscribe } from "../events.js";
import { requireAuth, requireOwner } from "../auth/auth.js";
import { getTemplate } from "../templates.js";
import { handleInboundText } from "../inbound.js";
import { fetchWithTimeout } from "../http.js";
import type { QueueDriver } from "../queue/queue.js";
import { windowIsOpen, WindowClosedError, type MessageSender } from "../whatsapp/sender.js";
import {
  submitTemplate,
  syncTemplateStatuses,
  TemplateSubmitError,
  variableCount,
} from "../whatsapp/templates.js";
import { parseFollowUpConfig } from "../followups.js";
import { parseBookingConfig, type BookingConfig } from "../booking.js";
import { verifyPaystackKey, approveInvoice, PaystackError } from "../paystack.js";
import { ingestDoc, KbError } from "../kb.js";
import { billingStatus, canSend } from "../billing.js";
import { audit } from "../audit.js";
import { deleteEvent, calendarConnected } from "../google.js";
import {
  exchangeCodeForToken,
  fetchNumberInfo,
  subscribeAppToWaba,
  EmbeddedSignupError,
} from "../whatsapp/embedded.js";
import type { BusinessProfile } from "../agent/prompt.js";
import { paymentApprovalRequired } from "../agent/tools.js";

const serializeContact = (c: Contact) => ({
  id: c.id,
  phone: c.phone,
  name: c.name,
  stage: c.stage,
  source: c.source,
  fields: JSON.parse(c.fields) as Record<string, unknown>,
  assignedUserId: c.assignedUserId,
  isSimulated: c.isSimulated,
  aiPaused: c.aiPaused,
  optedOut: c.optedOut,
  needsHuman: c.needsHuman,
  needsReview: c.needsReview,
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
  mediaType: m.mediaType,
  status: m.status,
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
      booking: parseBookingConfig(auth.tenant),
      paystackConfigured: Boolean(auth.tenant.paystackSecretKey),
      paymentApproval: paymentApprovalRequired(auth.tenant),
      health: {
        qualityRating: auth.tenant.waQualityRating,
        messagingLimit: auth.tenant.waMessagingLimit,
      },
      compliance: {
        dailyMessageCap: auth.tenant.dailyMessageCap,
        dataRetentionDays: auth.tenant.dataRetentionDays,
      },
      billing: await billingStatus(auth.tenant),
      role: auth.user.role,
      googleConnected: calendarConnected(auth.tenant),
    };
  });

  // Compliance guardrails: per-lead daily message cap + data-retention window.
  app.put("/api/tenant/compliance", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { dailyMessageCap, dataRetentionDays } = req.body as {
      dailyMessageCap?: number | null;
      dataRetentionDays?: number | null;
    };
    const clampOpt = (v: number | null | undefined, min: number, max: number) =>
      v === null || v === undefined ? null : Math.min(Math.max(Math.round(Number(v)), min), max);
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        dailyMessageCap: clampOpt(dailyMessageCap, 1, 100),
        dataRetentionDays: clampOpt(dataRetentionDays, 1, 3650),
      },
    });
    return { ok: true };
  });

  // ODPC data portability: full export of the tenant's data as JSON.
  app.get("/api/tenant/export", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const tenantId = auth.tenant.id;
    const [contacts, messages, followUps, appointments, invoices, templates] = await Promise.all([
      db.contact.findMany({ where: { tenantId } }),
      db.message.findMany({ where: { tenantId } }),
      db.followUp.findMany({ where: { tenantId } }),
      db.appointment.findMany({ where: { tenantId } }),
      db.invoice.findMany({ where: { tenantId } }),
      db.template.findMany({ where: { tenantId } }),
    ]);
    reply.header(
      "Content-Disposition",
      `attachment; filename="azayon-export-${tenantId}.json"`,
    );
    return {
      exportedAt: new Date().toISOString(),
      tenant: {
        id: auth.tenant.id,
        name: auth.tenant.name,
        vertical: auth.tenant.vertical,
        profile: JSON.parse(auth.tenant.businessProfile) as BusinessProfile,
      },
      contacts,
      messages,
      followUps,
      appointments,
      invoices,
      templates,
    };
  });

  // Booking calendar configuration.
  app.put("/api/tenant/booking", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const body = req.body as Partial<BookingConfig>;
    const hours: Record<string, { start: string; end: string } | null> = {};
    for (let d = 0; d <= 6; d++) {
      const h = body.hours?.[String(d)];
      hours[String(d)] =
        h && /^\d{1,2}:\d{2}$/.test(h.start) && /^\d{1,2}:\d{2}$/.test(h.end) ? h : null;
    }
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        bookingConfig: JSON.stringify({
          enabled: Boolean(body.enabled),
          slotMinutes: Math.min(Math.max(Number(body.slotMinutes) || 60, 10), 240),
          daysAhead: Math.min(Math.max(Number(body.daysAhead) || 14, 1), 60),
          hours,
        }),
      },
    });
    return { ok: true };
  });

  // Paystack connection (per-tenant secret key, verified against their API).
  app.put("/api/tenant/paystack", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { secretKey } = req.body as { secretKey?: string };
    if (!secretKey?.startsWith("sk_")) {
      return reply.code(400).send({ error: "A Paystack secret key (sk_...) is required." });
    }
    if (!(await verifyPaystackKey(secretKey.trim()))) {
      return reply.code(400).send({ error: "Paystack rejected that key — check it and try again." });
    }
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: { paystackSecretKey: secretKey.trim() },
    });
    return { ok: true };
  });

  // Stakes-aware approval gate. Today: payments only (opt-in). When on, the AI
  // proposes invoices and an owner sends the link from the inbox.
  app.put("/api/tenant/approvals", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { payments } = req.body as { payments?: boolean };
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: { requireApproval: JSON.stringify({ payments: Boolean(payments) }) },
    });
    return { ok: true };
  });

  app.get("/api/appointments", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const appointments = await db.appointment.findMany({
      where: { tenantId: auth.tenant.id, startsAt: { gte: new Date(Date.now() - 86_400_000) } },
      include: { contact: { select: { id: true, name: true, phone: true } } },
      orderBy: { startsAt: "asc" },
      take: 100,
    });
    return appointments;
  });

  app.post("/api/appointments/:id/cancel", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const appt = await db.appointment.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!appt) return reply.code(404).send({ error: "not found" });
    await db.appointment.update({ where: { id }, data: { status: "cancelled" } });
    if (appt.googleEventId) await deleteEvent(auth.tenant, appt.googleEventId);
    await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: appt.contactId,
        direction: "out",
        author: "system",
        kind: "event",
        text: "Appointment cancelled by team",
      },
    });
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: appt.contactId });
    return { ok: true };
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
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { phoneNumberId, accessToken, wabaId } = req.body as {
      phoneNumberId?: string;
      accessToken?: string;
      wabaId?: string;
    };
    if (!phoneNumberId?.trim() || !accessToken?.trim()) {
      return reply.code(400).send({ error: "Phone number ID and access token are required." });
    }
    const res = await fetchWithTimeout(
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

  // One-click Embedded Signup: the browser returns a code + phone/waba ids;
  // we exchange for a token, subscribe our app to the WABA, and store creds.
  app.post("/api/tenant/whatsapp/embedded", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { code, phoneNumberId, wabaId } = req.body as {
      code?: string;
      phoneNumberId?: string;
      wabaId?: string;
    };
    if (!code || !phoneNumberId?.trim() || !wabaId?.trim()) {
      return reply.code(400).send({ error: "code, phoneNumberId and wabaId are required." });
    }
    try {
      const token = await exchangeCodeForToken(code);
      await subscribeAppToWaba(wabaId.trim(), token);
      const info = await fetchNumberInfo(phoneNumberId.trim(), token);
      await db.tenant.updateMany({
        where: { waPhoneNumberId: phoneNumberId.trim(), NOT: { id: auth.tenant.id } },
        data: { waPhoneNumberId: null },
      });
      await db.tenant.update({
        where: { id: auth.tenant.id },
        data: {
          waPhoneNumberId: phoneNumberId.trim(),
          waAccessToken: token,
          waWabaId: wabaId.trim(),
        },
      });
      await audit(auth.tenant.id, auth.user.id, "whatsapp.connect", `embedded:${info.number}`);
      return { ok: true, number: info.number, name: info.name };
    } catch (err) {
      if (err instanceof EmbeddedSignupError) {
        return reply.code(400).send({ error: err.message });
      }
      throw err;
    }
  });

  // ---- Knowledge base (RAG) ----

  app.get("/api/kb", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const docs = await db.kbDoc.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { createdAt: "desc" },
      include: { _count: { select: { chunks: true } } },
    });
    return docs.map((d) => ({
      id: d.id,
      title: d.title,
      source: d.source,
      status: d.status,
      chunks: d._count.chunks,
      createdAt: d.createdAt,
    }));
  });

  // Paste text/FAQ content directly.
  app.post("/api/kb", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { title, content } = req.body as { title?: string; content?: string };
    if (!title?.trim() || !content?.trim()) {
      return reply.code(400).send({ error: "A title and content are required." });
    }
    try {
      const { chunkCount } = await ingestDoc(auth.tenant.id, title.trim(), content, "paste");
      return { ok: true, chunks: chunkCount };
    } catch (err) {
      if (err instanceof KbError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // Upload a .txt / .md file.
  app.post("/api/kb/upload", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "A file is required." });
    const name = file.filename || "document";
    if (!/\.(txt|md|markdown)$/i.test(name)) {
      return reply.code(400).send({ error: "Only .txt and .md files are supported." });
    }
    const content = (await file.toBuffer()).toString("utf8");
    try {
      const { chunkCount } = await ingestDoc(
        auth.tenant.id,
        name.replace(/\.(txt|md|markdown)$/i, ""),
        content,
        "upload",
      );
      return { ok: true, chunks: chunkCount };
    } catch (err) {
      if (err instanceof KbError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  app.delete("/api/kb/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const doc = await db.kbDoc.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!doc) return reply.code(404).send({ error: "not found" });
    await db.kbDoc.delete({ where: { id } }); // chunks cascade
    return { ok: true };
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
        appointments: {
          where: { status: "booked", startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
        },
        invoices: { orderBy: { createdAt: "desc" }, take: 10 },
      },
    });
    if (!contact) return reply.code(404).send({ error: "not found" });
    return {
      ...serializeContact(contact),
      messages: contact.messages.map(serializeMessage),
      followUps: contact.followUps.map((f) => ({ id: f.id, dueAt: f.dueAt, note: f.note })),
      appointments: contact.appointments.map((a) => ({
        id: a.id,
        startsAt: a.startsAt,
        note: a.note,
      })),
      invoices: contact.invoices.map((i) => ({
        id: i.id,
        amountKes: i.amountCents / 100,
        description: i.description,
        status: i.status,
        createdAt: i.createdAt,
      })),
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

    const billing = await billingStatus(auth.tenant);
    if (!canSend(billing.state)) {
      return reply.code(402).send({
        error: "Your subscription is inactive — subscribe to send messages again.",
      });
    }

    let waMessageId: string | null = null;
    try {
      waMessageId = await sender.sendText(auth.tenant, contact, text.trim());
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
      data: { aiPaused: true, needsHuman: false, needsReview: false },
    });
    const message = await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "human",
        text: text.trim(),
        waMessageId,
        status: waMessageId ? "sent" : null,
      },
    });
    publish({ type: "message", tenantId: auth.tenant.id, contactId: id });
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    return { message: serializeMessage(message), contact: serializeContact(updated) };
  });

  // Approve a payment the AI proposed (stakes-aware gate): mint the Paystack
  // link now and send it to the customer. Money only leaves on a human's tap.
  app.post("/api/contacts/:id/invoices/:invoiceId/approve", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id, invoiceId } = req.params as { id: string; invoiceId: string };
    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });
    if (contact.optedOut) return reply.code(409).send({ error: "Contact has opted out." });

    const billing = await billingStatus(auth.tenant);
    if (!canSend(billing.state)) {
      return reply.code(402).send({
        error: "Your subscription is inactive — subscribe to send messages again.",
      });
    }

    let approved: Awaited<ReturnType<typeof approveInvoice>>;
    try {
      approved = await approveInvoice(auth.tenant, invoiceId);
    } catch (err) {
      if (err instanceof PaystackError) return reply.code(400).send({ error: err.message });
      throw err;
    }

    const text =
      `Here is your secure payment link for ${approved.description} ` +
      `(KES ${approved.amountKes.toLocaleString()}) — M-Pesa or card: ${approved.payUrl}`;

    // Only push to the customer when the 24h window is open. If it's closed we
    // never fail with the link already minted — we hand it back to the owner to
    // send (or copy) and leave a timeline note. windowIsOpen is checked up front,
    // and the send is still guarded in case it closes between check and send.
    if (windowIsOpen(contact)) {
      try {
        const waMessageId = await sender.sendText(auth.tenant, contact, text);
        await db.message.create({
          data: {
            tenantId: auth.tenant.id,
            contactId: id,
            direction: "out",
            author: "human",
            text,
            waMessageId,
            status: waMessageId ? "sent" : null,
          },
        });
        await audit(
          auth.tenant.id,
          auth.user.id,
          "invoice.approve",
          `${contact.phone} — KES ${approved.amountKes.toLocaleString()}`,
        );
        publish({ type: "message", tenantId: auth.tenant.id, contactId: id });
        publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
        return { ok: true, delivered: true };
      } catch (err) {
        if (!(err instanceof WindowClosedError)) throw err;
        // Window closed between the check and the send — fall through to handoff.
      }
    }

    // Window closed: the link is minted and stored on the invoice. Note it on the
    // timeline and return it so the owner can send it once the customer writes
    // back (or paste it themselves). No customer-facing message goes out here.
    await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: `Payment link ready (KES ${approved.amountKes.toLocaleString()}) — 24h window closed, send it manually`,
      },
    });
    await audit(
      auth.tenant.id,
      auth.user.id,
      "invoice.approve",
      `${contact.phone} — KES ${approved.amountKes.toLocaleString()} (window closed, not sent)`,
    );
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    return { ok: true, delivered: false, payUrl: approved.payUrl };
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
      data: {
        aiPaused: !enabled,
        needsHuman: enabled ? false : contact.needsHuman,
        needsReview: false,
      },
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
    await audit(
      auth.tenant.id,
      auth.user.id,
      enabled ? "ai.resume" : "ai.pause",
      contact.phone,
    );
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
    await audit(auth.tenant.id, auth.user.id, "stage.change", `${contact.phone} → ${stage}`);
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    return serializeContact(updated);
  });

  // Assign (or unassign) a conversation to a teammate.
  app.post("/api/contacts/:id/assign", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const { userId } = req.body as { userId?: string | null };
    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });

    let assignee = null;
    if (userId) {
      assignee = await db.user.findFirst({ where: { id: userId, tenantId: auth.tenant.id } });
      if (!assignee) return reply.code(400).send({ error: "Unknown teammate." });
    }
    const updated = await db.contact.update({
      where: { id },
      data: { assignedUserId: assignee?.id ?? null },
    });
    await db.message.create({
      data: {
        tenantId: auth.tenant.id,
        contactId: id,
        direction: "out",
        author: "system",
        kind: "event",
        text: assignee ? `Assigned to ${assignee.name ?? assignee.email}` : "Unassigned",
      },
    });
    await audit(
      auth.tenant.id,
      auth.user.id,
      "contact.assign",
      `${contact.phone} → ${assignee?.email ?? "unassigned"}`,
    );
    publish({ type: "contact_updated", tenantId: auth.tenant.id, contactId: id });
    publish({ type: "message", tenantId: auth.tenant.id, contactId: id });
    return serializeContact(updated);
  });

  // ODPC right-to-erasure: delete a customer and all of their data.
  app.delete("/api/contacts/:id", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const contact = await db.contact.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!contact) return reply.code(404).send({ error: "not found" });
    await db.$transaction([
      db.message.deleteMany({ where: { contactId: id } }),
      db.followUp.deleteMany({ where: { contactId: id } }),
      db.appointment.deleteMany({ where: { contactId: id } }),
      db.invoice.deleteMany({ where: { contactId: id } }),
      db.contact.delete({ where: { id } }),
    ]);
    return { ok: true };
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
