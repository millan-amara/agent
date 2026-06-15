import { config } from "./config.js";

/**
 * Internal LLM cost accounting. Turns the per-model token meter (Usage) into
 * KES so we can watch margins per tenant (PLAN §3, key design factor 5).
 *
 * Prices are approximate USD per 1M tokens and MUST be reviewed against the
 * current Anthropic price list — they're estimates for internal margin math,
 * not billing. Matched by model-family substring.
 */
interface Price {
  inPerM: number;
  outPerM: number;
}

const PRICES: Array<{ match: string; price: Price }> = [
  { match: "opus", price: { inPerM: 15, outPerM: 75 } },
  { match: "sonnet", price: { inPerM: 3, outPerM: 15 } },
  { match: "haiku", price: { inPerM: 1, outPerM: 5 } },
];
const FALLBACK: Price = { inPerM: 5, outPerM: 15 };

function priceFor(model: string): Price {
  return PRICES.find((p) => model.toLowerCase().includes(p.match))?.price ?? FALLBACK;
}

/** USD cost for a model's token counts. */
export function usdFor(model: string, inputTokens: number, outputTokens: number): number {
  const p = priceFor(model);
  return (inputTokens / 1_000_000) * p.inPerM + (outputTokens / 1_000_000) * p.outPerM;
}

export function usdToKes(usd: number): number {
  return usd * config.USD_TO_KES;
}
