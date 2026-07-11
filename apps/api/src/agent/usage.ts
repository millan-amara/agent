import type Anthropic from "@anthropic-ai/sdk";
import type { Tenant } from "@prisma/client";
import { db } from "../db.js";
import { config } from "../config.js";
import { PLANS, TRIAL_CONV_LIMIT, type TierId } from "../billing.js";

/**
 * Per-tenant per-model daily token metering — drives pricing-margin visibility.
 *
 * The four token classes are kept apart because they bill at different rates
 * (cache read 0.1x base input, 5m write 1.25x, 1h write 2x). `usage.input_tokens`
 * from the API is ALREADY the base-input figure, exclusive of cache tokens, so
 * the classes sum to the true total without double-counting.
 *
 * Recording cacheRead/cacheWrite separately is also how we know caching works at
 * all: below a model's minimum cacheable prefix the API silently skips the cache
 * and returns both counters as 0, with no error. Haiku 4.5's minimum is 4,096
 * tokens — well above our system prompt — so every Haiku-tier reply is expected
 * to show zeroes here until that's addressed.
 */
export async function recordUsage(
  tenantId: string,
  model: string,
  usage: Anthropic.Usage,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);

  // Prefer the per-TTL breakdown; fall back to the flat counter (attributing it
  // to 5m, our default TTL) for older API responses that omit `cache_creation`.
  const flatWrite = usage.cache_creation_input_tokens ?? 0;
  const cacheWrite5mTokens = usage.cache_creation?.ephemeral_5m_input_tokens ?? flatWrite;
  const cacheWrite1hTokens = usage.cache_creation?.ephemeral_1h_input_tokens ?? 0;
  const cacheReadTokens = usage.cache_read_input_tokens ?? 0;

  const counts = {
    inputTokens: usage.input_tokens,
    outputTokens: usage.output_tokens,
    cacheWrite5mTokens,
    cacheWrite1hTokens,
    cacheReadTokens,
  };

  try {
    await db.usage.upsert({
      where: { tenantId_day_model: { tenantId, day, model } },
      create: { tenantId, day, model, ...counts, llmCalls: 1 },
      update: {
        inputTokens: { increment: counts.inputTokens },
        outputTokens: { increment: counts.outputTokens },
        cacheWrite5mTokens: { increment: counts.cacheWrite5mTokens },
        cacheWrite1hTokens: { increment: counts.cacheWrite1hTokens },
        cacheReadTokens: { increment: counts.cacheReadTokens },
        llmCalls: { increment: 1 },
      },
    });
  } catch (err) {
    console.error("[usage] failed to record:", err);
  }
}

/**
 * The tenant-level cost ceiling.
 *
 * Billing meters CONVERSATIONS (a contact with an inbound message this month),
 * but we are charged per model CALL — and the two are only loosely coupled. One
 * customer who keeps talking generates turns without ever generating a second
 * billable conversation, so a flat call budget is either uselessly high for a
 * Starter tenant or crippling for a Pro one. Derive it from what they bought.
 *
 * A typical 6-turn conversation costs ~8 reply calls (each turn is one call,
 * plus a second for turns that run tools). 16 is ~2x that: generous enough that
 * no honest tenant will ever see it, tight enough to bound a runaway.
 *
 * NOTE: this is a RUNAWAY guard, not the margin mechanism. It cannot make an
 * underpriced tier profitable — a Pro tenant using its full conversation cap is
 * unprofitable at normal turn counts, which is a pricing problem, not an abuse
 * problem.
 */
const CALLS_PER_CONVERSATION_BUDGET = 16;

export function monthlyCallBudget(tenant: Tenant): number {
  const tier = (tenant.planTier as TierId | null) ?? null;
  const conversations =
    tenant.plan === "active" && tier && PLANS[tier] ? PLANS[tier].convLimit : TRIAL_CONV_LIMIT;
  return conversations * CALLS_PER_CONVERSATION_BUDGET;
}

/**
 * Model calls this tenant has spent this month, excluding the cheap auxiliary
 * model (image captioning). Deliberately NOT filtered to a specific model id:
 * the old version counted only rows matching the CURRENT config.REPLY_MODEL, so
 * changing the reply model silently orphaned the month's history and reset the
 * budget to zero.
 */
export async function replyCallsThisMonth(tenantId: string): Promise<number> {
  const from = new Date().toISOString().slice(0, 8) + "01";
  const agg = await db.usage.aggregate({
    _sum: { llmCalls: true },
    where: { tenantId, day: { gte: from }, NOT: { model: config.FAST_MODEL } },
  });
  return agg._sum.llmCalls ?? 0;
}

/** False once the tenant has exhausted the month's call budget for its tier. */
export async function withinMonthlyCallBudget(tenant: Tenant): Promise<boolean> {
  return (await replyCallsThisMonth(tenant.id)) < monthlyCallBudget(tenant);
}
