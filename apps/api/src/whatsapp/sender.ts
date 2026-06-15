import type { Contact, Tenant } from "@prisma/client";
import { config } from "../config.js";
import { fetchWithTimeout } from "../http.js";

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
  /** Returns Meta's wamid for the sent message (null when nothing was sent). */
  sendText(tenant: Tenant, contact: Contact, text: string): Promise<string | null>;
}

/**
 * Sends via the Meta WhatsApp Cloud API. Enforces the 24h window.
 * Simulated contacts (in-app simulator) are persisted upstream but never sent.
 * Uses the tenant's own token/number when connected, env credentials otherwise.
 * Returns the wamid so delivery-status webhooks can be correlated back.
 */
export class WhatsAppCloudSender implements MessageSender {
  async sendText(tenant: Tenant, contact: Contact, text: string): Promise<string | null> {
    if (contact.isSimulated) return null;
    if (!windowIsOpen(contact)) throw new WindowClosedError();
    const phoneNumberId = tenant.waPhoneNumberId ?? config.WA_PHONE_NUMBER_ID;
    const token = tenant.waAccessToken ?? config.WA_ACCESS_TOKEN;
    const res = await fetchWithTimeout(
      `https://graph.facebook.com/v21.0/${phoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
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
    const data = (await res.json()) as { messages?: Array<{ id?: string }> };
    return data.messages?.[0]?.id ?? null;
  }
}

/** Prints to stdout — used by the CLI dev simulator. The window is always open. */
export class ConsoleSender implements MessageSender {
  async sendText(_tenant: Tenant, _contact: Contact, text: string): Promise<string | null> {
    process.stdout.write(`\n🤖 ${text}\n\n> `);
    return null;
  }
}

/** Resolves a Cloud API token for tenant-level Graph calls (connect/verify). */
export function tenantToken(tenant: Tenant): string | undefined {
  return tenant.waAccessToken ?? config.WA_ACCESS_TOKEN;
}
