import type { Tenant } from "@prisma/client";
import { db } from "./db.js";
import { sendEmail } from "./email.js";
import { publish } from "./events.js";
import { windowIsOpen, type MessageSender } from "./whatsapp/sender.js";
import { sendTemplateByName } from "./whatsapp/templates.js";

/**
 * The owner morning digest — the AI's daily report to the business owner:
 * "here's what I handled yesterday, and here's what still needs you today".
 *
 * This is the feature that makes the AI's invisible work visible every morning,
 * which is what justifies the subscription. Numbers are computed deterministically
 * (never via the LLM) — a metrics message that hallucinates figures is worse than
 * no message at all.
 */

const KE_OFFSET_MIN = 180; // Africa/Nairobi is UTC+3, no DST.
const DEFAULT_HOUR = 7;

// Approved Meta utility template for out-of-window owner delivery. The body is:
//   Good morning 👋 / Here's your {{1}} summary for {{2}}. / 📊 Yesterday: {{3}}
//   / ✅ Needs you today: {{4}} / I handled everything else automatically. …
export const DIGEST_TEMPLATE_NAME = "daily_business_digest";
const DIGEST_TEMPLATE_LANG = "en";
const COLD_LEAD_MIN_DAYS = 7;
const COLD_LEAD_MAX_DAYS = 30;
const OVERDUE_UNDATED_DAYS = 7;

export type DigestChannel = "auto" | "whatsapp" | "email";

export interface DigestConfig {
  enabled?: boolean;
  hour?: number; // KE-local hour (0-23) to send at
  channel?: DigestChannel;
  ownerPhone?: string; // WhatsApp number to deliver to (E.164, digits only)
}

export function parseDigestConfig(tenant: Tenant): Required<DigestConfig> {
  const raw = JSON.parse(tenant.digestConfig || "{}") as DigestConfig;
  const hour = Number.isInteger(raw.hour) ? Math.min(23, Math.max(0, raw.hour!)) : DEFAULT_HOUR;
  const channel: DigestChannel =
    raw.channel === "whatsapp" || raw.channel === "email" ? raw.channel : "auto";
  return {
    enabled: raw.enabled ?? false,
    hour,
    channel,
    ownerPhone: (raw.ownerPhone ?? "").replace(/\D/g, ""),
  };
}

/** KE-local calendar day (YYYY-MM-DD) and hour (0-23) for an instant. */
export function keNow(now: Date): { day: string; hour: number } {
  const shifted = new Date(now.getTime() + KE_OFFSET_MIN * 60_000);
  return { day: shifted.toISOString().slice(0, 10), hour: shifted.getUTCHours() };
}

/** UTC instant of KE-local midnight that begins the given YYYY-MM-DD. */
function keDayStartUtc(day: string): Date {
  return new Date(`${day}T00:00:00+03:00`);
}

export interface DigestData {
  /** KE calendar day the digest covers (yesterday). */
  covers: string;
  yesterday: {
    handled: number; // distinct customers we exchanged messages with
    newLeads: number;
    booked: number;
    followUpsSent: number;
    paidKes: number;
  };
  outstanding: {
    waitingForYou: number; // escalations / failed turns needing a human
    pendingApprovals: number; // AI-proposed invoices awaiting an owner's send
    overdueInvoices: { count: number; totalKes: number };
    coldLeads: number; // went quiet 7-30 days ago, still open
  };
}

/** True when the digest has nothing worth reporting (a genuinely quiet day). */
export function isEmptyDigest(d: DigestData): boolean {
  const y = d.yesterday;
  const o = d.outstanding;
  return (
    y.handled === 0 &&
    y.newLeads === 0 &&
    y.booked === 0 &&
    y.followUpsSent === 0 &&
    y.paidKes === 0 &&
    o.waitingForYou === 0 &&
    o.pendingApprovals === 0 &&
    o.overdueInvoices.count === 0 &&
    o.coldLeads === 0
  );
}

/** Computes the digest for `tenantId` as of `now` (covers the prior KE day). */
export async function buildDigest(tenantId: string, now: Date): Promise<DigestData> {
  const { day } = keNow(now);
  const todayStart = keDayStartUtc(day);
  const yStart = new Date(todayStart.getTime() - 86_400_000);
  const yEnd = todayStart;
  const covers = keNow(yStart).day;

  const coldFrom = new Date(now.getTime() - COLD_LEAD_MAX_DAYS * 86_400_000);
  const coldTo = new Date(now.getTime() - COLD_LEAD_MIN_DAYS * 86_400_000);
  const undatedOverdueBefore = new Date(now.getTime() - OVERDUE_UNDATED_DAYS * 86_400_000);

  const [
    handledRows,
    newLeads,
    booked,
    followUpsSent,
    paidInvoices,
    waitingForYou,
    pendingApprovals,
    overdue,
    coldLeads,
  ] = await Promise.all([
    db.message.findMany({
      where: {
        tenantId,
        direction: "in",
        createdAt: { gte: yStart, lt: yEnd },
        contact: { isSimulated: false },
      },
      distinct: ["contactId"],
      select: { contactId: true },
    }),
    db.contact.count({
      where: { tenantId, isSimulated: false, createdAt: { gte: yStart, lt: yEnd } },
    }),
    db.appointment.count({
      where: { tenantId, status: "booked", createdAt: { gte: yStart, lt: yEnd } },
    }),
    db.followUp.count({
      where: { tenantId, status: "sent", dueAt: { gte: yStart, lt: yEnd } },
    }),
    db.invoice.findMany({
      where: { tenantId, status: "paid", paidAt: { gte: yStart, lt: yEnd } },
      select: { amountCents: true },
    }),
    db.contact.count({
      where: { tenantId, isSimulated: false, OR: [{ needsHuman: true }, { needsReview: true }] },
    }),
    db.invoice.count({ where: { tenantId, status: "pending_approval" } }),
    db.invoice.findMany({
      where: {
        tenantId,
        status: "pending",
        OR: [
          { dueDate: { lt: now } },
          { dueDate: null, issuedAt: { lt: undatedOverdueBefore } },
        ],
      },
      select: { amountCents: true },
    }),
    db.contact.count({
      where: {
        tenantId,
        isSimulated: false,
        optedOut: false,
        needsHuman: false,
        lastInboundAt: { gte: coldFrom, lt: coldTo },
      },
    }),
  ]);

  return {
    covers,
    yesterday: {
      handled: handledRows.length,
      newLeads,
      booked,
      followUpsSent,
      paidKes: paidInvoices.reduce((s, i) => s + i.amountCents, 0) / 100,
    },
    outstanding: {
      waitingForYou,
      pendingApprovals,
      overdueInvoices: {
        count: overdue.length,
        totalKes: overdue.reduce((s, i) => s + i.amountCents, 0) / 100,
      },
      coldLeads,
    },
  };
}

function kes(n: number): string {
  return `KES ${Math.round(n).toLocaleString("en-KE")}`;
}

/** e.g. "Tuesday, 8 July" — the KE day the digest covers. */
function digestDateLabel(covers: string): string {
  return keDayStartUtc(covers).toLocaleDateString("en-KE", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** Single-line "what happened yesterday" phrase for the {{3}} template variable. */
function recapPhrase(d: DigestData): string {
  const y = d.yesterday;
  const parts: string[] = [];
  if (y.handled) parts.push(`${y.handled} ${y.handled === 1 ? "customer" : "customers"} handled`);
  if (y.newLeads) parts.push(`${y.newLeads} new ${y.newLeads === 1 ? "lead" : "leads"}`);
  if (y.booked) parts.push(`${y.booked} ${y.booked === 1 ? "appointment" : "appointments"} booked`);
  if (y.followUpsSent) parts.push(`${y.followUpsSent} follow-up${y.followUpsSent === 1 ? "" : "s"} sent`);
  if (y.paidKes) parts.push(`${kes(y.paidKes)} collected`);
  return parts.length ? parts.join(", ") : "a quiet day, no new activity";
}

/** Single-line "what needs you" phrase for the {{4}} template variable. */
function outstandingPhrase(d: DigestData): string {
  const o = d.outstanding;
  const parts: string[] = [];
  if (o.waitingForYou)
    parts.push(`${o.waitingForYou} ${o.waitingForYou === 1 ? "conversation" : "conversations"} waiting`);
  if (o.pendingApprovals)
    parts.push(`${o.pendingApprovals} invoice${o.pendingApprovals === 1 ? "" : "s"} to approve`);
  if (o.overdueInvoices.count)
    parts.push(
      `${o.overdueInvoices.count} overdue invoice${o.overdueInvoices.count === 1 ? "" : "s"} (${kes(o.overdueInvoices.totalKes)})`,
    );
  if (o.coldLeads) parts.push(`${o.coldLeads} lead${o.coldLeads === 1 ? "" : "s"} gone quiet`);
  return parts.length ? parts.join(", ") : "nothing, enjoy the calm";
}

/**
 * The four positional body parameters for the `daily_business_digest` template.
 * All must be single-line and non-empty (Meta rejects newlines/tabs/empty params).
 */
export function digestTemplateParams(tenant: Tenant, d: DigestData): string[] {
  return [tenant.name, digestDateLabel(d.covers), recapPhrase(d), outstandingPhrase(d)];
}

/** A friendly KE-toned WhatsApp/email body. Deterministic — no LLM. */
export function renderDigestText(tenant: Tenant, d: DigestData): string {
  const dateLabel = digestDateLabel(d.covers);
  const lines: string[] = [];
  lines.push(`Good morning${tenant.name ? `, ${tenant.name}` : ""} 👋`);

  if (isEmptyDigest(d)) {
    lines.push("");
    lines.push(
      `Quiet day yesterday (${dateLabel}) — nothing is waiting for you this morning. I'm watching the inbox and will jump in the moment a customer messages.`,
    );
    return lines.join("\n");
  }

  const y = d.yesterday;
  lines.push("");
  lines.push(`Here's your ${dateLabel} recap:`);
  if (y.handled) lines.push(`• ${y.handled} ${y.handled === 1 ? "customer" : "customers"} handled`);
  if (y.newLeads) lines.push(`• ${y.newLeads} new ${y.newLeads === 1 ? "lead" : "leads"}`);
  if (y.booked) lines.push(`• ${y.booked} ${y.booked === 1 ? "appointment" : "appointments"} booked`);
  if (y.followUpsSent)
    lines.push(`• ${y.followUpsSent} follow-up${y.followUpsSent === 1 ? "" : "s"} sent`);
  if (y.paidKes) lines.push(`• ${kes(y.paidKes)} collected`);

  const o = d.outstanding;
  const todo: string[] = [];
  if (o.waitingForYou)
    todo.push(
      `${o.waitingForYou} ${o.waitingForYou === 1 ? "conversation is" : "conversations are"} waiting for you`,
    );
  if (o.pendingApprovals)
    todo.push(
      `${o.pendingApprovals} invoice${o.pendingApprovals === 1 ? "" : "s"} ready for you to approve & send`,
    );
  if (o.overdueInvoices.count)
    todo.push(
      `${o.overdueInvoices.count} overdue invoice${o.overdueInvoices.count === 1 ? "" : "s"} (${kes(o.overdueInvoices.totalKes)})`,
    );
  if (o.coldLeads)
    todo.push(`${o.coldLeads} lead${o.coldLeads === 1 ? "" : "s"} gone quiet — worth a nudge`);

  if (todo.length) {
    lines.push("");
    lines.push("Needs you today:");
    for (const t of todo) lines.push(`• ${t}`);
  }

  lines.push("");
  lines.push("I handled everything else automatically. Have a great day 💪");
  return lines.join("\n");
}

/** Escapes text for the simple HTML email wrapper. */
function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function ownerEmails(tenant: Tenant): Promise<string[]> {
  const owners = await db.user.findMany({
    where: { tenantId: tenant.id, role: "owner" },
    select: { email: true },
  });
  const emails = owners.map((u) => u.email);
  if (emails.length === 0 && tenant.businessEmail) emails.push(tenant.businessEmail);
  return emails;
}

export interface DigestDelivery {
  channel: DigestChannel;
  delivered: boolean;
  reason?: string;
}

/** Persists the digest to the owner's contact thread so it shows in the inbox. */
async function recordOwnerDigest(
  tenant: Tenant,
  contactId: string,
  text: string,
  waMessageId: string | null,
): Promise<void> {
  await db.message.create({
    data: {
      tenantId: tenant.id,
      contactId,
      direction: "out",
      author: "system",
      kind: "event",
      text,
      waMessageId,
      status: waMessageId ? "sent" : null,
    },
  });
  publish({ type: "message", tenantId: tenant.id, contactId });
}

/**
 * Delivers the digest for a tenant over WhatsApp when possible, email otherwise.
 * WhatsApp path: an open 24h window gets the rich free-form message; a closed
 * window uses the approved `daily_business_digest` utility template. Email is the
 * fallback for "auto" (and the only channel for "email"). `channel: "whatsapp"`
 * never falls back to email; `"email"` never tries WhatsApp.
 */
export async function deliverDigest(
  tenant: Tenant,
  sender: MessageSender,
  d: DigestData,
): Promise<DigestDelivery> {
  const cfg = parseDigestConfig(tenant);
  const text = renderDigestText(tenant, d);
  const wantsWhatsApp = cfg.channel === "auto" || cfg.channel === "whatsapp";
  const waOnly = cfg.channel === "whatsapp";
  // tenant.ownerPhone is the canonical owner number; fall back to the legacy
  // digestConfig.ownerPhone for configs saved before it was promoted.
  const ownerPhone = tenant.ownerPhone || cfg.ownerPhone;

  if (wantsWhatsApp && !ownerPhone && waOnly) {
    return { channel: "whatsapp", delivered: false, reason: "no WhatsApp number configured" };
  }

  if (wantsWhatsApp && ownerPhone) {
    const contact = await db.contact.findUnique({
      where: { tenantId_phone: { tenantId: tenant.id, phone: ownerPhone } },
    });
    if (contact && !contact.optedOut) {
      if (windowIsOpen(contact) || contact.isSimulated) {
        // In-window: the rich, free-form message.
        const waMessageId = await sender.sendText(tenant, contact, text);
        await recordOwnerDigest(tenant, contact.id, text, waMessageId);
        return { channel: "whatsapp", delivered: true };
      }
      // Out-of-window: the approved utility template.
      try {
        const waMessageId = await sendTemplateByName(
          tenant,
          contact.phone,
          DIGEST_TEMPLATE_NAME,
          DIGEST_TEMPLATE_LANG,
          digestTemplateParams(tenant, d),
        );
        await recordOwnerDigest(tenant, contact.id, text, waMessageId);
        return { channel: "whatsapp", delivered: true };
      } catch (err) {
        const reason = `digest template send failed: ${err instanceof Error ? err.message : String(err)}`;
        if (waOnly) return { channel: "whatsapp", delivered: false, reason };
        console.log(`[digest] ${tenant.name}: ${reason} — falling back to email`);
        // fall through to email
      }
    } else if (waOnly) {
      return {
        channel: "whatsapp",
        delivered: false,
        reason: contact ? "owner opted out" : "owner phone is not a known contact",
      };
    }
  }

  // Email path (default, and the "auto" fallback).
  const emails = await ownerEmails(tenant);
  if (emails.length === 0) {
    return { channel: "email", delivered: false, reason: "no owner email on file" };
  }
  const html = `<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;font-size:15px;line-height:1.6;color:#1a1a1a">${esc(
    text,
  )
    .split("\n")
    .map((l) => (l ? `<div>${l}</div>` : "<div>&nbsp;</div>"))
    .join("")}</div>`;
  await sendEmail({
    to: emails.join(", "),
    subject: `Your ${tenant.name} morning digest`,
    html,
    text,
  });
  return { channel: "email", delivered: true };
}

/**
 * Once-per-tick sweep: for each tenant whose digest is due (KE hour reached and
 * not yet sent today), claim the day via a unique DigestLog insert, then build
 * and deliver. The unique insert is the idempotency guard — a duplicate/restarted
 * worker loses the race and skips.
 */
export async function runDigestSweep(sender: MessageSender, now: Date = new Date()): Promise<void> {
  const { day, hour } = keNow(now);
  const tenants = await db.tenant.findMany();
  for (const tenant of tenants) {
    const cfg = parseDigestConfig(tenant);
    if (!cfg.enabled || hour < cfg.hour) continue;

    // Claim today (KE) for this tenant. If a row already exists we've sent it.
    try {
      await db.digestLog.create({ data: { tenantId: tenant.id, day, channel: "pending" } });
    } catch {
      continue; // unique (tenantId, day) violation — already handled today
    }

    try {
      const data = await buildDigest(tenant.id, now);
      const result = await deliverDigest(tenant, sender, data);
      await db.digestLog.update({
        where: { tenantId_day: { tenantId: tenant.id, day } },
        data: { channel: result.channel, status: result.delivered ? "sent" : "failed" },
      });
      if (!result.delivered) {
        console.log(`[digest] ${tenant.name}: not delivered — ${result.reason}`);
      }
    } catch (err) {
      console.error(`[digest] failed for ${tenant.name}:`, err);
      await db.digestLog
        .update({
          where: { tenantId_day: { tenantId: tenant.id, day } },
          data: { status: "failed" },
        })
        .catch(() => {});
    }
  }
}
