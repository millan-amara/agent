import Anthropic from "@anthropic-ai/sdk";
import type { Tenant } from "@prisma/client";
import { db } from "../db.js";

/**
 * Read-only tools for the owner assistant. Every tool only READS the tenant's
 * own CRM and returns a compact text summary — no mutations, ever. This is the
 * "ask your business" surface: counts, lookups, lists. All customer queries
 * exclude simulated contacts so the numbers match the dashboard.
 */

const kes = (cents: number) => `KES ${Math.round(cents / 100).toLocaleString("en-KE")}`;

// KE is UTC+3, no DST. Ranges are computed in KE-local wall-clock.
const KE_OFFSET_MS = 3 * 3600_000;
function keRange(period: string): { gte: Date; label: string } {
  const now = Date.now();
  const keNow = new Date(now + KE_OFFSET_MS);
  const startOfKeDay = Date.UTC(keNow.getUTCFullYear(), keNow.getUTCMonth(), keNow.getUTCDate()) - KE_OFFSET_MS;
  switch (period) {
    case "today":
      return { gte: new Date(startOfKeDay), label: "today" };
    case "yesterday":
      return { gte: new Date(startOfKeDay - 86_400_000), label: "yesterday" };
    case "month":
      return { gte: new Date(now - 30 * 86_400_000), label: "the last 30 days" };
    case "week":
    default:
      return { gte: new Date(now - 7 * 86_400_000), label: "the last 7 days" };
  }
}

export const OWNER_TOOLS: Anthropic.Tool[] = [
  {
    name: "business_summary",
    description:
      "Headline numbers for a period: new leads, customers handled, appointments booked, follow-ups sent, money collected, and what's currently waiting. Use for 'how's business', 'how many leads today', 'what did I make this week'.",
    input_schema: {
      type: "object",
      properties: {
        period: { type: "string", enum: ["today", "yesterday", "week", "month"] },
      },
    },
  },
  {
    name: "find_customer",
    description:
      "Look up one customer by name or phone. Returns their stage, last contact, open invoices and next appointment. Use for 'what's up with James', 'has Mary paid', 'find 0712…'.",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Name or phone fragment" } },
      required: ["query"],
    },
  },
  {
    name: "list_invoices",
    description:
      "List invoices by state. 'overdue' = unpaid past due date; 'unpaid' = issued and awaiting payment; 'pending_approval' = AI-proposed, waiting for you to send; 'paid' = recently settled. Use for 'who owes me', 'what's overdue', 'invoices to approve'.",
    input_schema: {
      type: "object",
      properties: {
        state: { type: "string", enum: ["overdue", "unpaid", "pending_approval", "paid"] },
      },
      required: ["state"],
    },
  },
  {
    name: "list_appointments",
    description:
      "Upcoming booked appointments, soonest first. Use for 'what's on today', 'my schedule', 'who's coming in'.",
    input_schema: {
      type: "object",
      properties: { period: { type: "string", enum: ["today", "week"] } },
    },
  },
  {
    name: "pipeline_breakdown",
    description:
      "Count of open leads in each pipeline stage, plus how much is unpaid (from invoices raised but not yet settled). Use for 'how's my pipeline', 'how many leads in each stage'.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "whats_waiting",
    description:
      "Conversations that need a human — escalations and messages the AI couldn't handle. Use for 'what needs me', 'anything waiting', 'what's stuck'.",
    input_schema: { type: "object", properties: {} },
  },
];

export async function executeOwnerTool(
  tenant: Tenant,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  const tenantId = tenant.id;
  const base = { tenantId, isSimulated: false } as const;

  switch (name) {
    case "business_summary": {
      const { gte, label } = keRange(String(input.period ?? "week"));
      const [newLeads, handledRows, booked, followUpsSent, paid, waiting, overdue, pending] =
        await Promise.all([
          db.contact.count({ where: { ...base, createdAt: { gte } } }),
          db.message.findMany({
            where: { tenantId, direction: "in", createdAt: { gte }, contact: { isSimulated: false } },
            distinct: ["contactId"],
            select: { contactId: true },
          }),
          db.appointment.count({ where: { tenantId, status: "booked", createdAt: { gte } } }),
          db.followUp.count({ where: { tenantId, status: "sent", dueAt: { gte } } }),
          db.invoice.findMany({
            where: { tenantId, status: "paid", paidAt: { gte } },
            select: { amountCents: true },
          }),
          db.contact.count({ where: { ...base, OR: [{ needsHuman: true }, { needsReview: true }] } }),
          db.invoice.count({
            where: { tenantId, status: "pending", dueDate: { lt: new Date() } },
          }),
          db.invoice.count({ where: { tenantId, status: "pending_approval" } }),
        ]);
      const paidKes = paid.reduce((s, i) => s + i.amountCents, 0);
      return [
        `Summary for ${label}:`,
        `- New leads: ${newLeads}`,
        `- Customers handled: ${handledRows.length}`,
        `- Appointments booked: ${booked}`,
        `- Follow-ups sent: ${followUpsSent}`,
        `- Collected: ${kes(paidKes)}`,
        `Right now: ${waiting} waiting for you, ${pending} invoice(s) to approve, ${overdue} overdue.`,
      ].join("\n");
    }

    case "find_customer": {
      const q = String(input.query ?? "").trim();
      if (!q) return "No search term given.";
      const digits = q.replace(/\D/g, "");
      const contact = await db.contact.findFirst({
        where: {
          ...base,
          OR: [
            { name: { contains: q } },
            ...(digits ? [{ phone: { contains: digits } }] : []),
          ],
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!contact) return `No customer matching "${q}".`;
      const [invoices, appt, lastMsg] = await Promise.all([
        db.invoice.findMany({
          where: { contactId: contact.id, status: { in: ["pending", "pending_approval"] } },
          select: { number: true, amountCents: true, status: true, dueDate: true },
        }),
        db.appointment.findFirst({
          where: { contactId: contact.id, status: "booked", startsAt: { gte: new Date() } },
          orderBy: { startsAt: "asc" },
        }),
        db.message.findFirst({
          where: { contactId: contact.id, kind: "text" },
          orderBy: { createdAt: "desc" },
        }),
      ]);
      const lines = [
        `${contact.name ?? contact.phone} (${contact.phone})`,
        `- Stage: ${contact.stage}`,
      ];
      // Derived from the open invoices already loaded above — no stored figure to
      // drift, and it's listed line-by-line under "Open invoices" just below.
      const openCents = invoices.reduce((sum, i) => sum + i.amountCents, 0);
      if (openCents > 0) lines.push(`- Open value: ${kes(openCents)}`);
      if (lastMsg)
        lines.push(
          `- Last message (${lastMsg.direction === "in" ? "them" : "us"}): "${lastMsg.text.slice(0, 120)}"`,
        );
      if (invoices.length)
        lines.push(
          `- Open invoices: ${invoices
            .map((i) => `INV-${String(i.number).padStart(4, "0")} ${kes(i.amountCents)} (${i.status === "pending_approval" ? "awaiting your approval" : "unpaid"})`)
            .join("; ")}`,
        );
      else lines.push("- No open invoices");
      if (appt)
        lines.push(`- Next appointment: ${appt.startsAt.toLocaleString("en-KE", { dateStyle: "medium", timeStyle: "short" })}`);
      return lines.join("\n");
    }

    case "list_invoices": {
      const state = String(input.state ?? "unpaid");
      const now = new Date();
      const where =
        state === "overdue"
          ? { tenantId, status: "pending", dueDate: { lt: now } }
          : state === "pending_approval"
            ? { tenantId, status: "pending_approval" }
            : state === "paid"
              ? { tenantId, status: "paid" }
              : { tenantId, status: "pending" };
      const invoices = await db.invoice.findMany({
        where,
        include: { contact: { select: { name: true, phone: true } } },
        orderBy: state === "paid" ? { paidAt: "desc" } : { dueDate: "asc" },
        take: 15,
      });
      if (!invoices.length) return `No ${state.replace("_", " ")} invoices.`;
      const total = invoices.reduce((s, i) => s + i.amountCents, 0);
      const rows = invoices.map((i) => {
        const who = i.contact.name ?? i.contact.phone;
        const due = i.dueDate ? ` due ${i.dueDate.toLocaleDateString("en-KE", { dateStyle: "medium" })}` : "";
        return `- INV-${String(i.number).padStart(4, "0")} ${who} ${kes(i.amountCents)}${due}`;
      });
      return `${invoices.length} ${state.replace("_", " ")} invoice(s), ${kes(total)} total:\n${rows.join("\n")}`;
    }

    case "list_appointments": {
      const period = String(input.period ?? "week");
      const now = new Date();
      const end = new Date(now.getTime() + (period === "today" ? 86_400_000 : 7 * 86_400_000));
      const appts = await db.appointment.findMany({
        where: { tenantId, status: "booked", startsAt: { gte: now, lte: end } },
        include: { contact: { select: { name: true, phone: true } } },
        orderBy: { startsAt: "asc" },
        take: 20,
      });
      if (!appts.length) return `No appointments booked for ${period === "today" ? "today" : "the next 7 days"}.`;
      const rows = appts.map(
        (a) =>
          `- ${a.startsAt.toLocaleString("en-KE", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false })} — ${a.contact.name ?? a.contact.phone}`,
      );
      return `${appts.length} upcoming:\n${rows.join("\n")}`;
    }

    case "pipeline_breakdown": {
      const stages = JSON.parse(tenant.stages) as string[];
      // Open value is DERIVED from unpaid invoices, never stored. A stored figure
      // has to be maintained by someone, and nobody was — so it read KES 0 forever.
      // This can only ever report money a customer has actually been billed for.
      const [contacts, openInvoices] = await Promise.all([
        db.contact.findMany({
          where: { ...base, optedOut: false },
          select: { id: true, stage: true },
        }),
        db.invoice.groupBy({
          by: ["contactId"],
          where: { tenantId, status: { in: ["pending", "pending_approval"] } },
          _sum: { amountCents: true },
        }),
      ]);
      const unpaidByContact = new Map(
        openInvoices.map((r) => [r.contactId, r._sum.amountCents ?? 0]),
      );

      const byStage = new Map<string, { count: number; value: number }>();
      for (const s of stages) byStage.set(s, { count: 0, value: 0 });
      let totalValue = 0;
      for (const c of contacts) {
        const cur = byStage.get(c.stage) ?? { count: 0, value: 0 };
        const unpaid = unpaidByContact.get(c.id) ?? 0;
        cur.count++;
        cur.value += unpaid;
        byStage.set(c.stage, cur);
        totalValue += unpaid;
      }
      const rows = [...byStage.entries()].map(
        ([s, v]) => `- ${s}: ${v.count}${v.value ? ` (${kes(v.value)} unpaid)` : ""}`,
      );
      // Say nothing about money rather than assert a zero: a business with no
      // invoices raised yet has an unknown pipeline value, not a worthless one.
      const head = `Pipeline (${contacts.length} open leads${totalValue ? `, ${kes(totalValue)} unpaid` : ""}):`;
      return `${head}\n${rows.join("\n")}`;
    }

    case "whats_waiting": {
      const waiting = await db.contact.findMany({
        where: { ...base, OR: [{ needsHuman: true }, { needsReview: true }] },
        select: { name: true, phone: true, needsHuman: true, needsReview: true },
        orderBy: { updatedAt: "desc" },
        take: 15,
      });
      if (!waiting.length) return "Nothing is waiting — the AI is handling everything.";
      const rows = waiting.map(
        (c) => `- ${c.name ?? c.phone} — ${c.needsHuman ? "escalated to a human" : "AI couldn't process a message"}`,
      );
      return `${waiting.length} waiting for you:\n${rows.join("\n")}`;
    }

    default:
      return `Error: unknown tool ${name}`;
  }
}
