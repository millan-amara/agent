import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Tenant } from "@prisma/client";
import { config } from "../config.js";
import { db } from "../db.js";
import type { MessageSender } from "../whatsapp/sender.js";
import { recordUsage, withinDailyReplyBudget } from "./usage.js";
import { OWNER_TOOLS, executeOwnerTool } from "./ownerTools.js";

/**
 * The owner assistant: the business owner messages their own WhatsApp number and
 * gets a private, read-only view of their CRM ("how many leads today", "who
 * owes me", "what's on this week"). Runs on the same queue as customer turns but
 * against the isolated OwnerMessage table — owner traffic never counts as a lead.
 */

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });
const MAX_TOOL_ITERATIONS = 6;
const HISTORY_LIMIT = 20;
// Owner burst guard (cost): the owner is trusted, but cap rapid-fire spam.
const OWNER_WINDOW_MS = 10 * 60 * 1000;
const OWNER_MAX_INBOUND_PER_WINDOW = 30;

function ownerSystemPrompt(tenant: Tenant): string {
  return `You are the private business assistant for the owner of ${tenant.name}. The owner is messaging you on WhatsApp to ask about their own business. You are NOT talking to a customer.

Your job: answer questions about the business's CRM — leads, customers, appointments, invoices, money, and what needs attention — using the tools. You are READ-ONLY: you can look things up but cannot change, create, cancel, or send anything yet. If the owner asks you to update, add, cancel, mark paid, message a customer, or change something, tell them that's coming soon and, for now, to do it from the Azayon web app.

Rules:
- Only state numbers and facts that come from a tool result. Never estimate or invent figures.
- Call a tool for anything data-related, even if it seems simple. Don't answer from memory.
- Be brief and skimmable — this is WhatsApp. Short lines, no long paragraphs. Money in KES.
- If a lookup returns nothing, say so plainly.
- If the message is a greeting or thanks, reply warmly in one line and offer what you can check (leads, invoices, appointments, what's waiting).`;
}

/**
 * Builds a synthetic in-memory Contact so the WhatsApp sender can address the
 * owner's number. Never persisted. The owner just messaged us, so the 24h window
 * is open by construction.
 */
function ownerAsContact(tenant: Tenant, phone: string): Contact {
  const now = new Date();
  return {
    id: `owner:${tenant.id}`,
    tenantId: tenant.id,
    phone,
    name: null,
    stage: "",
    fields: "{}",
    source: null,
    assignedUserId: null,
    isSimulated: false,
    aiPaused: false,
    optedOut: false,
    needsHuman: false,
    needsReview: false,
    lastInboundAt: now,
    createdAt: now,
    updatedAt: now,
  };
}

export async function runOwnerTurn(tenantId: string, sender: MessageSender): Promise<void> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId } });
  if (!tenant || !tenant.ownerChatEnabled || !tenant.ownerPhone) return;

  const history = await db.ownerMessage.findMany({
    where: { tenantId },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  if (history.length === 0) return;
  // Nothing new to answer if our last turn already replied.
  if (history[0]!.direction === "out") return;

  // Burst guard: cap rapid-fire owner messages so the assistant can't be spun
  // into a flood of model calls.
  const recentInbound = await db.ownerMessage.count({
    where: { tenantId, direction: "in", createdAt: { gte: new Date(Date.now() - OWNER_WINDOW_MS) } },
  });
  if (recentInbound > OWNER_MAX_INBOUND_PER_WINDOW) {
    console.log(`[owner] burst limit reached for ${tenant.name} — skipping turn`);
    return;
  }

  // Tenant-wide daily cost budget applies to owner turns too (they use the
  // reply model). Skip silently once exhausted.
  if (!(await withinDailyReplyBudget(tenant))) {
    console.log(`[owner] ${tenant.name}: daily reply budget reached — skipping owner turn`);
    return;
  }

  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));

  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: ownerSystemPrompt(tenant), cache_control: { type: "ephemeral" } },
  ];

  try {
    for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
      const response = await client.messages.create({
        model: config.REPLY_MODEL,
        max_tokens: 1024,
        system,
        tools: OWNER_TOOLS,
        messages,
      });
      await recordUsage(tenant.id, config.REPLY_MODEL, response.usage);

      const toolUses = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
      );
      if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
        const text = response.content
          .filter((b): b is Anthropic.TextBlock => b.type === "text")
          .map((b) => b.text)
          .join("\n")
          .trim();
        if (text) await sendOwnerReply(tenant, sender, text);
        return;
      }

      messages.push({ role: "assistant", content: response.content });
      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const tu of toolUses) {
        const result = await executeOwnerTool(tenant, tu.name, tu.input as Record<string, unknown>);
        results.push({
          type: "tool_result",
          tool_use_id: tu.id,
          content: result,
          is_error: result.startsWith("Error:"),
        });
      }
      messages.push({ role: "user", content: results });
    }
    await sendOwnerReply(
      tenant,
      sender,
      "That's a lot to pull together — try asking one thing at a time (e.g. \"overdue invoices\" or \"leads today\").",
    );
  } catch (err) {
    console.error(`[owner] turn failed tenant=${tenantId}:`, err);
    await sendOwnerReply(tenant, sender, "Sorry — I hit a snag pulling that up. Try again in a moment.").catch(
      () => {},
    );
  }
}

async function sendOwnerReply(tenant: Tenant, sender: MessageSender, text: string): Promise<void> {
  const contact = ownerAsContact(tenant, tenant.ownerPhone!);
  const waMessageId = await sender.sendText(tenant, contact, text);
  await db.ownerMessage.create({ data: { tenantId: tenant.id, direction: "out", text, waMessageId } });
}
