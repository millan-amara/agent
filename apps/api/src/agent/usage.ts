import type Anthropic from "@anthropic-ai/sdk";
import { db } from "../db.js";

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
