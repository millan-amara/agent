import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { recordUsage } from "./usage.js";

/**
 * Cost tiering (PLAN §3): a cheap classifier in front of the reply model.
 * Most WhatsApp turns are simple (greetings, hours, single FAQ) and don't need
 * the strong model. The router (Haiku) labels the turn; simple turns are then
 * answered by the cheap model, complex/tool-heavy ones by the reply model.
 * Defaults to "complex" on any doubt — never trade correctness for cost.
 */
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 });

export type Tier = "simple" | "complex";

const SYSTEM = `You are a router for a WhatsApp business assistant. Classify the customer's latest message by how much capability the reply needs. Answer with exactly one word:
- SIMPLE: a greeting, thanks, or a single factual question answerable from basic business info (hours, location, price of one service). No multi-step reasoning, no booking, no payment, no complaint.
- COMPLEX: booking or rescheduling, payment, negotiation, a complaint or upset tone, anything ambiguous, multi-part, or needing the knowledge base or tools.
When unsure, answer COMPLEX.`;

/** Returns the model tier for this turn. Falls back to "complex" on error. */
export async function classifyTier(tenantId: string, latestCustomerText: string): Promise<Tier> {
  // No router model configured, or same as reply model → skip the extra call.
  if (!config.ANTHROPIC_API_KEY || config.ROUTER_MODEL === config.REPLY_MODEL) {
    return "complex";
  }
  try {
    const res = await client.messages.create({
      model: config.ROUTER_MODEL,
      max_tokens: 8,
      system: SYSTEM,
      messages: [{ role: "user", content: latestCustomerText.slice(0, 2000) }],
    });
    await recordUsage(tenantId, config.ROUTER_MODEL, res.usage);
    const label = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .toUpperCase();
    return label.includes("SIMPLE") ? "simple" : "complex";
  } catch (err) {
    console.error("[router] classification failed, using reply model:", err);
    return "complex";
  }
}

/** The model to use for a given tier. */
export function modelForTier(tier: Tier): string {
  return tier === "simple" ? config.ROUTER_MODEL : config.REPLY_MODEL;
}

export { recordUsage };
