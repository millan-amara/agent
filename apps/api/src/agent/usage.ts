import type Anthropic from "@anthropic-ai/sdk";
import type { Tenant } from "@prisma/client";
import { db } from "../db.js";
import { config } from "../config.js";

/** Per-tenant per-model daily token metering — drives pricing-margin visibility. */
export async function recordUsage(
  tenantId: string,
  model: string,
  usage: Anthropic.Usage,
): Promise<void> {
  const day = new Date().toISOString().slice(0, 10);
  const inputTokens =
    usage.input_tokens +
    (usage.cache_creation_input_tokens ?? 0) +
    (usage.cache_read_input_tokens ?? 0);
  try {
    await db.usage.upsert({
      where: { tenantId_day_model: { tenantId, day, model } },
      create: { tenantId, day, model, inputTokens, outputTokens: usage.output_tokens, llmCalls: 1 },
      update: {
        inputTokens: { increment: inputTokens },
        outputTokens: { increment: usage.output_tokens },
        llmCalls: { increment: 1 },
      },
    });
  } catch (err) {
    console.error("[usage] failed to record:", err);
  }
}

// Per-tenant daily budget on expensive (reply-model) calls — the real cost
// driver, since the router runs on cheap Haiku. Tight during trial (the abuse
// surface); a high runaway circuit-breaker for paid tenants who are already
// metered by conversation tier. Counts reply-model calls only.
const TRIAL_DAILY_REPLY_BUDGET = 300;
const PAID_DAILY_REPLY_BUDGET = 20_000;

export function dailyReplyBudget(tenant: Tenant): number {
  return tenant.plan === "active" ? PAID_DAILY_REPLY_BUDGET : TRIAL_DAILY_REPLY_BUDGET;
}

/** Reply-model calls this tenant has spent today (UTC day, matches recordUsage). */
export async function replyCallsToday(tenantId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const agg = await db.usage.aggregate({
    _sum: { llmCalls: true },
    where: { tenantId, day, model: config.REPLY_MODEL },
  });
  return agg._sum.llmCalls ?? 0;
}

/** False once the tenant has exhausted its daily reply-model budget. */
export async function withinDailyReplyBudget(tenant: Tenant): Promise<boolean> {
  return (await replyCallsToday(tenant.id)) < dailyReplyBudget(tenant);
}
