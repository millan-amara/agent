import { createHmac, randomBytes } from "node:crypto";
import type { Contact, Tenant } from "@prisma/client";
import { db } from "./db.js";
import { publish } from "./events.js";

/**
 * Paystack payment collection (per-tenant account). One provider covers
 * cards + M-Pesa for Kenyan businesses; the customer pays via a hosted link
 * sent in the WhatsApp chat. charge.success arrives on our webhook.
 */

const PAYSTACK = "https://api.paystack.co";

export class PaystackError extends Error {}

export async function verifyPaystackKey(secretKey: string): Promise<boolean> {
  const res = await fetch(`${PAYSTACK}/transaction?perPage=1`, {
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  return res.ok;
}

export async function createPaymentLink(
  tenant: Tenant,
  contact: Contact,
  amountKes: number,
  description: string,
): Promise<{ payUrl: string; reference: string; invoiceId: string }> {
  if (!tenant.paystackSecretKey) {
    throw new PaystackError("Payments are not configured for this business.");
  }
  const reference = `az_${randomBytes(10).toString("hex")}`;
  // Paystack requires an email; WhatsApp leads rarely give one — use a
  // deterministic synthetic address keyed to the customer's phone.
  const email = `${contact.phone.replace(/[^0-9a-z]/gi, "")}@customers.azayon.app`;

  const res = await fetch(`${PAYSTACK}/transaction/initialize`, {
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

  const invoice = await db.invoice.create({
    data: {
      tenantId: tenant.id,
      contactId: contact.id,
      amountCents: Math.round(amountKes * 100),
      description,
      paystackRef: reference,
      payUrl: data.data.authorization_url,
    },
  });
  return { payUrl: data.data.authorization_url, reference, invoiceId: invoice.id };
}

export function verifyPaystackSignature(raw: Buffer, signature: string, secretKey: string): boolean {
  const expected = createHmac("sha512", secretKey).update(raw).digest("hex");
  return expected === signature;
}

/** Handles a verified charge.success event. Returns the updated invoice or null. */
export async function markInvoicePaid(reference: string) {
  const invoice = await db.invoice.findUnique({ where: { paystackRef: reference } });
  if (!invoice || invoice.status === "paid") return null;
  const updated = await db.invoice.update({
    where: { id: invoice.id },
    data: { status: "paid", paidAt: new Date() },
  });
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
