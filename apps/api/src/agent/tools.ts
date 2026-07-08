import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Tenant } from "@prisma/client";
import { config } from "../config.js";
import { db } from "../db.js";
import { publish } from "../events.js";
import { computeAvailableSlots, formatSlot, parseBookingConfig } from "../booking.js";
import { createPaymentLink, createPendingInvoice, PaystackError } from "../paystack.js";
import { hasKnowledgeBase, searchKb } from "../kb.js";
import { deleteEvent, pushEvent } from "../google.js";

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
      {
        name: "get_customer_appointments",
        description:
          "Look up THIS customer's own upcoming appointments. Call this when they ask about a " +
          "booking they already have (e.g. 'when is my appointment?', 'am I booked in?'), and " +
          "before rescheduling or cancelling. Returns only this customer's appointments.",
        input_schema: { type: "object", properties: {} },
      },
      {
        name: "reschedule_appointment",
        description:
          "Move THIS customer's existing appointment to a new time. Call get_customer_appointments " +
          "first for the current appointment's ISO time, and get_available_slots for valid new times. " +
          "Only reschedule after the customer confirms the new time.",
        input_schema: {
          type: "object",
          properties: {
            current_start_iso: {
              type: "string",
              description: "The existing appointment's ISO timestamp, from get_customer_appointments",
            },
            new_start_iso: {
              type: "string",
              description: "The chosen new slot's ISO timestamp, from get_available_slots",
            },
          },
          required: ["current_start_iso", "new_start_iso"],
        },
      },
      {
        name: "cancel_appointment",
        description:
          "Cancel THIS customer's existing appointment. Call get_customer_appointments first for its " +
          "ISO time. Only cancel after the customer clearly asks to.",
        input_schema: {
          type: "object",
          properties: {
            start_iso: {
              type: "string",
              description: "The appointment's ISO timestamp, from get_customer_appointments",
            },
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
    tools.push({
      name: "check_payment_status",
      description:
        "Look up THIS customer's own invoices and whether they have been paid. Call this when they " +
        "ask about a payment they made or owe (e.g. 'did my payment go through?', 'what do I owe?'). " +
        "Returns only this customer's invoices — never anyone else's.",
      input_schema: { type: "object", properties: {} },
    });
    tools.push({
      name: "resend_invoice",
      description:
        "Re-send THIS customer's existing unpaid invoice link to them. Use when they ask for their " +
        "invoice or payment link again. Defaults to their most recent unpaid invoice; pass " +
        "invoice_number for a specific one. Does NOT create a new charge — use create_invoice for that.",
      input_schema: {
        type: "object",
        properties: {
          invoice_number: {
            type: "integer",
            description:
              "Optional: the invoice number (e.g. 42 for INV-0042). Omit for the most recent unpaid invoice.",
          },
        },
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
    case "get_customer_appointments": {
      // Strictly scoped to the current contact — the agent must never surface
      // another customer's bookings. Upcoming, still-booked appointments only.
      const appointments = await db.appointment.findMany({
        where: { tenantId: ctx.tenant.id, contactId: ctx.contact.id, status: "booked" },
        orderBy: { startsAt: "asc" },
      });
      const upcoming = appointments.filter((a) => a.startsAt.getTime() >= Date.now());
      if (upcoming.length === 0) {
        return "This customer has no upcoming appointments on record. If they expected one, offer to book a new slot or escalate.";
      }
      const lines = upcoming.map(
        (a) => `- ${formatSlot(a.startsAt)} [${a.startsAt.toISOString()}]${a.note ? ` (${a.note})` : ""}`,
      );
      return `This customer's upcoming appointments (use the ISO value in brackets to reschedule or cancel):\n${lines.join(
        "\n",
      )}`;
    }
    case "reschedule_appointment": {
      const fromStart = new Date(String(input.current_start_iso ?? ""));
      const toStart = new Date(String(input.new_start_iso ?? ""));
      if (Number.isNaN(fromStart.getTime()) || Number.isNaN(toStart.getTime())) {
        return "Error: both current_start_iso and new_start_iso must be valid timestamps (from get_customer_appointments and get_available_slots).";
      }
      // Scoped to this contact — the agent can only move this customer's own booking.
      const appt = await db.appointment.findFirst({
        where: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          status: "booked",
          startsAt: fromStart,
        },
      });
      if (!appt) {
        return "Error: no booked appointment found at that time for this customer. Call get_customer_appointments to see their actual bookings.";
      }
      // Re-validate the new slot against live availability, exactly as book_appointment does.
      const slots = await computeAvailableSlots(ctx.tenant, 200);
      const slot = slots.find((s) => s.startsAt.getTime() === toStart.getTime());
      if (!slot) {
        return "Error: that new slot is no longer available. Call get_available_slots again and offer fresh options.";
      }
      await db.appointment.update({
        where: { id: appt.id },
        data: { startsAt: slot.startsAt, endsAt: slot.endsAt },
      });
      // Re-sync Google Calendar (best-effort): drop the old event, create a fresh one.
      if (appt.googleEventId) await deleteEvent(ctx.tenant, appt.googleEventId);
      const eventId = await pushEvent(
        ctx.tenant,
        { startsAt: slot.startsAt, endsAt: slot.endsAt, note: appt.note },
        ctx.contact.name ?? ctx.contact.phone,
      ).catch(() => null);
      await db.appointment.update({ where: { id: appt.id }, data: { googleEventId: eventId } });
      await logEvent(ctx, `Appointment moved: ${formatSlot(appt.startsAt)} → ${formatSlot(slot.startsAt)}`);
      return `Rescheduled to ${formatSlot(slot.startsAt)}. Confirm the new time with the customer.`;
    }
    case "cancel_appointment": {
      const start = new Date(String(input.start_iso ?? ""));
      if (Number.isNaN(start.getTime())) {
        return "Error: start_iso must be a valid timestamp from get_customer_appointments.";
      }
      const appt = await db.appointment.findFirst({
        where: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          status: "booked",
          startsAt: start,
        },
      });
      if (!appt) {
        return "Error: no booked appointment found at that time for this customer. Call get_customer_appointments to see their actual bookings.";
      }
      await db.appointment.update({ where: { id: appt.id }, data: { status: "cancelled" } });
      if (appt.googleEventId) await deleteEvent(ctx.tenant, appt.googleEventId);
      await logEvent(ctx, `Appointment cancelled: ${formatSlot(appt.startsAt)}`);
      return `Cancelled the ${formatSlot(appt.startsAt)} appointment. Confirm the cancellation with the customer.`;
    }
    case "check_payment_status": {
      // Strictly scoped to the current contact. Hide internal-only states
      // (draft, pending_approval) the customer shouldn't be told about.
      const invoices = await db.invoice.findMany({
        where: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          status: { in: ["pending", "paid", "failed", "cancelled"] },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      });
      if (invoices.length === 0) {
        return "This customer has no invoices on record. If they believe they paid, escalate to a human to check.";
      }
      const lines = invoices.map((i) => {
        const kes = (i.amountCents / 100).toLocaleString();
        const when =
          i.status === "paid" && i.paidAt ? ` on ${i.paidAt.toLocaleDateString()}` : "";
        return `- INV-${String(i.number).padStart(4, "0")}: KES ${kes} — ${i.description} — ${i.status}${when}`;
      });
      return `This customer's invoices (most recent first):\n${lines.join(
        "\n",
      )}\n\nReport the status plainly. Only "paid" means money was received; "pending" means awaiting payment.`;
    }
    case "resend_invoice": {
      const ref = (n: number) => `INV-${String(n).padStart(4, "0")}`;
      let invoice;
      const raw = input.invoice_number;
      if (raw !== undefined && raw !== null && String(raw).trim() !== "") {
        const number = Number(raw);
        if (!Number.isInteger(number)) return "Error: invoice_number must be a whole number.";
        // Scoped to this contact — never resend another customer's invoice.
        invoice = await db.invoice.findFirst({
          where: { tenantId: ctx.tenant.id, contactId: ctx.contact.id, number },
        });
        if (!invoice) return "Error: no invoice with that number exists for this customer.";
        if (invoice.status === "paid") {
          return `${ref(invoice.number)} is already paid — reassure the customer it's settled, nothing more to pay.`;
        }
        if (invoice.status === "cancelled") {
          return `${ref(invoice.number)} was cancelled. If they still need to pay, escalate or have a new invoice raised.`;
        }
        if (invoice.status === "draft" || invoice.status === "pending_approval") {
          return "That invoice hasn't been issued yet. Tell the customer it's being prepared and the link will follow.";
        }
      } else {
        // Default: the most recent issued-but-unpaid invoice.
        invoice = await db.invoice.findFirst({
          where: { tenantId: ctx.tenant.id, contactId: ctx.contact.id, status: "pending" },
          orderBy: { createdAt: "desc" },
        });
        if (!invoice) {
          return "This customer has no unpaid invoice to resend. If they expect one, escalate or raise a new invoice.";
        }
      }
      const publicUrl = `${config.APP_BASE_URL}/i/${invoice.publicToken}`;
      await logEvent(ctx, `Invoice ${ref(invoice.number)} link resent`);
      return `Send the customer this invoice link (M-Pesa or card): ${publicUrl}`;
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
