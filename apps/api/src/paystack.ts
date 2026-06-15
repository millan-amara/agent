import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import type { Contact, Tenant } from "@prisma/client";
import { db } from "./db.js";
import { publish } from "./events.js";
import { fetchWithTimeout } from "./http.js";

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
  // Paystack requires an email; WhatsApp leads rarely give one — use a
  // deterministic synthetic address keyed to the customer's phone.
  const email = `${contact.phone.replace(/[^0-9a-z]/gi, "")}@customers.azayon.app`;

  const res = await fetchWithTimeout(`${PAYSTACK}/transaction/initialize`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tenant.paystackSecretKey}`,
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

export async function createPaymentLink(
  tenant: Tenant,
  contact: Contact,
  amountKes: number,
  description: string,
): Promise<{ payUrl: string; reference: string; invoiceId: string }> {
  const reference = `az_${randomBytes(10).toString("hex")}`;
  const payUrl = await initializePaystack(tenant, contact, amountKes, description, reference);
  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      amountCents: Math.round(amountKes * 100),
      description,
      paystackRef: reference,
      payUrl,
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
  await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      amountCents: Math.round(amountKes * 100),
      description,
      paystackRef: `az_${randomBytes(10).toString("hex")}`,
      status: "pending_approval",
      payUrl: null,
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

/** Handles a verified charge.success event. Returns the updated invoice or null. */
export async function markInvoicePaid(reference: string) {
  // Atomic guard: only the first redelivery of charge.success flips paid and
  // posts the receipt. Paystack retries webhooks, so a plain read-then-write
  // could double-post. updateMany with a status guard makes the transition
  // win-once — count === 0 means another delivery already handled it.
  const flip = await db.invoice.updateMany({
    where: { paystackRef: reference, status: { not: "paid" } },
    data: { status: "paid", paidAt: new Date() },
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
