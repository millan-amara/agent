import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Contact, Tenant } from "@prisma/client";
import { db } from "./db.js";
import { publish } from "./events.js";
import { fetchWithTimeout } from "./http.js";
import { decryptSecret } from "./secrets.js";

/**
 * Paystack payment collection (per-tenant account). One provider covers
 * cards + M-Pesa for Kenyan businesses; the customer pays via a hosted link
 * sent in the WhatsApp chat. charge.success arrives on our webhook.
 */

const PAYSTACK = "https://api.paystack.co";

export class PaystackError extends Error {}

export async function verifyPaystackKey(secretKey: string): Promise<boolean> {
  const res = await fetchWithTimeout(`${PAYSTACK}/transaction?perPage=1`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  return res.ok;
}

/**
 * Calls Paystack to mint a hosted payment link for an amount + reference.
 * Pure side-effect-free w.r.t. our DB — callers persist the Invoice. Throws
 * PaystackError on a missing key or a rejected request.
 */
async function initializePaystack(
  tenant: Tenant,
  contact: Contact,
  amountKes: number,
  description: string,
  reference: string,
): Promise<string> {
  if (!tenant.paystackSecretKey) {
    throw new PaystackError("Payments are not configured for this business.");
  }
  const secretKey = decryptSecret(tenant.paystackSecretKey);
  // Paystack requires an email; WhatsApp leads rarely give one — use a
  // deterministic synthetic address keyed to the customer's phone.
  const email = `${contact.phone.replace(/[^0-9a-z]/gi, "")}@customers.azayon.app`;

  const res = await fetchWithTimeout(`${PAYSTACK}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      email,
      amount: Math.round(amountKes * 100),
      currency: "KES",
      reference,
      metadata: {
        azayon_tenant_id: tenant.id,
        azayon_contact_id: contact.id,
        description,
        custom_fields: [
          { display_name: "Customer", variable_name: "customer", value: contact.name ?? contact.phone },
        ],
      },
    }),
  });
  const data = (await res.json()) as {
    status?: boolean;
    message?: string;
    data?: { authorization_url?: string };
  };
  if (!res.ok || !data.status || !data.data?.authorization_url) {
    throw new PaystackError(data.message ?? "Paystack rejected the payment request.");
  }
  return data.data.authorization_url;
}

/** Unguessable token for the public hosted invoice page (/i/<token>). */
function newPublicToken(): string {
  return randomBytes(16).toString("hex");
}

/**
 * Allocates the next human invoice number for a tenant by atomically bumping
 * Tenant.invoiceSeq. Returns the new value (first invoice is 1).
 */
async function nextInvoiceNumber(tenantId: string): Promise<number> {
  const updated = await db.tenant.update({
    where: { id: tenantId },
    data: { invoiceSeq: { increment: 1 } },
    select: { invoiceSeq: true },
  });
  return updated.invoiceSeq;
}

export interface InvoiceItemInput {
  description: string;
  quantity: number;
  unitCents: number;
}

/**
 * Creates a "proper" line-item invoice. Mints a Paystack link only when
 * `withPayLink` is set and the tenant has Paystack connected; otherwise the
 * invoice is record-only (payUrl null) and can be paid offline. Status starts
 * as "draft" until the owner sends it (api routes flip it to "pending").
 */
export async function createInvoice(
  tenant: Tenant,
  contact: Contact,
  opts: {
    items: InvoiceItemInput[];
    description?: string;
    notes?: string | null;
    dueDate?: Date | null;
    taxRate?: number;
    withPayLink?: boolean;
  },
): Promise<{ invoiceId: string; payUrl: string | null }> {
  const items = opts.items.filter((i) => i.description.trim() && i.unitCents > 0 && i.quantity > 0);
  const first = items[0];
  if (!first) throw new PaystackError("An invoice needs at least one line item.");
  const subtotal = items.reduce((sum, i) => sum + i.quantity * i.unitCents, 0);
  const taxRate = Math.min(Math.max(opts.taxRate ?? 0, 0), 100);
  const taxCents = Math.round((subtotal * taxRate) / 100);
  const amountCents = subtotal + taxCents;
  // Title shown on lists / Paystack; default to the first line item.
  const description = (opts.description?.trim() || first.description).slice(0, 200);

  const reference = `az_${randomBytes(10).toString("hex")}`;
  let payUrl: string | null = null;
  if (opts.withPayLink) {
    payUrl = await initializePaystack(tenant, contact, amountCents / 100, description, reference);
  }

  const number = await nextInvoiceNumber(tenant.id);
  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      number,
      publicToken: newPublicToken(),
      amountCents,
      taxRate,
      taxCents,
      description,
      notes: opts.notes?.trim() || null,
      dueDate: opts.dueDate ?? null,
      status: "draft",
      paystackRef: reference,
      payUrl,
      items: { create: items.map((i) => ({ description: i.description.trim(), quantity: i.quantity, unitCents: i.unitCents })) },
    },
  });
  return { invoiceId: invoice.id, payUrl };
}

export async function createPaymentLink(
  tenant: Tenant,
  contact: Contact,
  amountKes: number,
  description: string,
): Promise<{ payUrl: string; reference: string; invoiceId: string }> {
  const reference = `az_${randomBytes(10).toString("hex")}`;
  const payUrl = await initializePaystack(tenant, contact, amountKes, description, reference);
  const amountCents = Math.round(amountKes * 100);
  const number = await nextInvoiceNumber(tenant.id);
  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      number,
      publicToken: newPublicToken(),
      amountCents,
      description,
      paystackRef: reference,
      payUrl,
      items: { create: [{ description, quantity: 1, unitCents: amountCents }] },
    },
  });
  return { payUrl, reference, invoiceId: invoice.id };
}

/**
 * Records a payment the AI proposed but did NOT send, when the tenant gates
 * payments behind approval. No Paystack call yet — the link is minted only when
 * an owner approves (approveInvoice). The final reference is reserved up front so
 * the same row carries it through approval.
 */
export async function createPendingInvoice(
  tenant: Tenant,
  contact: Contact,
  amountKes: number,
  description: string,
): Promise<void> {
  if (!tenant.paystackSecretKey) {
    throw new PaystackError("Payments are not configured for this business.");
  }
  const amountCents = Math.round(amountKes * 100);
  const number = await nextInvoiceNumber(tenant.id);
  await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      number,
      publicToken: newPublicToken(),
      amountCents,
      description,
      paystackRef: `az_${randomBytes(10).toString("hex")}`,
      status: "pending_approval",
      payUrl: null,
      items: { create: [{ description, quantity: 1, unitCents: amountCents }] },
    },
  });
}

/**
 * Owner approves a pending invoice: mint the real Paystack link against the
 * reserved reference and flip it to "pending" (awaiting the customer's payment).
 * Returns the link so the caller can send it to the customer.
 */
export async function approveInvoice(
  tenant: Tenant,
  invoiceId: string,
): Promise<{ payUrl: string; description: string; amountKes: number; contact: Contact }> {
  const invoice = await db.invoice.findFirst({
    where: { id: invoiceId, tenantId: tenant.id },
  });
  if (!invoice) throw new PaystackError("Invoice not found.");
  if (invoice.status !== "pending_approval") {
    throw new PaystackError("This invoice has already been processed.");
  }
  const contact = await db.contact.findUniqueOrThrow({ where: { id: invoice.contactId } });
  const amountKes = invoice.amountCents / 100;
  const payUrl = await initializePaystack(
    tenant,
    contact,
    amountKes,
    invoice.description,
    invoice.paystackRef,
  );
  await db.invoice.update({
    where: { id: invoice.id },
    data: { payUrl, status: "pending" },
  });
  return { payUrl, description: invoice.description, amountKes, contact };
}

export function verifyPaystackSignature(raw: Buffer, signature: string, secretKey: string): boolean {
  const expected = createHmac("sha512", secretKey).update(raw).digest("hex");
  // Constant-time compare to avoid leaking the expected HMAC via timing.
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Handles a verified charge.success event. `channel` is Paystack's settlement
 * channel (e.g. "mobile_money", "card") from the event payload — stored for the
 * M-Pesa-vs-card mix, which can't be reconstructed after the fact. Returns the
 * updated invoice or null.
 */
export async function markInvoicePaid(reference: string, channel?: string | null) {
  // Atomic guard: only the first redelivery of charge.success flips paid and
  // posts the receipt. Paystack retries webhooks, so a plain read-then-write
  // could double-post. updateMany with a status guard makes the transition
  // win-once — count === 0 means another delivery already handled it.
  const flip = await db.invoice.updateMany({
    where: { paystackRef: reference, status: { not: "paid" } },
    data: { status: "paid", paidAt: new Date(), paymentMethod: channel ?? null },
  });
  if (flip.count === 0) return null;
  const updated = await db.invoice.findUnique({ where: { paystackRef: reference } });
  if (!updated) return null;
  const invoice = updated;
  await db.message.create({
    data: {
      tenantId: invoice.tenantId,
      contactId: invoice.contactId,
      direction: "out",
      author: "system",
      kind: "event",
      text: `Payment received — KES ${(invoice.amountCents / 100).toLocaleString()} (${invoice.description})`,
    },
  });
  publish({ type: "message", tenantId: invoice.tenantId, contactId: invoice.contactId });
  publish({ type: "contact_updated", tenantId: invoice.tenantId, contactId: invoice.contactId });
  return updated;
}
