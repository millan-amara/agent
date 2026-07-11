import { z } from "zod";
import type { Tenant } from "@prisma/client";
import type { TenantCapabilities } from "./tools.js";

export interface BusinessProfile {
  description: string;
  /**
   * `price` is what we show/quote to the customer (free text, e.g. "From KES 2,000").
   * `amountKes` is the derived exact charge and is the ONLY thing create_invoice may
   * use — it's absent whenever the price isn't a single unambiguous number.
   */
  services?: Array<{ name: string; price?: string; amountKes?: number }>;
  faqs?: Array<{ q: string; a: string }>;
  tone?: string;
  languages?: string;
  neverSay?: string[];
  bookingInfo?: string;
  businessHours?: string;
}

/**
 * Turn a free-text price into an exact KES amount, or undefined when it isn't one.
 *
 * Money is the one thing the agent must never guess at, so this is deliberately
 * strict: a price is only invoiceable if it names exactly ONE number and carries no
 * wording that makes it a starting point, a range, or a rate. "KES 3,500" → 3500;
 * "From 3,500", "2,000–5,000", "500 per hour" and "Negotiable" all → undefined, and
 * the prompt then tells the agent to escalate instead of inventing a figure.
 */
export function parseFixedAmountKes(price?: string): number | undefined {
  const text = (price ?? "").trim();
  if (!text) return undefined;
  // Wording that means "this is not a single fixed charge".
  if (
    /\b(from|starting|onwards?|approx\.?|approximately|around|about|up\s?to|negotiable|varies|variable|depends|quote|tbd|each|hourly|per\s?(hour|hr|day|month|week)|\/\s?(hour|hr|day|month|week))\b/i.test(
      text,
    )
  ) {
    return undefined;
  }
  // Two or more numbers means a range ("2,000 - 5,000"), not one price.
  const numbers = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (numbers.length !== 1) return undefined;
  const amount = Number(numbers[0]!.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return undefined;
  return Math.round(amount);
}

const MAX_ROWS = 100;

/**
 * Runtime shape of the guided prompt-builder payload. Everything here is compiled
 * straight into the system prompt, so it's bounded: an unvalidated field would
 * either blow up `buildSystemPrompt` for every inbound message or bloat a prompt we
 * deliberately keep byte-stable for caching.
 */
export const businessProfileSchema = z.object({
  description: z.string().trim().min(1, "A business description is required.").max(4000),
  services: z
    .array(z.object({ name: z.string().trim().max(120), price: z.string().trim().max(120).optional() }))
    .max(MAX_ROWS)
    .optional(),
  faqs: z
    .array(z.object({ q: z.string().trim().max(500), a: z.string().trim().max(2000) }))
    .max(MAX_ROWS)
    .optional(),
  tone: z.string().trim().max(300).optional(),
  languages: z.string().trim().max(300).optional(),
  neverSay: z.array(z.string().trim().max(300)).max(50).optional(),
  bookingInfo: z.string().trim().max(500).optional(),
  businessHours: z.string().trim().max(300).optional(),
});

/**
 * Drop half-filled rows and derive each service's invoiceable amount. The UI filters
 * blanks too, but this is the authoritative pass: a blank row here renders as a bare
 * "- " bullet in the prompt, and `amountKes` must never be client-supplied.
 */
export function normalizeProfile(input: z.infer<typeof businessProfileSchema>): BusinessProfile {
  return {
    ...input,
    services: (input.services ?? [])
      .filter((s) => s.name)
      .map((s) => ({
        name: s.name,
        ...(s.price ? { price: s.price } : {}),
        ...(parseFixedAmountKes(s.price) !== undefined
          ? { amountKes: parseFixedAmountKes(s.price) }
          : {}),
      })),
    // An FAQ needs both halves to be worth anything to the agent.
    faqs: (input.faqs ?? []).filter((f) => f.q && f.a),
    neverSay: (input.neverSay ?? []).filter(Boolean),
  };
}

/**
 * Compiles the tenant's structured profile into the agent system prompt.
 * This must be byte-stable per tenant (no timestamps, no per-request data) —
 * it carries a cache_control breakpoint, and any change invalidates the cache.
 */
export function buildSystemPrompt(
  tenant: Tenant,
  stages: string[],
  caps: TenantCapabilities,
): string {
  const p: BusinessProfile = JSON.parse(tenant.businessProfile);

  // Blank rows would render as bare "- " / "Q:\nA:" bullets and, worse, make the
  // list non-empty so the "(none listed)" fallback never fires. Profiles saved
  // before normalization existed can still contain them, so filter here too.
  const serviceList = (p.services ?? []).filter((s) => s.name?.trim());
  const faqList = (p.faqs ?? []).filter((f) => f.q?.trim() && f.a?.trim());

  const services = serviceList
    .map((s) => {
      const price = s.price ? ` — ${s.price}` : "";
      // Only spell out the invoicing rule when the agent actually has that tool.
      if (!caps.payments) return `- ${s.name}${price}`;
      // Fall back to parsing `price` for profiles saved before `amountKes` existed —
      // otherwise every legacy service would read as un-invoiceable until re-saved.
      const amount = s.amountKes ?? parseFixedAmountKes(s.price);
      return amount !== undefined
        ? `- ${s.name}${price} [invoice exactly ${amount}]`
        : `- ${s.name}${price} [no fixed amount — do not invoice]`;
    })
    .join("\n");
  const faqs = faqList.map((f) => `Q: ${f.q}\nA: ${f.a}`).join("\n\n");
  const neverSay = (p.neverSay ?? []).filter((n) => n?.trim()).map((n) => `- ${n}`).join("\n");

  return `You are the WhatsApp assistant for ${tenant.name}. You reply to customers on the business's WhatsApp number. Your goals, in order: answer the customer's question accurately, capture and qualify the lead, and move them toward a booking or purchase.

# About the business
${p.description}
${p.businessHours ? `\nBusiness hours: ${p.businessHours}` : ""}
${
  p.bookingInfo
    ? caps.booking
      ? // With the booking tools live, this field is background colour only. Said
        // plainly, otherwise a note like "front desk confirms" reads as an
        // instruction NOT to use book_appointment and the two rules fight.
        `Booking notes (background context only — you must still book through the booking tools below): ${p.bookingInfo}`
      : `Booking: ${p.bookingInfo}`
    : ""
}

# Services and prices
${services || "(none listed)"}

# Frequently asked questions
${faqs || "(none listed)"}

# How to write
- This is WhatsApp: keep replies short (1–4 sentences), warm, and easy to read on a phone. One question at a time.
- ${p.tone ?? "Friendly and professional."}
- ${p.languages ?? "Reply in the language the customer uses. English and Swahili are both fine, including mixed usage."}

# Hard rules
- Answer questions about prices, services, and availability ONLY from the information above. If it is not listed here, say you will check and use escalate_to_human — never invent or estimate.
- Never diagnose, give medical/legal/financial advice, or promise outcomes.
- If the customer is upset, confused by you, or explicitly asks for a person, use escalate_to_human.
- If the customer asks to stop receiving messages, use stop_messaging and send a brief polite confirmation.
${neverSay ? `- Never say or do any of the following:\n${neverSay}` : ""}

${
  caps.booking
    ? `# Booking appointments
- When the customer wants to book: call get_available_slots first, offer 2–3 of the returned times, and book with book_appointment once they choose. Never invent or promise availability the calendar didn't return.
- After booking, confirm the day and time clearly in your reply.
- When the customer asks about an appointment they already have ("when is my appointment?"), call get_customer_appointments and tell them only what it returns — never guess.
- To move a booking: call get_customer_appointments (for the current time) and get_available_slots (for new options), then reschedule_appointment once the customer confirms the new time. To cancel: confirm they want to, then call cancel_appointment. Always use the exact ISO values the tools return.
`
    : ""
}${
  caps.payments
    ? `# Collecting payment
- When the customer agrees to pay for a listed service, call create_invoice and include the returned payment link in your reply (it supports M-Pesa and card).
- Only ever invoice a service tagged [invoice exactly N] above, and pass exactly that number as amount_kes. Never round it, adjust it, or add to it.
- A service tagged [no fixed amount — do not invoice] has no settled price (it's a range, a rate, or "on request"). Do NOT calculate or guess a figure for it: use escalate_to_human so a person can quote it.
- Never quote or invoice amounts that are not in the services list.
- When the customer asks whether a payment went through or what they owe, call check_payment_status and report only what it returns. Only "paid" means money was received; if anything looks unclear, escalate rather than reassure them.
- When the customer asks for their invoice or payment link again, call resend_invoice (it re-sends an existing unpaid invoice — it never creates a new charge) and include the returned link in your reply.
`
    : ""
}${
  caps.kb
    ? `# Knowledge base
- This business has uploaded reference material (docs/FAQs). When a customer asks something that isn't covered in the information above, call search_knowledge_base before saying you'll check. Answer only from what it returns; if it has nothing relevant, escalate rather than guess.
`
    : ""
}# CRM duties (do these silently via tools, never mention them)
- When you learn the customer's name, interest, budget, timeline, or other useful details, record them with update_lead.
- Move the lead through the pipeline with set_stage as the conversation progresses. Stages: ${stages.join(" → ")}.
- When a customer shows interest but doesn't commit ("I'll think about it", goes quiet after pricing), schedule a check-in with schedule_followup.
- Tools run silently. After using tools, always send the customer a normal reply.`;
}
