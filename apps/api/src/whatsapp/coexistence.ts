import type { Tenant } from "@prisma/client";
import { db } from "../db.js";
import { publish } from "../events.js";

/**
 * Coexistence ingestion — the three webhooks that carry a business's existing
 * WhatsApp life into Azayon.
 *
 * In Coexistence the owner keeps using the WhatsApp Business app on their phone while
 * the Cloud API runs alongside it. That means three things happen outside our reach
 * unless we ingest them:
 *
 *  - `smb_app_state_sync` — their address book (names for numbers we'd otherwise show raw).
 *  - `history`            — up to 180 days of past conversations, in chunks.
 *  - `smb_message_echoes` — messages the owner sends FROM THEIR OWN PHONE. Without this,
 *                           the inbox shows only half the conversation, and the AI can
 *                           answer on top of an owner who has already replied.
 *
 * Nothing here goes through `handleInboundText`: historical and echoed messages must
 * never wake the agent. They're written straight to the timeline.
 */

const digits = (s: string) => (s ?? "").replace(/\D/g, "");

/** Prisma unique-violation — the webhook was redelivered, which Meta does freely. */
const isDuplicate = (err: unknown) =>
  typeof err === "object" && err !== null && (err as { code?: string }).code === "P2002";

interface WaMessage {
  id?: string;
  from?: string;
  to?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { caption?: string };
  video?: { caption?: string };
  document?: { caption?: string; filename?: string };
  history_context?: { status?: string };
}

/**
 * Render a historical/echoed message as timeline text.
 *
 * Deliberately does NOT transcribe voice notes or caption images the way the live
 * inbound path does — that costs a model call per message, and a history sync can carry
 * thousands. A marker is enough for a message the AI will never have to act on.
 */
function describe(msg: WaMessage): { text: string; mediaType?: string } {
  switch (msg.type) {
    case "text":
      return { text: msg.text?.body ?? "" };
    case "image":
      return { text: msg.image?.caption || "[image]", mediaType: "image" };
    case "video":
      return { text: msg.video?.caption || "[video]", mediaType: "video" };
    case "audio":
    case "voice":
      return { text: "[voice note]", mediaType: "audio" };
    case "document":
      return {
        text: msg.document?.caption || msg.document?.filename || "[document]",
        mediaType: "document",
      };
    case "sticker":
      return { text: "[sticker]", mediaType: "sticker" };
    case "location":
      return { text: "[location]", mediaType: "location" };
    default:
      return { text: `[${msg.type ?? "unsupported"}]`, mediaType: msg.type };
  }
}

const firstStageOf = (tenant: Tenant) => (JSON.parse(tenant.stages) as string[])[0] ?? "New Lead";

// ---------------------------------------------------------------- contacts

export interface StateSyncValue {
  state_sync?: Array<{
    type?: string;
    action?: "add" | "remove";
    contact?: { full_name?: string; first_name?: string; phone_number?: string };
  }>;
}

/** The owner's WhatsApp address book. `add` covers both new and edited contacts. */
export async function ingestContacts(tenant: Tenant, value: StateSyncValue): Promise<number> {
  const stage = firstStageOf(tenant);
  let touched = 0;
  let lastId: string | null = null;

  for (const entry of value.state_sync ?? []) {
    const phone = digits(entry.contact?.phone_number ?? "");
    if (!phone) continue;

    if (entry.action === "remove") {
      /**
       * They deleted someone from the address book on their phone. That is NOT an
       * instruction to delete a CRM record that may carry conversations, appointments
       * and invoices. Keep the lead; drop nothing.
       */
      console.log(
        `[coexistence] ${phone} removed from the phone's address book — keeping the CRM record`,
      );
      continue;
    }

    const name = entry.contact?.full_name || entry.contact?.first_name || undefined;
    const contact = await db.contact.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      create: { tenantId: tenant.id, phone, name, stage, source: "whatsapp_contacts" },
      // Never blank an existing name with an empty sync entry.
      update: name ? { name } : {},
    });
    lastId = contact.id;
    touched++;
  }

  // One event, not one per contact — a sync can carry hundreds, and the client
  // refetches the whole list on any event anyway.
  if (lastId) publish({ type: "contact_updated", tenantId: tenant.id, contactId: lastId });
  return touched;
}

// ---------------------------------------------------------------- history

export interface HistoryValue {
  metadata?: { display_phone_number?: string; phone_number_id?: string };
  history?: Array<{
    metadata?: { phase?: number; chunk_order?: number; progress?: number };
    threads?: Array<{ id?: string; messages?: WaMessage[] }>;
  }>;
}

/**
 * Past conversations, delivered in chunks across three phases covering 180 days.
 * `progress` reaches 100 when the sync is done.
 */
export async function ingestHistory(
  tenant: Tenant,
  value: HistoryValue,
): Promise<{ imported: number; progress: number }> {
  // A message is outbound if the business's own number sent it.
  const businessPhone = digits(value.metadata?.display_phone_number ?? tenant.waDisplayPhone ?? "");
  const stage = firstStageOf(tenant);
  let imported = 0;
  let progress = 0;

  for (const chunk of value.history ?? []) {
    progress = chunk.metadata?.progress ?? progress;

    for (const thread of chunk.threads ?? []) {
      const phone = digits(thread.id ?? "");
      if (!phone) continue;

      let newestInbound: Date | null = null;
      const rows = [];

      for (const m of thread.messages ?? []) {
        // Without a wamid we can't dedupe, and Meta redelivers freely — skip.
        if (!m.id) continue;
        // Not renderable timeline entries; they mutate other messages.
        if (m.type === "revoke" || m.type === "edit") continue;

        const outbound = businessPhone !== "" && digits(m.from ?? "") === businessPhone;
        const at = new Date(Number(m.timestamp ?? 0) * 1000);
        if (Number.isNaN(at.getTime())) continue;
        if (!outbound && (!newestInbound || at > newestInbound)) newestInbound = at;

        const { text, mediaType } = describe(m);
        rows.push({
          waMessageId: m.id,
          direction: outbound ? "out" : "in",
          // The business sent these from their own phone, by hand — not our AI.
          author: outbound ? "human" : "customer",
          text,
          mediaType,
          createdAt: at,
          status: outbound ? (m.history_context?.status ?? "").toLowerCase() || null : null,
        });
      }
      if (!rows.length) continue;

      const contact = await db.contact.upsert({
        where: { tenantId_phone: { tenantId: tenant.id, phone } },
        create: {
          tenantId: tenant.id,
          phone,
          stage,
          source: "whatsapp_history",
          lastInboundAt: newestInbound,
        },
        update: {},
      });

      /**
       * lastInboundAt drives the 24h customer-service window, so it must reflect the
       * genuinely newest inbound — history arrives out of order across chunks, and an
       * older chunk must not drag it backwards.
       */
      if (newestInbound && (!contact.lastInboundAt || newestInbound > contact.lastInboundAt)) {
        await db.contact.update({
          where: { id: contact.id },
          data: { lastInboundAt: newestInbound },
        });
      }

      // Meta redelivers chunks, and phases overlap. Filter against what we hold before
      // writing, so a redelivery is cheap instead of throwing a unique violation per row.
      const existing = await db.message.findMany({
        where: { waMessageId: { in: rows.map((r) => r.waMessageId) } },
        select: { waMessageId: true },
      });
      const seen = new Set(existing.map((e) => e.waMessageId));
      const fresh = rows.filter((r) => !seen.has(r.waMessageId));
      if (!fresh.length) continue;

      const data = fresh.map((r) => ({ ...r, tenantId: tenant.id, contactId: contact.id }));
      try {
        await db.message.createMany({ data });
        imported += data.length;
      } catch (err) {
        // A concurrent redelivery slipped between the filter and the write. Fall back to
        // one-by-one so a single collision doesn't lose the rest of the chunk.
        if (!isDuplicate(err)) throw err;
        for (const row of data) {
          try {
            await db.message.create({ data: row });
            imported++;
          } catch (e) {
            if (!isDuplicate(e)) throw e;
          }
        }
      }

      publish({ type: "contact_updated", tenantId: tenant.id, contactId: contact.id });
    }
  }

  return { imported, progress };
}

// ---------------------------------------------------------------- echoes

export interface MessageEchoesValue {
  message_echoes?: WaMessage[];
}

/**
 * Messages the owner sent from the WhatsApp Business app on their own phone.
 *
 * This is what makes Coexistence coherent. Without it the owner replies on their phone,
 * Azayon never learns of it, the inbox shows a half-conversation, and the AI merrily
 * answers a question the owner already answered.
 *
 * Ingesting an echo therefore also PAUSES the AI for that contact — the same rule as
 * "Take over" in the web inbox, which already sets aiPaused on a human send. A human
 * has the conversation; the AI stands down until it's handed back.
 */
export async function ingestMessageEchoes(
  tenant: Tenant,
  value: MessageEchoesValue,
): Promise<number> {
  const stage = firstStageOf(tenant);
  let imported = 0;

  for (const m of value.message_echoes ?? []) {
    if (!m.id) continue;
    if (m.type === "revoke" || m.type === "edit") {
      console.log(`[coexistence] echo ${m.id} is a ${m.type} — not ingested`);
      continue;
    }
    const phone = digits(m.to ?? "");
    if (!phone) continue;

    const at = new Date(Number(m.timestamp ?? 0) * 1000);
    const { text, mediaType } = describe(m);

    const contact = await db.contact.upsert({
      where: { tenantId_phone: { tenantId: tenant.id, phone } },
      create: { tenantId: tenant.id, phone, stage, source: "whatsapp_app" },
      update: {},
    });

    try {
      await db.message.create({
        data: {
          tenantId: tenant.id,
          contactId: contact.id,
          direction: "out",
          author: "human",
          text,
          mediaType,
          waMessageId: m.id,
          status: "sent",
          createdAt: Number.isNaN(at.getTime()) ? new Date() : at,
        },
      });
    } catch (err) {
      if (isDuplicate(err)) continue; // redelivery
      throw err;
    }

    // The owner is handling this one by hand — don't let the AI talk over them.
    await db.contact.update({
      where: { id: contact.id },
      data: { aiPaused: true, needsHuman: false },
    });

    publish({ type: "message", tenantId: tenant.id, contactId: contact.id });
    publish({ type: "contact_updated", tenantId: tenant.id, contactId: contact.id });
    imported++;
  }

  return imported;
}
