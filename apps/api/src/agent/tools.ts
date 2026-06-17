import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Tenant } from "@prisma/client";
import { db } from "../db.js";
import { publish } from "../events.js";
import { computeAvailableSlots, formatSlot, parseBookingConfig } from "../booking.js";
import { createPaymentLink, createPendingInvoice, PaystackError } from "../paystack.js";
import { hasKnowledgeBase, searchKb } from "../kb.js";
import { pushEvent } from "../google.js";

export interface ToolContext {
  tenant: Tenant;
  contact: Contact;
  stages: string[];
}

// Hard ceiling on a single AI-initiated invoice (defense in depth; the approval
// gate is the primary control). Owners can raise larger invoices manually.
const MAX_AI_INVOICE_KES = 1_000_000;
// Caps on attacker-controlled free text the AI persists to the contact record.
const MAX_LEAD_FIELDS = 30;
const MAX_LEAD_KEY_LEN = 60;
const MAX_LEAD_VALUE_LEN = 500;

export interface TenantCapabilities {
  booking: boolean;
  payments: boolean;
  kb: boolean;
}

/**
 * Whether this tenant gates customer-facing payments behind owner approval
 * (stakes-aware: money is the one thing the AI drafts but never sends on a
 * guess). Fail-safe DEFAULT ON: a human approves the payment link unless the
 * owner has explicitly opted into auto-send (`payments: false`). This keeps a
 * customer from socially-engineering the AI into sending an arbitrary live link.
 */
export function paymentApprovalRequired(tenant: Tenant): boolean {
  try {
    const cfg = JSON.parse(tenant.requireApproval) as { payments?: boolean };
    return cfg.payments !== false;
  } catch {
    return true;
  }
}

export async function tenantCapabilities(tenant: Tenant): Promise<TenantCapabilities> {
  return {
    booking: parseBookingConfig(tenant).enabled,
    payments: Boolean(tenant.paystackSecretKey),
    kb: await hasKnowledgeBase(tenant.id),
  };
}

export function buildTools(stages: string[], caps: TenantCapabilities): Anthropic.Tool[] {
  const tools = baseTools(stages);
  if (caps.booking) {
    tools.push(
      {
        name: "get_available_slots",
        description:
          "Get the next available appointment slots from the business calendar. Call this BEFORE " +
          "offering any appointment time — never invent availability. Offer the customer 2–3 options.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "book_appointment",
        description:
          "Book an appointment for this customer in a slot returned by get_available_slots. " +
          "Only call after the customer has clearly chosen a time.",
        input_schema: {
          type: "object",
          properties: {
            start_iso: {
              type: "string",
              description: "The slot's ISO timestamp, exactly as returned by get_available_slots",
            },
            note: { type: "string", description: "What the appointment is for" },
          },
          required: ["start_iso"],
        },
      },
    );
  }
  if (caps.kb) {
    tools.push({
      name: "search_knowledge_base",
      description:
        "Search the business's knowledge base (uploaded docs/FAQs) for information to answer the " +
        "customer. Use this whenever the answer might be in the business's own materials and isn't " +
        "already in your instructions. Quote only what the results contain — never invent.",
      input_schema: {
        type: "object",
        properties: {
          query: { type: "string", description: "What to look up, in the customer's terms" },
        },
        required: ["query"],
      },
    });
  }
  if (caps.payments) {
    tools.push({
      name: "create_invoice",
      description:
        "Create a payment request when the customer agrees to pay for something. Returns a secure " +
        "payment link (M-Pesa or card) — include it in your reply. Use exact prices from the " +
        "services list only.",
      input_schema: {
        type: "object",
        properties: {
          amount_kes: { type: "number", description: "Amount in KES, from the services list" },
          description: { type: "string", description: "What the payment is for" },
        },
        required: ["amount_kes", "description"],
      },
    });
  }
  return tools;
}

function baseTools(stages: string[]): Anthropic.Tool[] {
  return [
    {
      name: "update_lead",
      description:
        "Record or update what you have learned about this customer in the CRM. " +
        "Call this whenever you learn their name or a qualification detail " +
        "(interest, budget, area, timeline, condition, party size, etc.). " +
        "Only include fields you actually learned; existing data is merged, not replaced.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The customer's name, if learned" },
          fields: {
            type: "object",
            description:
              'Qualification details as key-value pairs, e.g. {"interest": "back pain treatment", "duration": "3 months"}',
          },
        },
      },
    },
    {
      name: "set_stage",
      description:
        "Move this lead to a different pipeline stage as the conversation progresses. " +
        "Call this when the customer's position in the sales process clearly changes " +
        "(e.g. they answered qualification questions, asked to book, or declined).",
      input_schema: {
        type: "object",
        properties: {
          stage: { type: "string", enum: stages, description: "The new pipeline stage" },
        },
        required: ["stage"],
      },
    },
    {
      name: "schedule_followup",
      description:
        "Schedule an automatic follow-up check-in with this customer. Call this when they show " +
        "interest but do not commit (e.g. 'I'll think about it', or they go quiet after hearing prices). " +
        "Do not tell the customer you scheduled it.",
      input_schema: {
        type: "object",
        properties: {
          due_in_hours: {
            type: "integer",
            description: "How many hours from now to follow up (e.g. 72 for 3 days)",
          },
          note: {
            type: "string",
            description:
              "Context for the future follow-up message, e.g. 'Interested in physio assessment for back pain, hesitant about price'",
          },
        },
        required: ["due_in_hours", "note"],
      },
    },
    {
      name: "escalate_to_human",
      description:
        "Flag this conversation for a human team member and pause your own replies. Call this when: " +
        "the customer explicitly asks for a person, they are upset, the request needs information or " +
        "authority you do not have, or you are not confident your answer is correct.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why a human is needed, for the team's inbox" },
        },
        required: ["reason"],
      },
    },
    {
      name: "stop_messaging",
      description:
        "Mark this customer as opted out of all future messages. Call this when they ask to stop " +
        "receiving messages, say 'STOP', or clearly want no further contact.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Brief note on the opt-out" },
        },
      },
    },
  ];
}

/** Writes a neutral timeline entry so the inbox shows what the AI did. */
async function logEvent(ctx: ToolContext, text: string): Promise<void> {
  await db.message.create({
    data: {
      tenantId: ctx.tenant.id,
      contactId: ctx.contact.id,
      direction: "out",
      author: "system",
      kind: "event",
      text,
    },
  });
  publish({ type: "contact_updated", tenantId: ctx.tenant.id, contactId: ctx.contact.id });
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "update_lead": {
      const data: { name?: string; fields?: string } = {};
      if (typeof input.name === "string" && input.name.trim()) {
        data.name = input.name.trim().slice(0, 120);
      }
      if (input.fields && typeof input.fields === "object" && !Array.isArray(input.fields)) {
        const existing = JSON.parse(ctx.contact.fields) as Record<string, unknown>;
        const merged: Record<string, unknown> = { ...existing };
        // The model relays attacker-controlled text here — persist only bounded
        // scalars under bounded keys, and cap how many fields can accumulate.
        for (const [k, v] of Object.entries(input.fields as Record<string, unknown>)) {
          if (typeof v !== "string" && typeof v !== "number" && typeof v !== "boolean") continue;
          const key = k.slice(0, MAX_LEAD_KEY_LEN);
          if (!(key in merged) && Object.keys(merged).length >= MAX_LEAD_FIELDS) continue;
          merged[key] = typeof v === "string" ? v.slice(0, MAX_LEAD_VALUE_LEN) : v;
        }
        data.fields = JSON.stringify(merged);
      }
      const updated = await db.contact.update({ where: { id: ctx.contact.id }, data });
      ctx.contact = updated;
      await logEvent(ctx, `AI updated lead${data.name ? ` (name: ${data.name})` : ""}`);
      return "Lead updated.";
    }
    case "set_stage": {
      const stage = String(input.stage ?? "");
      if (!ctx.stages.includes(stage)) {
        return `Error: "${stage}" is not a valid stage. Valid stages: ${ctx.stages.join(", ")}`;
      }
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { stage },
      });
      await logEvent(ctx, `AI moved lead to "${stage}"`);
      return `Stage set to ${stage}.`;
    }
    case "schedule_followup": {
      const hours = Number(input.due_in_hours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return "Error: due_in_hours must be a positive number.";
      }
      const dueAt = new Date(Date.now() + hours * 3600_000);
      await db.followUp.create({
        data: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          dueAt,
          note: String(input.note ?? ""),
        },
      });
      await logEvent(ctx, `Follow-up scheduled for ${dueAt.toLocaleString()}`);
      return `Follow-up scheduled in ${hours} hours.`;
    }
    case "escalate_to_human": {
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { needsHuman: true, aiPaused: true },
      });
      await logEvent(ctx, `Escalated to human: ${String(input.reason ?? "")}`);
      // Slice 2: push a real-time inbox notification here.
      console.log(
        `[escalation] tenant=${ctx.tenant.name} contact=${ctx.contact.phone}: ${String(input.reason ?? "")}`,
      );
      return "Escalated. A human has been notified and will take over after your reply.";
    }
    case "get_available_slots": {
      const slots = await computeAvailableSlots(ctx.tenant, 24);
      if (slots.length === 0) {
        return "No slots available in the booking window. Apologize and offer to have the team reach out.";
      }
      // First slots across the next few distinct days, so the model can offer variety.
      const byDay = new Map<string, { startsAt: Date }[]>();
      for (const s of slots) {
        const key = s.startsAt.toDateString();
        byDay.set(key, [...(byDay.get(key) ?? []), s]);
      }
      const lines = [...byDay.values()]
        .slice(0, 4)
        .flatMap((day) => day.slice(0, 3))
        .map((s) => `- ${formatSlot(s.startsAt)} [${s.startsAt.toISOString()}]`);
      return `Available slots (offer 2-3; book using the ISO value in brackets):\n${lines.join("\n")}`;
    }
    case "book_appointment": {
      const start = new Date(String(input.start_iso ?? ""));
      if (Number.isNaN(start.getTime())) return "Error: start_iso is not a valid timestamp.";
      const slots = await computeAvailableSlots(ctx.tenant, 200);
      const slot = slots.find((s) => s.startsAt.getTime() === start.getTime());
      if (!slot) {
        return "Error: that slot is no longer available. Call get_available_slots again and offer fresh options.";
      }
      const appointment = await db.appointment.create({
        data: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          startsAt: slot.startsAt,
          endsAt: slot.endsAt,
          note: String(input.note ?? ""),
        },
      });
      // Push to the tenant's Google Calendar when connected (best-effort).
      const eventId = await pushEvent(
        ctx.tenant,
        { startsAt: slot.startsAt, endsAt: slot.endsAt, note: String(input.note ?? "") },
        ctx.contact.name ?? ctx.contact.phone,
      ).catch(() => null);
      if (eventId) {
        await db.appointment.update({ where: { id: appointment.id }, data: { googleEventId: eventId } });
      }
      await logEvent(ctx, `Appointment booked: ${formatSlot(slot.startsAt)}`);
      return `Booked for ${formatSlot(slot.startsAt)}. Confirm this to the customer.`;
    }
    case "create_invoice": {
      const amount = Number(input.amount_kes);
      // Server-side sanity bounds — the prompt-level "use listed prices only" rule
      // is not a security control (customer text can try to override it). A hard
      // ceiling blunts a manipulated AI from minting an absurd live charge; the
      // approval gate (default on) is the primary control.
      if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AI_INVOICE_KES) {
        return `Error: amount_kes must be a positive number up to ${MAX_AI_INVOICE_KES.toLocaleString()}.`;
      }
      const description = String(input.description ?? "Payment").slice(0, 200);
      try {
        // Stakes-aware gate: when the tenant requires approval, the AI proposes
        // the payment but a human sends the link. Never fabricate a link here.
        if (paymentApprovalRequired(ctx.tenant)) {
          await createPendingInvoice(ctx.tenant, ctx.contact, amount, description);
          await logEvent(
            ctx,
            `Payment proposed (awaiting approval): KES ${amount.toLocaleString()} — ${description}`,
          );
          return (
            `Payment of KES ${amount.toLocaleString()} for "${description}" has been noted for the ` +
            `team to approve. Tell the customer the payment link will be sent shortly — do NOT invent ` +
            `or promise a specific link yourself.`
          );
        }
        const { payUrl } = await createPaymentLink(ctx.tenant, ctx.contact, amount, description);
        await logEvent(ctx, `Invoice created: KES ${amount.toLocaleString()} — ${description}`);
        return `Invoice created. Send the customer this payment link (M-Pesa or card): ${payUrl}`;
      } catch (err) {
        if (err instanceof PaystackError) {
          return `Error: ${err.message} Tell the customer the team will send payment details shortly, and escalate.`;
        }
        throw err;
      }
    }
    case "search_knowledge_base": {
      const query = String(input.query ?? "").trim();
      if (!query) return "Error: query is required.";
      try {
        const results = await searchKb(ctx.tenant.id, query);
        if (results.length === 0) {
          return "No relevant information found in the knowledge base. If you can't answer from your instructions, say you'll check and use escalate_to_human.";
        }
        return `Knowledge base results (use only what's relevant; do not invent beyond this):\n\n${results
          .map((r, i) => `[${i + 1}] ${r}`)
          .join("\n\n")}`;
      } catch (err) {
        console.error("[kb] search failed:", err);
        return "Knowledge base is temporarily unavailable. Answer from your instructions or escalate if unsure.";
      }
    }
    case "stop_messaging": {
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { optedOut: true },
      });
      await db.followUp.updateMany({
        where: { contactId: ctx.contact.id, status: "scheduled" },
        data: { status: "canceled" },
      });
      await logEvent(ctx, "Customer opted out — all messaging stopped");
      return "Customer opted out. Send one final brief confirmation, nothing more.";
    }
    default:
      return `Error: unknown tool "${name}"`;
  }
}
