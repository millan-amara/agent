import type { Contact, Tenant } from "@prisma/client";
import { config } from "../config.js";

const WINDOW_MS = 24 * 60 * 60 * 1000;

export function windowIsOpen(contact: Contact): boolean {
  return (
    contact.lastInboundAt !== null &&
    Date.now() - contact.lastInboundAt.getTime() < WINDOW_MS
  );
}

export class WindowClosedError extends Error {
  constructor() {
    super(
      "24h customer service window is closed — free-form messages are not allowed. " +
        "An approved template message is required (Slice 4).",
    );
  }
}

export interface MessageSender {
  sendText(tenant: Tenant, contact: Contact, text: string): Promise<void>;
}

/** Sends via the Meta WhatsApp Cloud API. Enforces the 24h window. */
export class WhatsAppCloudSender implements MessageSender {
  async sendText(tenant: Tenant, contact: Contact, text: string): Promise<void> {
    if (!windowIsOpen(contact)) throw new WindowClosedError();
    const phoneNumberId = tenant.waPhoneNumberId ?? config.WA_PHONE_NUMBER_ID;
    const res = await fetch(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.WA_ACCESS_TOKEN}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: contact.phone,
          type: "text",
          text: { body: text },
        }),
      },
    );
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`WhatsApp send failed (${res.status}): ${body}`);
    }
  }
}

/** Prints to stdout — used by the dev simulator. The window is always open. */
export class ConsoleSender implements MessageSender {
  async sendText(_tenant: Tenant, _contact: Contact, text: string): Promise<void> {
    process.stdout.write(`\n🤖 ${text}\n\n> `);
  }
}
