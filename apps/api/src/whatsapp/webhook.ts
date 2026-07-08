import { createHmac, timingSafeEqual } from "node:crypto";
import * as Sentry from "@sentry/node";
import type { FastifyInstance } from "fastify";
import type { Tenant } from "@prisma/client";
import { config, isProd } from "../config.js";
import { db } from "../db.js";
import type { QueueDriver } from "../queue/queue.js";
import { handleInboundText } from "../inbound.js";
import { markInvoicePaid, verifyPaystackSignature } from "../paystack.js";
import { decryptSecret } from "../secrets.js";
import { PLANS, type TierId } from "../billing.js";
import { audit } from "../audit.js";
import { publish } from "../events.js";
import { downloadMedia } from "./media.js";
import { recordQuality } from "./quality.js";
import { transcribeAudio } from "../transcribe.js";
import { describeImage } from "../vision.js";

interface MediaRef {
  id: string;
  mime_type?: string;
  caption?: string;
}

interface WebhookMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  audio?: MediaRef;
  voice?: MediaRef;
  image?: MediaRef;
  document?: MediaRef;
  video?: MediaRef;
  referral?: { source_url?: string; headline?: string; ctwa_clid?: string };
}

interface WebhookStatus {
  id: string; // wamid of the outbound message
  status: string; // sent | delivered | read | failed
  errors?: Array<{ title?: string; message?: string }>;
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: WebhookMessage[];
  statuses?: WebhookStatus[];
}

export function registerWebhookRoutes(app: FastifyInstance, queue: QueueDriver): void {
  // Meta webhook verification handshake
  app.get("/webhooks/whatsapp", async (req, reply) => {
    const q = req.query as Record<string, string | undefined>;
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === config.WA_VERIFY_TOKEN) {
      return reply.code(200).send(q["hub.challenge"]);
    }
    return reply.code(403).send("verification failed");
  });

  // Paystack events. Two kinds share this URL:
  //  1. Platform billing (Azayon's own account) — subscriptions; verified with
  //     PAYSTACK_PLATFORM_SECRET. Tried first.
  //  2. Tenant customer payments (the tenant's own account) — invoices; verified
  //     with that tenant's secret key, found by invoice reference.
  app.post("/webhooks/paystack", async (req, reply) => {
    const raw = req.body as Buffer;
    try {
      const event = JSON.parse(raw.toString("utf8")) as {
        event?: string;
        data?: Record<string, unknown> & { reference?: string; channel?: string };
      };

      // 1. Platform billing? Only billing events verify with the platform key.
      const sig = req.headers["x-paystack-signature"];
      if (
        config.PAYSTACK_PLATFORM_SECRET &&
        typeof sig === "string" &&
        verifyPaystackSignature(raw, sig, config.PAYSTACK_PLATFORM_SECRET)
      ) {
        await handleBillingEvent(event); // best-effort; always ack a platform-signed event
        return reply.code(200).send("ok");
      }

      const reference = event.data?.reference;
      if (!reference) return reply.code(200).send("ok");
      const invoice = await db.invoice.findUnique({
        where: { paystackRef: reference },
        include: { tenant: true },
      });
      if (!invoice?.tenant.paystackSecretKey) return reply.code(200).send("ok");

      const signature = req.headers["x-paystack-signature"];
      if (
        typeof signature !== "string" ||
        !verifyPaystackSignature(raw, signature, decryptSecret(invoice.tenant.paystackSecretKey))
      ) {
        Sentry.captureMessage("[paystack] webhook signature mismatch", {
          level: "warning",
          extra: { reference, tenantId: invoice.tenantId },
        });
        return reply.code(401).send("bad signature");
      }
      if (event.event === "charge.success") {
        await markInvoicePaid(reference, event.data?.channel ?? null);
      }
      return reply.code(200).send("ok");
    } catch (err) {
      console.error("[paystack] webhook failed:", err);
      return reply.code(200).send("ok");
    }
  });

  // Raw-body content parser is registered in index.ts; req.body is a Buffer here.
  app.post("/webhooks/whatsapp", async (req, reply) => {
    const raw = req.body as Buffer;

    if (config.WA_APP_SECRET) {
      const signature = req.headers["x-hub-signature-256"];
      if (typeof signature !== "string" || !verifySignature(raw, signature)) {
        return reply.code(401).send("bad signature");
      }
    } else if (isProd) {
      // No secret configured but we're in production — we can't verify the
      // payload, so refuse it rather than process a forgeable webhook. (Set
      // WA_APP_SECRET when you connect WhatsApp.) Dev stays permissive.
      return reply.code(401).send("webhook verification not configured");
    }

    // Meta requires a fast 200 — ack first, process via the queue.
    reply.code(200).send("ok");

    try {
      const payload = JSON.parse(raw.toString("utf8"));
      await processPayload(queue, payload);
    } catch (err) {
      console.error("[webhook] failed to process payload:", err);
    }
  });
}

function verifySignature(raw: Buffer, header: string): boolean {
  const expected =
    "sha256=" + createHmac("sha256", config.WA_APP_SECRET!).update(raw).digest("hex");
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

interface TemplateStatusValue {
  event?: string;
  message_template_name?: string;
  reason?: string | null;
}

async function processPayload(queue: QueueDriver, payload: unknown): Promise<void> {
  const entries = (
    payload as {
      entry?: Array<{ id?: string; changes?: Array<{ field?: string; value?: WebhookValue }> }>;
    }
  ).entry;
  if (!Array.isArray(entries)) return;

  for (const entry of entries) {
    for (const change of entry.changes ?? []) {
      // Template approval/rejection decisions arrive on their own field;
      // entry.id is the WABA id for these.
      if (change.field === "message_template_status_update") {
        await handleTemplateStatus(entry.id, change.value as TemplateStatusValue);
        continue;
      }
      // Number-health degradation. entry.id is the WABA id.
      if (change.field === "phone_number_quality_update") {
        await handleQualityUpdate(entry.id, change.value as QualityUpdateValue);
        continue;
      }
      const value = change.value;
      if (!value?.messages && !value?.statuses) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const tenant = phoneNumberId
        ? await db.tenant.findFirst({ where: { waPhoneNumberId: phoneNumberId } })
        : null;
      if (!tenant) {
        console.warn(`[webhook] no tenant for phone_number_id=${phoneNumberId}`);
        continue;
      }

      // Delivery receipts for our outbound messages (sent/delivered/read/failed).
      for (const st of value.statuses ?? []) {
        await db.message.updateMany({
          where: { waMessageId: st.id, tenantId: tenant.id },
          data: {
            status: st.status,
            statusReason: st.errors?.[0]?.title ?? st.errors?.[0]?.message ?? null,
          },
        });
        const msg = await db.message.findFirst({
          where: { waMessageId: st.id, tenantId: tenant.id },
          select: { contactId: true },
        });
        if (msg) publish({ type: "contact_updated", tenantId: tenant.id, contactId: msg.contactId });
      }

      for (const msg of value.messages ?? []) {
        // Resolve text, transcribing voice notes and captioning images so the
        // text-only agent loop can react. Unsupported types get a marker.
        const content = await resolveInboundContent(tenant, msg);
        if (!content) continue;
        // Click-to-WhatsApp ad attribution rides in for free on the referral object.
        const source = msg.referral
          ? `ctwa:${msg.referral.headline ?? msg.referral.ctwa_clid ?? "ad"}`
          : undefined;
        await handleInboundText(queue, {
          tenantId: tenant.id,
          phone: msg.from,
          text: content.text,
          waMessageId: msg.id,
          profileName: value.contacts?.[0]?.profile?.name,
          source,
          channel: "whatsapp",
          mediaType: content.mediaType,
          mediaUrl: content.mediaUrl,
        });
      }
    }
  }
}

interface InboundContent {
  text: string;
  mediaType?: string;
  mediaUrl?: string;
}

/**
 * Turns any inbound WhatsApp message into text the agent can act on. Voice
 * notes are transcribed (Groq), images captioned (Claude vision); other media
 * gets a marker so the AI acknowledges and escalates rather than ghosting the
 * customer. Returns null only for genuinely empty/unhandleable events.
 */
async function resolveInboundContent(
  tenant: Tenant,
  msg: WebhookMessage,
): Promise<InboundContent | null> {
  if (msg.type === "text") {
    return msg.text?.body ? { text: msg.text.body } : null;
  }

  // Voice notes arrive as type "audio" (voice: true) or "voice".
  const audio = msg.audio ?? msg.voice;
  if (audio?.id) {
    try {
      const media = await downloadMedia(tenant, audio.id);
      const transcript = await transcribeAudio(media.bytes, media.mimeType);
      return {
        text: transcript
          ? transcript
          : "[The customer sent a voice note that could not be transcribed. Apologise briefly and ask them to type their message, or escalate to a human.]",
        mediaType: "audio",
        mediaUrl: audio.id,
      };
    } catch (err) {
      console.error("[webhook] voice note handling failed:", err);
      return {
        text: "[The customer sent a voice note that could not be processed. Apologise briefly and ask them to type their message.]",
        mediaType: "audio",
        mediaUrl: audio.id,
      };
    }
  }

  if (msg.image?.id) {
    try {
      const media = await downloadMedia(tenant, msg.image.id);
      const caption = await describeImage(media.bytes, media.mimeType);
      const userCaption = msg.image.caption ? ` Customer's caption: "${msg.image.caption}".` : "";
      return {
        text: caption ? `[Image] ${caption}${userCaption}` : `[The customer sent an image.${userCaption}]`,
        mediaType: "image",
        mediaUrl: msg.image.id,
      };
    } catch (err) {
      console.error("[webhook] image handling failed:", err);
      return {
        text: "[The customer sent an image that could not be processed. Acknowledge it and ask how you can help.]",
        mediaType: "image",
        mediaUrl: msg.image.id,
      };
    }
  }

  // Documents, video, stickers, location, etc. — acknowledge + let the AI route.
  const other = msg.document ?? msg.video;
  if (other?.id) {
    return {
      text: `[The customer sent a ${msg.type} attachment the assistant can't read. Acknowledge it and offer to have the team follow up.]`,
      mediaType: msg.type,
      mediaUrl: other.id,
    };
  }

  return null;
}

const PLAN_BY_CODE: Record<string, TierId> = Object.values(PLANS).reduce(
  (m, p) => (p.planCode ? { ...m, [p.planCode]: p.tier } : m),
  {} as Record<string, TierId>,
);

/**
 * Handles an Azayon subscription event from the platform Paystack account.
 * Resolves the tenant via our metadata or the stored subscription/customer
 * codes, then flips plan state. Best-effort — already verified by signature.
 */
async function handleBillingEvent(event: {
  event?: string;
  data?: Record<string, unknown>;
}): Promise<void> {
  const type = event.event ?? "";
  const data = event.data ?? {};
  const metadata = data.metadata as { azayon_tenant_id?: string; tier?: string } | undefined;
  const customer = data.customer as { customer_code?: string } | undefined;
  const customerCode = customer?.customer_code;
  const subscriptionCode =
    (data.subscription_code as string | undefined) ??
    (data.subscription as { subscription_code?: string } | undefined)?.subscription_code;
  const planCode =
    (data.plan as { plan_code?: string } | undefined)?.plan_code ??
    (data.plan_object as { plan_code?: string } | undefined)?.plan_code;

  let tenant =
    (metadata?.azayon_tenant_id
      ? await db.tenant.findUnique({ where: { id: metadata.azayon_tenant_id } })
      : null) ??
    (subscriptionCode
      ? await db.tenant.findFirst({ where: { paystackSubscriptionCode: subscriptionCode } })
      : null) ??
    (customerCode
      ? await db.tenant.findFirst({ where: { paystackCustomerCode: customerCode } })
      : null);
  if (!tenant) return;

  if (type === "charge.success" || type === "subscription.create") {
    const tier =
      (metadata?.tier as TierId | undefined) ?? (planCode ? PLAN_BY_CODE[planCode] : undefined);
    const nextPay = data.next_payment_date as string | undefined;
    await db.tenant.update({
      where: { id: tenant.id },
      data: {
        plan: "active",
        ...(tier ? { planTier: tier } : {}),
        ...(subscriptionCode ? { paystackSubscriptionCode: subscriptionCode } : {}),
        ...(customerCode ? { paystackCustomerCode: customerCode } : {}),
        ...(nextPay ? { planRenewsAt: new Date(nextPay) } : {}),
      },
    });
    await audit(tenant.id, null, "billing.activated", `${type} → ${tier ?? "active"}`);
  } else if (
    type === "invoice.payment_failed" ||
    type === "subscription.disable" ||
    type === "subscription.not_renew"
  ) {
    await db.tenant.update({ where: { id: tenant.id }, data: { plan: "past_due" } });
    await audit(tenant.id, null, "billing.past_due", type);
  }
}

interface QualityUpdateValue {
  event?: string; // FLAGGED | UNFLAGGED | ...
  current_limit?: string; // messaging tier
}

async function handleQualityUpdate(
  wabaId: string | undefined,
  value: QualityUpdateValue | undefined,
): Promise<void> {
  if (!wabaId || !value) return;
  const tenant = await db.tenant.findFirst({ where: { waWabaId: wabaId } });
  if (!tenant) return;
  // The webhook signals a flag event; the precise GREEN/YELLOW/RED comes from
  // the Graph poll. Treat FLAGGED conservatively so the owner is alerted now.
  const rating =
    value.event === "FLAGGED" ? "RED" : value.event === "UNFLAGGED" ? "GREEN" : null;
  await recordQuality(tenant, rating, value.current_limit ?? null);
}

async function handleTemplateStatus(
  wabaId: string | undefined,
  value: TemplateStatusValue | undefined,
): Promise<void> {
  if (!wabaId || !value?.message_template_name || !value.event) return;
  const status = value.event.toLowerCase(); // approved | rejected | pending | paused...
  const tenant =
    (await db.tenant.findFirst({ where: { waWabaId: wabaId } })) ??
    (config.WA_WABA_ID === wabaId
      ? await db.tenant.findFirst({ where: { waPhoneNumberId: config.WA_PHONE_NUMBER_ID } })
      : null);
  if (!tenant) return;
  await db.template.updateMany({
    where: { tenantId: tenant.id, name: value.message_template_name },
    data: { status, rejectionReason: value.reason ?? null },
  });
  console.log(`[webhook] template "${value.message_template_name}" -> ${status}`);
}
