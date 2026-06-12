import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { db } from "../db.js";
import { publish } from "../events.js";
import type { MessageSender } from "../whatsapp/sender.js";
import { buildSystemPrompt } from "./prompt.js";
import { buildTools, executeTool, type ToolContext } from "./tools.js";

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY });

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 40;

/**
 * The core loop: load tenant + contact + history, ask Claude with CRM tools,
 * execute tool calls, send the final reply. Called by the queue after the
 * debounce window, so one run answers a batch of customer messages.
 */
export async function runAgentTurn(
  tenantId: string,
  contactId: string,
  sender: MessageSender,
  opts: { followUpNote?: string } = {},
): Promise<void> {
  const tenant = await db.tenant.findUniqueOrThrow({ where: { id: tenantId } });
  let contact = await db.contact.findUniqueOrThrow({ where: { id: contactId } });

  if (!tenant.aiEnabled || contact.aiPaused || contact.optedOut) return;

  const stages = JSON.parse(tenant.stages) as string[];

  // Cheap code-level guard before any model call: explicit opt-out keywords.
  const lastInbound = await db.message.findFirst({
    where: { contactId, direction: "in" },
    orderBy: { createdAt: "desc" },
  });
  if (lastInbound && /^\s*(stop|unsubscribe|acha kunitumia)\s*$/i.test(lastInbound.text)) {
    const ctx: ToolContext = { tenant, contact, stages };
    await executeTool(ctx, "stop_messaging", { reason: "Keyword opt-out" });
    await sendReply(ctx, sender, "Sawa — you won't receive any more messages from us. Thank you!");
    return;
  }

  // Rebuild conversation history from the DB. Consecutive same-role messages
  // are allowed — the API merges them into one turn.
  const history = await db.message.findMany({
    where: { contactId, kind: "text" },
    orderBy: { createdAt: "desc" },
    take: HISTORY_LIMIT,
  });
  const messages: Anthropic.MessageParam[] = history
    .reverse()
    .map((m) => ({
      role: m.direction === "in" ? ("user" as const) : ("assistant" as const),
      content: m.text,
    }));

  if (opts.followUpNote) {
    // Follow-up runs are agent-initiated: no new customer message. Give the
    // model the stored context and ask it to write the check-in.
    messages.push({
      role: "user",
      content: `<system-reminder>This is a scheduled follow-up, not a customer message. Context from the earlier conversation: "${opts.followUpNote}". Write one short, natural check-in message referencing that context. If they previously declined or opted out, reply with exactly NO_FOLLOWUP.</system-reminder>`,
    });
  }
  if (messages.length === 0) return;
  if (messages[messages.length - 1]!.role === "assistant") return; // nothing new to answer

  const ctx: ToolContext = { tenant, contact, stages };
  const tools = buildTools(stages);

  // The system prompt is byte-stable per tenant — cache it. Tools render
  // before system, so this one breakpoint caches tools + system together.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(tenant, stages),
      cache_control: { type: "ephemeral" },
    },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model: config.REPLY_MODEL,
      max_tokens: 1024,
      system,
      tools,
      messages,
    });

    if (response.stop_reason === "refusal") {
      await executeTool(ctx, "escalate_to_human", {
        reason: "Model declined to respond (safety refusal)",
      });
      return;
    }

    const toolUses = response.content.filter(
      (b): b is Anthropic.ToolUseBlock => b.type === "tool_use",
    );

    if (response.stop_reason !== "tool_use" || toolUses.length === 0) {
      const text = response.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text && text !== "NO_FOLLOWUP") {
        await sendReply(ctx, sender, text);
      }
      return;
    }

    messages.push({ role: "assistant", content: response.content });
    const results: Anthropic.ToolResultBlockParam[] = [];
    for (const tu of toolUses) {
      const result = await executeTool(ctx, tu.name, tu.input as Record<string, unknown>);
      results.push({
        type: "tool_result",
        tool_use_id: tu.id,
        content: result,
        is_error: result.startsWith("Error:"),
      });
    }
    messages.push({ role: "user", content: results });
  }

  // Tool-loop runaway guard tripped — hand off rather than go silent.
  await executeTool(ctx, "escalate_to_human", {
    reason: "Agent exceeded the tool-call limit in one turn",
  });
}

async function sendReply(ctx: ToolContext, sender: MessageSender, text: string): Promise<void> {
  await sender.sendText(ctx.tenant, ctx.contact, text);
  await db.message.create({
    data: {
      tenantId: ctx.tenant.id,
      contactId: ctx.contact.id,
      direction: "out",
      author: "ai",
      text,
    },
  });
  publish({ type: "message", tenantId: ctx.tenant.id, contactId: ctx.contact.id });
}
