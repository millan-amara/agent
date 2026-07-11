import type { Contact, Template, Tenant } from "@prisma/client";
import { config } from "../config.js";
import { db } from "../db.js";
import { fetchWithTimeout } from "../http.js";
import { tenantToken } from "./sender.js";

/**
 * WhatsApp template messages — the only legal way to message a customer
 * outside the 24h service window. Templates are submitted to Meta for
 * approval per WABA; status flows back via webhook or explicit sync.
 */

const GRAPH = "https://graph.facebook.com/v21.0";

function creds(tenant: Tenant): { wabaId: string; token: string } | null {
  const wabaId = tenant.waWabaId ?? config.WA_WABA_ID;
  const token = tenantToken(tenant);
  if (!wabaId || !token) return null;
  return { wabaId, token };
}

export function variableCount(body: string): number {
  const matches = body.match(/\{\{(\d+)\}\}/g) ?? [];
  return new Set(matches).size;
}

export class TemplateSubmitError extends Error {}

/** Submits a draft to Meta for approval. Returns the new status. */
export async function submitTemplate(tenant: Tenant, template: Template): Promise<string> {
  const c = creds(tenant);
  if (!c) {
    throw new TemplateSubmitError(
      "WhatsApp Business Account ID and access token are required before templates can be submitted.",
    );
  }
  const res = await fetchWithTimeout(`${GRAPH}/${c.wabaId}/message_templates`, {
    method: "POST",
    headers: { Authorization: `Bearer ${c.token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      name: template.name,
      language: template.language,
      category: template.category,
      components: [
        {
          type: "BODY",
          text: template.body,
          ...(variableCount(template.body) > 0
            ? {
                example: {
                  body_text: [
                    Array.from({ length: variableCount(template.body) }, (_, i) =>
                      i === 0 ? "John" : "the business",
                    ),
                  ],
                },
              }
            : {}),
        },
      ],
    }),
  });
  const data = (await res.json()) as {
    status?: string;
    error?: { message?: string; error_user_msg?: string };
  };
  if (!res.ok) {
    throw new TemplateSubmitError(
      data.error?.error_user_msg ?? data.error?.message ?? "Meta rejected the template submission.",
    );
  }
  return (data.status ?? "PENDING").toLowerCase();
}

/**
 * Pulls current statuses from Meta and updates our records.
 *
 * Drafts are reconciled too. Template names are unique per WABA, so if Meta reports a
 * template by that name, that IS the truth for this tenant regardless of what our row
 * says — you couldn't submit the name again anyway. This also makes the reset in
 * `resetTemplatesForNewWaba` recoverable: after switching business accounts, a Sync
 * re-approves whichever templates genuinely exist on the new one. A local draft with
 * no counterpart on Meta simply isn't in the response, so it stays a draft.
 */
export async function syncTemplateStatuses(tenant: Tenant): Promise<number> {
  const c = creds(tenant);
  if (!c) return 0;
  const res = await fetchWithTimeout(
    `${GRAPH}/${c.wabaId}/message_templates?fields=name,status,rejected_reason&limit=100`,
    { headers: { Authorization: `Bearer ${c.token}` } },
  );
  if (!res.ok) return 0;
  const data = (await res.json()) as {
    data?: Array<{ name: string; status: string; rejected_reason?: string }>;
  };
  let updated = 0;
  for (const t of data.data ?? []) {
    const result = await db.template.updateMany({
      where: { tenantId: tenant.id, name: t.name },
      data: {
        status: t.status.toLowerCase(),
        rejectionReason: t.rejected_reason ?? null,
      },
    });
    updated += result.count;
  }
  return updated;
}

/**
 * Called when a tenant's WABA changes (reconnect to a different business account, or
 * disconnect). Approval lives on the WABA, not on us — so a template approved on the
 * OLD account does not exist on the new one, and sending it would be rejected by Meta
 * at the worst possible moment. We can't tell which is which (Template rows carry no
 * WABA id), so everything non-draft drops back to draft: the app then offers nothing
 * it can't actually send. A Sync against the new account re-approves whatever really
 * is live there.
 *
 * Returns how many templates were reset.
 */
export async function resetTemplatesForNewWaba(tenantId: string): Promise<number> {
  const { count } = await db.template.updateMany({
    where: { tenantId, NOT: { status: "draft" } },
    data: { status: "draft", rejectionReason: null },
  });
  return count;
}

/** Sends an approved template. Allowed outside the 24h window — that's its job. */
export async function sendTemplateMessage(
  tenant: Tenant,
  contact: Contact,
  template: Template,
): Promise<string | null> {
  const phoneNumberId = tenant.waPhoneNumberId ?? config.WA_PHONE_NUMBER_ID;
  const token = tenantToken(tenant);
  const vars = variableCount(template.body);
  const params = [contact.name ?? "there", tenant.name].slice(0, vars);

  const res = await fetchWithTimeout(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: contact.phone,
      type: "template",
      template: {
        name: template.name,
        language: { code: template.language },
        ...(vars > 0
          ? {
              components: [
                {
                  type: "body",
                  parameters: params.map((text) => ({ type: "text", text })),
                },
              ],
            }
          : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Template send failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  return data.messages?.[0]?.id ?? null;
}

/**
 * Sends an approved template by name with explicit positional body parameters
 * ({{1}}, {{2}}, …). Unlike sendTemplateMessage (which fills the two follow-up
 * variables), this is for any approved template — e.g. the owner morning digest.
 * Parameters must be single-line (Meta rejects newlines/tabs in body params).
 */
export async function sendTemplateByName(
  tenant: Tenant,
  toPhone: string,
  name: string,
  language: string,
  bodyParams: string[],
): Promise<string | null> {
  const phoneNumberId = tenant.waPhoneNumberId ?? config.WA_PHONE_NUMBER_ID;
  const token = tenantToken(tenant);
  const res = await fetchWithTimeout(`${GRAPH}/${phoneNumberId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      to: toPhone,
      type: "template",
      template: {
        name,
        language: { code: language },
        ...(bodyParams.length
          ? {
              components: [
                { type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) },
              ],
            }
          : {}),
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Template send failed (${res.status}): ${body}`);
  }
  const data = (await res.json()) as { messages?: Array<{ id?: string }> };
  return data.messages?.[0]?.id ?? null;
}

/** Renders the template body the way the customer will read it (for the timeline). */
export function renderTemplate(template: Template, tenant: Tenant, contact: Contact): string {
  return template.body
    .replaceAll("{{1}}", contact.name ?? "there")
    .replaceAll("{{2}}", tenant.name);
}
