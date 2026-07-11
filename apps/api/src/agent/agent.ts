import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { db } from "../db.js";
import { publish } from "../events.js";
import type { MessageSender } from "../whatsapp/sender.js";
import { buildSystemPrompt } from "./prompt.js";
import { buildTools, executeTool, tenantCapabilities, type ToolContext } from "./tools.js";
import { recordUsage, withinMonthlyCallBudget } from "./usage.js";
import { billingStatus, canSend, monthStart } from "../billing.js";

// Bound each request so a degraded endpoint can't hang a queue worker (the SDK
// default is ~10 min). The loop makes up to MAX_TOOL_ITERATIONS sequential calls.
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 60_000, maxRetries: 2 });

const MAX_TOOL_ITERATIONS = 8;
const HISTORY_LIMIT = 40;

/**
 * Both cache breakpoints (system+tools, and the auto one on history) must use
 * the SAME ttl — mixing them on one request is a 400 from the API.
 */
const CACHE_TTL = config.CACHE_TTL;

// Abuse / cost guards. One hostile contact can amplify a flood of inbound
// messages into many model calls (a router classification plus up to
// MAX_TOOL_ITERATIONS reply calls per turn), so we cap a single conversation on
// two horizons and hand off to a human (which pauses the AI for that contact)
// when either trips — instead of burning the tenant's token budget:
//   - RATE_WINDOW: a fast burst (many messages in minutes).
//   - DAY: a slow drip pacing just under the burst limit for hours. Counts our
//     AI replies (≈ paid model turns), so batched bursts don't over-count.
const RATE_WINDOW_MS = 10 * 60 * 1000;
const MAX_INBOUND_PER_WINDOW = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_AI_REPLIES_PER_DAY = 50;

/**
 * Turns one contact may consume in a calendar month.
 *
 * This is the one that closes the metering hole. Billing counts a contact with
 * an inbound message as ONE conversation for the month, however much they then
 * say — but we pay per turn. Without this, a single contact pacing under the
 * daily cap could run 50 replies a day for a month (~1,500 turns, well over a
 * thousand shillings) while the tenant is billed for a single conversation
 * worth KES 16.67 on Starter. 150/month is ~5 a day sustained: far beyond any
 * genuine back-and-forth, so a real customer will never touch it.
 */
const MAX_AI_REPLIES_PER_MONTH = 150;

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
  // The inbound message is already persisted before we get here, so the capture
  // never depends on the AI. If the turn itself fails (API down, unexpected
  // throw), flag the contact for review rather than leaving the customer ghosted.
  try {
    await runAgentTurnInner(tenantId, contactId, sender, opts);
  } catch (err) {
    await markTurnFailed(tenantId, contactId, err);
  }
}

async function runAgentTurnInner(
  tenantId: string,
  contactId: string,
  sender: MessageSender,
  opts: { followUpNote?: string },
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

  // Billing gate: read-only (expired trial / past_due) → the AI stays silent;
  // over-limit → existing conversations keep working but new ones this month
  // are soft-blocked until the tenant upgrades. (Opt-out above always runs.)
  const billing = await billingStatus(tenant);
  if (!canSend(billing.state)) return;
  if (billing.state === "over_limit" && contact.createdAt >= monthStart()) return;

  // Tenant-wide cost circuit-breaker, sized to the tier they bought. Bounds total
  // spend across ALL conversations, so spreading a flood over many contacts can't
  // run up the bill either. Skip silently once exhausted.
  if (!(await withinMonthlyCallBudget(tenant))) {
    console.log(`[budget] ${tenant.name}: monthly AI call budget reached — turn skipped`);
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

  // Pre-AI junk filter: a bare closing ack ("thanks", "👍") after our own reply
  // is a conversational dead-end — capturing it is enough, no LLM call needed.
  // Conservative: only skip when the previous turn was OUR reply and it wasn't a
  // question, so a "yes"/"sawa" answering "shall I book you in?" still gets handled.
  if (!opts.followUpNote && lastInbound && isLowSignalAck(lastInbound.text)) {
    const prev = messages[messages.length - 2];
    const prevText = typeof prev?.content === "string" ? prev.content : "";
    if (prev?.role === "assistant" && !prevText.trim().endsWith("?")) return;
  }

  const ctx: ToolContext = { tenant, contact, stages };

  // Cost/abuse guard — runs before any model call (router or reply). A genuine
  // follow-up run carries no new inbound and is exempt.
  if (!opts.followUpNote) {
    const recentInbound = await db.message.count({
      where: {
        contactId,
        direction: "in",
        createdAt: { gte: new Date(Date.now() - RATE_WINDOW_MS) },
      },
    });
    if (recentInbound > MAX_INBOUND_PER_WINDOW) {
      await executeTool(ctx, "escalate_to_human", {
        reason: "High message volume from this contact — AI paused for review",
      });
      return;
    }

    // Slow-drip guard: a contact pacing just under the burst limit can still
    // rack up hundreds of model turns over a day. Cap the AI replies one
    // conversation gets per rolling 24h and hand off past it.
    const repliesLastDay = await db.message.count({
      where: {
        contactId,
        direction: "out",
        author: "ai",
        createdAt: { gte: new Date(Date.now() - DAY_MS) },
      },
    });
    if (repliesLastDay >= MAX_AI_REPLIES_PER_DAY) {
      await executeTool(ctx, "escalate_to_human", {
        reason: `Conversation reached the daily AI-reply limit (${MAX_AI_REPLIES_PER_DAY}/24h) — paused for a human to review`,
      });
      return;
    }

    // The metering-hole guard: this contact is ONE billed conversation for the
    // month no matter how many turns it takes, so cap the turns it can take.
    const repliesThisMonth = await db.message.count({
      where: {
        contactId,
        direction: "out",
        author: "ai",
        createdAt: { gte: monthStart() },
      },
    });
    if (repliesThisMonth >= MAX_AI_REPLIES_PER_MONTH) {
      await executeTool(ctx, "escalate_to_human", {
        reason: `Conversation reached the monthly AI-reply limit (${MAX_AI_REPLIES_PER_MONTH}) — paused for a human to review`,
      });
      return;
    }
  }

  const caps = await tenantCapabilities(tenant);
  const tools = buildTools(stages, caps);

  // Every turn goes to the reply model. There used to be a cheap-router tier in
  // front of this (a Haiku classifier that sent "simple" turns to Haiku), but it
  // was measured and it saved nothing: Haiku's 4,096-token minimum cacheable
  // prefix is larger than our system+tools, so a Haiku reply could never hit the
  // cache and cost about the same as a cache-warm Sonnet reply — while adding a
  // classifier round-trip to every reply and answering 40% of turns with a
  // weaker model. Cost was within 1%; latency and quality were strictly worse.
  const model = config.REPLY_MODEL;

  // The system prompt is byte-stable per tenant — cache it. Tools render
  // before system, so this one breakpoint caches tools + system together.
  //
  // 1h, not the 5m default: WhatsApp conversations are paced by humans, and a
  // typical tenant sees a handful of conversations a day. At 5m the cache had
  // almost always expired before the next turn, so quiet tenants — most Kenyan
  // SMEs — were re-reading the whole prefix at full price while paying the cache
  // write premium for nothing. A 1h write costs 2x base input (vs 1.25x) and a
  // read costs 0.1x, so this pays for itself after two reads.
  const system: Anthropic.TextBlockParam[] = [
    {
      type: "text",
      text: buildSystemPrompt(tenant, stages, caps),
      cache_control: { type: "ephemeral", ttl: CACHE_TTL },
    },
  ];

  for (let i = 0; i < MAX_TOOL_ITERATIONS; i++) {
    const response = await client.messages.create({
      model,
      max_tokens: 1024,
      system,
      tools,
      messages,
      // No top-level (automatic) cache_control here on purpose. Caching the
      // conversation history as well was measured on realistically-paced
      // conversations and came out a wash — each turn writes a fresh history
      // block at the write premium, which cancels the base-input it saves. It
      // is not worth the extra breakpoint.
    });
    await recordUsage(tenant.id, model, response.usage);

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

// Closing pleasantries that need no reply. Kept deliberately small — when in
// doubt we let the message through to the model rather than risk ghosting a lead.
const ACK_RE =
  /^(ok(ay)?|kk?|sawa|asante( sana)?|ahsante|thanks?|thank you|thx|ty|cool|great|nice|noted|sure|got it|perfect|👍|🙏|👌)$/i;

// Trailing/leading emoji, punctuation and separators — real acks look like
// "asante 👍", "ok.", "thanks 🙏", so strip these before matching the word list.
const TRIM_DECOR = /^[\s\p{P}\p{Extended_Pictographic}️‍]+|[\s\p{P}\p{Extended_Pictographic}️‍]+$/gu;

function isLowSignalAck(text: string): boolean {
  const t = text.trim();
  if (!t) return false;
  // No letters or digits at all = emoji/punctuation only, nothing to act on.
  if (!/[\p{L}\p{N}]/u.test(t)) return true;
  return ACK_RE.test(t.replace(TRIM_DECOR, "").trim());
}

async function sendReply(ctx: ToolContext, sender: MessageSender, text: string): Promise<void> {
  const waMessageId = await sender.sendText(ctx.tenant, ctx.contact, text);
  await db.message.create({
    data: {
      tenantId: ctx.tenant.id,
      contactId: ctx.contact.id,
      direction: "out",
      author: "ai",
      text,
      waMessageId,
      status: waMessageId ? "sent" : null,
    },
  });
  // A successful reply means the AI is working again — clear any stale review flag.
  if (ctx.contact.needsReview) {
    await db.contact.update({ where: { id: ctx.contact.id }, data: { needsReview: false } });
  }
  publish({ type: "message", tenantId: ctx.tenant.id, contactId: ctx.contact.id });
}

/**
 * Records that an agent turn failed so the owner sees it instead of the customer
 * being silently dropped. Idempotent on the flag so a flapping outage doesn't
 * spam the timeline. Best-effort — never throws back into the caller.
 */
async function markTurnFailed(tenantId: string, contactId: string, err: unknown): Promise<void> {
  console.error(`[agent] turn failed tenant=${tenantId} contact=${contactId}:`, err);
  try {
    const contact = await db.contact.findUnique({ where: { id: contactId } });
    if (!contact || contact.needsReview) return; // already flagged
    await db.contact.update({ where: { id: contactId }, data: { needsReview: true } });
    await db.message.create({
      data: {
        tenantId,
        contactId,
        direction: "out",
        author: "system",
        kind: "event",
        text: "AI couldn't process this message — needs review",
      },
    });
    publish({ type: "contact_updated", tenantId, contactId });
  } catch (flagErr) {
    console.error("[agent] failed to flag needsReview:", flagErr);
  }
}
