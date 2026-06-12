import { createHmac, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { config } from "../config.js";
import { db } from "../db.js";
import type { QueueDriver } from "../queue/queue.js";
import { handleInboundText } from "../inbound.js";

interface WebhookMessage {
  id: string;
  from: string;
  type: string;
  text?: { body: string };
  referral?: { source_url?: string; headline?: string; ctwa_clid?: string };
}

interface WebhookValue {
  metadata?: { phone_number_id?: string };
  contacts?: Array<{ profile?: { name?: string } }>;
  messages?: WebhookMessage[];
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

  // Raw-body content parser is registered in index.ts; req.body is a Buffer here.
  app.post("/webhooks/whatsapp", async (req, reply) => {
    const raw = req.body as Buffer;

    if (config.WA_APP_SECRET) {
      const signature = req.headers["x-hub-signature-256"];
      if (typeof signature !== "string" || !verifySignature(raw, signature)) {
        return reply.code(401).send("bad signature");
      }
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
      const value = change.value;
      if (!value?.messages) continue;

      const phoneNumberId = value.metadata?.phone_number_id;
      const tenant = phoneNumberId
        ? await db.tenant.findFirst({ where: { waPhoneNumberId: phoneNumberId } })
        : null;
      if (!tenant) {
        console.warn(`[webhook] no tenant for phone_number_id=${phoneNumberId}`);
        continue;
      }

      for (const msg of value.messages ?? []) {
        if (msg.type !== "text" || !msg.text?.body) continue; // media: Slice 2
        // Click-to-WhatsApp ad attribution rides in for free on the referral object.
        const source = msg.referral
          ? `ctwa:${msg.referral.headline ?? msg.referral.ctwa_clid ?? "ad"}`
          : undefined;
        await handleInboundText(queue, {
          tenantId: tenant.id,
          phone: msg.from,
          text: msg.text.body,
          waMessageId: msg.id,
          profileName: value.contacts?.[0]?.profile?.name,
          source,
        });
      }
    }
  }
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
