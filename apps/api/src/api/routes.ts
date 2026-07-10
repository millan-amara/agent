import type { FastifyInstance } from "fastify";
import type { Contact, Message, Invoice, InvoiceItem, Tenant } from "@prisma/client";
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
import {
  parseDigestConfig,
  buildDigest,
  deliverDigest,
  renderDigestText,
  type DigestChannel,
} from "../digest.js";
import { parseBookingConfig, type BookingConfig } from "../booking.js";
import { draftBusinessDescription } from "../agent/draft.js";
import {
  verifyPaystackKey,
  approveInvoice,
  createInvoice,
  PaystackError,
  type InvoiceItemInput,
} from "../paystack.js";
import { config } from "../config.js";
import { encryptSecret } from "../secrets.js";
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

// Human invoice number rendered as INV-0042.
const invoiceRef = (number: number) => `INV-${String(number).padStart(4, "0")}`;

type InvoiceWithRelations = Invoice & {
  items: InvoiceItem[];
  contact: Pick<Contact, "id" | "name" | "phone">;
};

const serializeInvoice = (inv: InvoiceWithRelations) => ({
  id: inv.id,
  number: inv.number,
  ref: invoiceRef(inv.number),
  amountKes: inv.amountCents / 100,
  taxRate: inv.taxRate,
  taxKes: inv.taxCents / 100,
  currency: inv.currency,
  description: inv.description,
  notes: inv.notes,
  status: inv.status,
  payUrl: inv.payUrl,
  publicUrl: `${config.APP_BASE_URL}/i/${inv.publicToken}`,
  dueDate: inv.dueDate,
  issuedAt: inv.issuedAt,
  paidAt: inv.paidAt,
  createdAt: inv.createdAt,
  contact: { id: inv.contact.id, name: inv.contact.name, phone: inv.contact.phone },
  items: inv.items.map((i) => ({
    id: i.id,
    description: i.description,
    quantity: i.quantity,
    unitKes: i.unitCents / 100,
    lineKes: (i.quantity * i.unitCents) / 100,
  })),
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
      digest: parseDigestConfig(auth.tenant),
      ownerChat: {
        enabled: auth.tenant.ownerChatEnabled,
        phone: auth.tenant.ownerPhone ?? "",
      },
      publicPage: {
        enabled: auth.tenant.publicEnabled,
        slug: auth.tenant.slug ?? "",
        url: auth.tenant.slug ? `${config.APP_BASE_URL}/b/${auth.tenant.slug}` : "",
        waConnected: Boolean(auth.tenant.waDisplayPhone || auth.tenant.waPhoneNumberId),
      },
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
      branding: {
        logoUrl: auth.tenant.logoUrl,
        businessPhone: auth.tenant.businessPhone,
        businessEmail: auth.tenant.businessEmail,
        payInstructions: auth.tenant.payInstructions,
      },
    };
  });

  // Invoice branding shown on the public hosted invoice page.
  app.put("/api/tenant/branding", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const body = req.body as {
      logoUrl?: string | null;
      businessPhone?: string | null;
      businessEmail?: string | null;
      payInstructions?: string | null;
    };
    const clean = (v: string | null | undefined, max: number) => {
      const s = (v ?? "").trim();
      return s ? s.slice(0, max) : null;
    };
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        // Large cap: logoUrl may be a base64 data: URL from the upload endpoint,
        // not just a pasted http(s) URL.
        logoUrl: clean(body.logoUrl, 1_500_000),
        businessPhone: clean(body.businessPhone, 40),
        businessEmail: clean(body.businessEmail, 120),
        payInstructions: clean(body.payInstructions, 500),
      },
    });
    return { ok: true };
  });

  // Logo upload — stored inline as a base64 data: URL on the tenant (no object
  // storage configured; logos are small). Returns the URL for the form to preview.
  app.post("/api/tenant/logo", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const file = await req.file();
    if (!file) return reply.code(400).send({ error: "A file is required." });
    if (!/^image\/(png|jpe?g|webp|gif)$/i.test(file.mimetype)) {
      return reply.code(400).send({ error: "Use a PNG, JPG, WEBP or GIF image." });
    }
    let buf: Buffer;
    try {
      buf = await file.toBuffer();
    } catch {
      // @fastify/multipart throws once the 2MB part limit is exceeded.
      return reply.code(400).send({ error: "Image is too large." });
    }
    if (buf.length > 512 * 1024) {
      return reply.code(400).send({ error: "Logo must be under 512KB." });
    }
    const logoUrl = `data:${file.mimetype};base64,${buf.toString("base64")}`;
    await db.tenant.update({ where: { id: auth.tenant.id }, data: { logoUrl } });
    return { logoUrl };
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
      data: { paystackSecretKey: encryptSecret(secretKey.trim()) },
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

  // Draft (or polish) the business description with the AI — powers the
  // "Draft with AI" button in the guided profile builder.
  app.post("/api/tenant/profile/draft", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { seed } = (req.body ?? {}) as { seed?: string };
    try {
      const description = await draftBusinessDescription({
        tenantId: auth.tenant.id,
        businessName: auth.tenant.name,
        seed,
      });
      return { description };
    } catch (err) {
      return reply.code(503).send({ error: (err as Error).message || "Couldn't draft right now." });
    }
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

  // Owner morning digest configuration.
  app.put("/api/tenant/digest", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { enabled, hour, channel, ownerPhone } = req.body as {
      enabled?: boolean;
      hour?: number;
      channel?: string;
      ownerPhone?: string;
    };
    const h = Number(hour);
    const safeHour = Number.isInteger(h) && h >= 0 && h <= 23 ? h : 7;
    const safeChannel: DigestChannel =
      channel === "whatsapp" || channel === "email" ? channel : "auto";
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: {
        digestConfig: JSON.stringify({
          enabled: Boolean(enabled),
          hour: safeHour,
          channel: safeChannel,
          ownerPhone: (ownerPhone ?? "").replace(/\D/g, ""),
        }),
      },
    });
    return { ok: true };
  });

  // Preview today's digest (computed, not sent) — powers the settings preview.
  app.get("/api/digest/preview", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const data = await buildDigest(auth.tenant.id, new Date());
    return { config: parseDigestConfig(auth.tenant), data, text: renderDigestText(auth.tenant, data) };
  });

  // Send a digest right now (owner-only) — "try it" button. Does not touch the
  // once-per-day DigestLog, so it never blocks the scheduled morning send.
  app.post("/api/digest/test", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const data = await buildDigest(auth.tenant.id, new Date());
    try {
      const result = await deliverDigest(auth.tenant, sender, data);
      if (!result.delivered) {
        return reply.code(422).send({ error: `Not delivered: ${result.reason}`, channel: result.channel });
      }
      return { ok: true, channel: result.channel };
    } catch (err) {
      return reply.code(502).send({ error: err instanceof Error ? err.message : "send failed" });
    }
  });

  // Owner chat: the owner's own WhatsApp number + whether messages from it are
  // routed to the private read-only assistant. The number is also used by the
  // digest, so it lives on the tenant, not in digestConfig.
  app.put("/api/tenant/owner-chat", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { enabled, phone } = req.body as { enabled?: boolean; phone?: string };
    const digits = (phone ?? "").replace(/\D/g, "");
    if (enabled && digits.length < 9) {
      return reply.code(400).send({ error: "Enter your WhatsApp number in full international format." });
    }
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: { ownerChatEnabled: Boolean(enabled), ownerPhone: digits || null },
    });
    return { ok: true };
  });

  // Public business page opt-in + slug.
  app.put("/api/tenant/public", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { enabled, slug } = req.body as { enabled?: boolean; slug?: string };
    const clean = (slug ?? "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40);
    if (enabled && clean.length < 3) {
      return reply.code(400).send({ error: "Choose a page name of at least 3 characters (letters and numbers)." });
    }
    if (clean) {
      const taken = await db.tenant.findFirst({
        where: { slug: clean, NOT: { id: auth.tenant.id } },
        select: { id: true },
      });
      if (taken) return reply.code(409).send({ error: "That page name is taken — try another." });
    }
    await db.tenant.update({
      where: { id: auth.tenant.id },
      data: { publicEnabled: Boolean(enabled), slug: clean || null },
    });
    return { ok: true, slug: clean, url: clean ? `${config.APP_BASE_URL}/b/${clean}` : "" };
  });

  // Public, unauthenticated business page data. Public-safe fields only — never
  // contacts, messages, or stats. Gated on opt-in + onboarding.
  app.get("/api/public/business/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const tenant = await db.tenant.findUnique({ where: { slug } });
    if (!tenant || !tenant.publicEnabled || !tenant.onboarded) {
      return reply.code(404).send({ error: "Business not found" });
    }
    const p = JSON.parse(tenant.businessProfile) as BusinessProfile;
    const waNumber = (tenant.waDisplayPhone ?? "").replace(/\D/g, "");
    const greeting = encodeURIComponent(`Hi ${tenant.name}, I found you online and have a question.`);
    return {
      name: tenant.name,
      vertical: tenant.vertical,
      description: p.description ?? "",
      services: (p.services ?? []).slice(0, 50),
      faqs: (p.faqs ?? []).slice(0, 50),
      hours: p.businessHours ?? "",
      logoUrl: tenant.logoUrl,
      phone: tenant.businessPhone,
      email: tenant.businessEmail,
      waLink: waNumber ? `https://wa.me/${waNumber}?text=${greeting}` : null,
    };
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
        waAccessToken: encryptSecret(accessToken.trim()),
        waDisplayPhone: (info.display_phone_number ?? "").replace(/\D/g, "") || null,
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
          waAccessToken: encryptSecret(token),
          waWabaId: wabaId.trim(),
          waDisplayPhone: (info.number ?? "").replace(/\D/g, "") || null,
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
  // Upload → embeddings (Voyage) cost; rate-limit per IP to bound spend.
  app.post(
    "/api/kb/upload",
    { config: { rateLimit: { max: 20, timeWindow: "1 minute" } } },
    async (req, reply) => {
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

  // ---- Invoices (proper line-item documents) -------------------------------
  // The contact-scoped /approve route above handles the AI-proposed flow. These
  // routes cover owner-created invoices and the shared lifecycle (list/send/cancel)
  // plus the public hosted document.

  const invoiceInclude = {
    items: true,
    contact: { select: { id: true, name: true, phone: true } },
  } as const;

  // Sends the hosted invoice link to the customer over WhatsApp when the 24h
  // window is open; otherwise leaves a timeline note for the owner to send the
  // link manually. Flips a draft to "pending" (issued) and stamps issuedAt.
  async function issueInvoice(tenant: Tenant, contact: Contact, invoice: Invoice, userId: string) {
    const ref = invoiceRef(invoice.number);
    const publicUrl = `${config.APP_BASE_URL}/i/${invoice.publicToken}`;
    const amountKes = invoice.amountCents / 100;
    const text =
      `Invoice ${ref} from ${tenant.name}: KES ${amountKes.toLocaleString()} — ${invoice.description}. ` +
      `View${invoice.payUrl ? " and pay" : ""} here: ${publicUrl}`;

    // Issue once: draft -> pending, stamp issuedAt. Re-sends keep both stable.
    if (invoice.status === "draft" || !invoice.issuedAt) {
      await db.invoice.update({
        where: { id: invoice.id },
        data: {
          status: invoice.status === "draft" ? "pending" : invoice.status,
          issuedAt: invoice.issuedAt ?? new Date(),
        },
      });
    }

    if (windowIsOpen(contact)) {
      try {
        const waMessageId = await sender.sendText(tenant, contact, text);
        await db.message.create({
          data: {
            tenantId: tenant.id,
            contactId: contact.id,
            direction: "out",
            author: "human",
            text,
            waMessageId,
            status: waMessageId ? "sent" : null,
          },
        });
        await audit(tenant.id, userId, "invoice.send", `${contact.phone} — ${ref} KES ${amountKes.toLocaleString()}`);
        publish({ type: "message", tenantId: tenant.id, contactId: contact.id });
        publish({ type: "contact_updated", tenantId: tenant.id, contactId: contact.id });
        return { delivered: true, publicUrl };
      } catch (err) {
        if (!(err instanceof WindowClosedError)) throw err;
        // Window closed between check and send — fall through to handoff note.
      }
    }

    await db.message.create({
      data: {
        tenantId: tenant.id,
        contactId: contact.id,
        direction: "out",
        author: "system",
        kind: "event",
        text: `Invoice ${ref} ready (KES ${amountKes.toLocaleString()}) — 24h window closed, send the link manually: ${publicUrl}`,
      },
    });
    await audit(tenant.id, userId, "invoice.send", `${contact.phone} — ${ref} (window closed, not sent)`);
    publish({ type: "contact_updated", tenantId: tenant.id, contactId: contact.id });
    return { delivered: false, publicUrl };
  }

  // List all invoices for the back-office tab. Agents may view; only owners
  // create/send/cancel (gated below). Optional ?status= filter.
  app.get("/api/invoices", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { status } = req.query as { status?: string };
    const invoices = await db.invoice.findMany({
      where: { tenantId: auth.tenant.id, ...(status ? { status } : {}) },
      include: invoiceInclude,
      orderBy: { createdAt: "desc" },
    });
    return invoices.map(serializeInvoice);
  });

  // Create a line-item invoice. Any team member may invoice (like the inbox
  // approve flow) — invoices touch the customer chat, not Azayon billing.
  // Optionally mints a Paystack pay link and sends it immediately (send=true).
  app.post("/api/invoices", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const body = req.body as {
      contactId?: string;
      items?: Array<{ description?: string; quantity?: number; unitKes?: number }>;
      description?: string;
      notes?: string;
      dueDate?: string;
      taxRate?: number;
      withPayLink?: boolean;
      send?: boolean;
    };
    if (!body.contactId) return reply.code(400).send({ error: "contactId is required" });
    const contact = await db.contact.findFirst({
      where: { id: body.contactId, tenantId: auth.tenant.id },
    });
    if (!contact) return reply.code(404).send({ error: "Contact not found" });
    if (body.send && contact.optedOut) {
      return reply.code(409).send({ error: "Contact has opted out — can't send." });
    }

    const items: InvoiceItemInput[] = (body.items ?? [])
      .map((i) => ({
        description: String(i.description ?? "").trim(),
        quantity: Math.round(Number(i.quantity ?? 1)),
        unitCents: Math.round(Number(i.unitKes ?? 0) * 100),
      }))
      .filter((i) => i.description && i.quantity > 0 && i.unitCents > 0);
    if (items.length === 0) {
      return reply.code(400).send({ error: "Add at least one line item with a description and amount." });
    }
    if (body.withPayLink && !auth.tenant.paystackSecretKey) {
      return reply.code(400).send({ error: "Connect Paystack before attaching a payment link." });
    }

    try {
      const created = await createInvoice(auth.tenant, contact, {
        items,
        description: body.description,
        notes: body.notes,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        taxRate: Number(body.taxRate) || 0,
        withPayLink: Boolean(body.withPayLink),
      });
      const invoice = await db.invoice.findUniqueOrThrow({ where: { id: created.invoiceId } });
      await audit(
        auth.tenant.id,
        auth.user.id,
        "invoice.create",
        `${contact.phone} — ${invoiceRef(invoice.number)} KES ${(invoice.amountCents / 100).toLocaleString()}`,
      );
      if (body.send) await issueInvoice(auth.tenant, contact, invoice, auth.user.id);
      const full = await db.invoice.findUniqueOrThrow({
        where: { id: created.invoiceId },
        include: invoiceInclude,
      });
      return reply.code(201).send(serializeInvoice(full));
    } catch (err) {
      if (err instanceof PaystackError) return reply.code(400).send({ error: err.message });
      throw err;
    }
  });

  // Send (or re-send) an issued invoice's hosted link to the customer.
  app.post("/api/invoices/:id/send", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const invoice = await db.invoice.findFirst({
      where: { id, tenantId: auth.tenant.id },
      include: { contact: true },
    });
    if (!invoice) return reply.code(404).send({ error: "not found" });
    if (invoice.status === "paid" || invoice.status === "cancelled") {
      return reply.code(409).send({ error: `Invoice is already ${invoice.status}.` });
    }
    if (invoice.contact.optedOut) return reply.code(409).send({ error: "Contact has opted out." });
    const result = await issueInvoice(auth.tenant, invoice.contact, invoice, auth.user.id);
    const full = await db.invoice.findUniqueOrThrow({ where: { id }, include: invoiceInclude });
    return { ok: true, ...result, invoice: serializeInvoice(full) };
  });

  // Cancel an unpaid invoice.
  app.post("/api/invoices/:id/cancel", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { id } = req.params as { id: string };
    const invoice = await db.invoice.findFirst({ where: { id, tenantId: auth.tenant.id } });
    if (!invoice) return reply.code(404).send({ error: "not found" });
    if (invoice.status === "paid") {
      return reply.code(409).send({ error: "Paid invoices can't be cancelled." });
    }
    await db.invoice.update({ where: { id }, data: { status: "cancelled" } });
    await audit(auth.tenant.id, auth.user.id, "invoice.cancel", invoiceRef(invoice.number));
    return { ok: true };
  });

  // Public hosted invoice document. No auth — the unguessable token is the
  // capability. The web app's /i/<token> page renders this. AI-proposed invoices
  // (pending_approval) aren't yet real and stay hidden until an owner sends them.
  app.get("/api/public/invoices/:token", async (req, reply) => {
    const { token } = req.params as { token: string };
    const invoice = await db.invoice.findUnique({
      where: { publicToken: token },
      include: {
        items: true,
        tenant: {
          select: {
            name: true,
            logoUrl: true,
            businessPhone: true,
            businessEmail: true,
            payInstructions: true,
          },
        },
        contact: { select: { name: true, phone: true } },
      },
    });
    if (!invoice || invoice.status === "pending_approval") {
      return reply.code(404).send({ error: "Invoice not found" });
    }
    return {
      ref: invoiceRef(invoice.number),
      business: invoice.tenant.name,
      logoUrl: invoice.tenant.logoUrl,
      businessPhone: invoice.tenant.businessPhone,
      businessEmail: invoice.tenant.businessEmail,
      // Offline payment instructions only matter when there's no online pay link.
      payInstructions: invoice.payUrl ? null : invoice.tenant.payInstructions,
      customer: invoice.contact.name ?? invoice.contact.phone,
      amountKes: invoice.amountCents / 100,
      taxRate: invoice.taxRate,
      taxKes: invoice.taxCents / 100,
      currency: invoice.currency,
      description: invoice.description,
      notes: invoice.notes,
      status: invoice.status,
      payUrl: invoice.payUrl,
      dueDate: invoice.dueDate,
      issuedAt: invoice.issuedAt,
      paidAt: invoice.paidAt,
      items: invoice.items.map((i) => ({
        description: i.description,
        quantity: i.quantity,
        unitKes: i.unitCents / 100,
        lineKes: (i.quantity * i.unitCents) / 100,
      })),
    };
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
