import { config } from "./config.js";

/**
 * Internal LLM cost accounting. Turns the per-model token meter (Usage) into
 * KES so we can watch margins per tenant (PLAN §3, key design factor 5).
 *
 * Base USD-per-1M-token rates from https://platform.claude.com/docs/en/about-claude/pricing
 * (verified 2026-07-11). Cache rates are not listed separately here because they
 * are fixed multipliers of the model's base input rate — see CACHE_* below.
 */
interface Price {
  inPerM: number;
  outPerM: number;
}

/**
 * Matched by substring, most specific first: "opus-4-8" must be tested before
 * "opus-4", or claude-opus-4-8 would be priced as a retired Opus 4 at 3x.
 *
 * Sonnet 5 is listed at its STANDARD rate ($3/$15), not the $2/$10 introductory
 * rate that runs to 2026-08-31. Margins should be modelled on what we will
 * actually pay from September, so this deliberately over-reports today's spend
 * rather than flattering it.
 */
const PRICES: Array<{ match: string; price: Price }> = [
  { match: "fable-5", price: { inPerM: 10, outPerM: 50 } },
  { match: "mythos-5", price: { inPerM: 10, outPerM: 50 } },
  { match: "opus-4-8", price: { inPerM: 5, outPerM: 25 } },
  { match: "opus-4-7", price: { inPerM: 5, outPerM: 25 } },
  { match: "opus-4-6", price: { inPerM: 5, outPerM: 25 } },
  { match: "opus-4-5", price: { inPerM: 5, outPerM: 25 } },
  { match: "opus-4-1", price: { inPerM: 15, outPerM: 75 } },
  { match: "opus-4", price: { inPerM: 15, outPerM: 75 } },
  { match: "sonnet-5", price: { inPerM: 3, outPerM: 15 } },
  { match: "sonnet-4", price: { inPerM: 3, outPerM: 15 } },
  { match: "haiku-4-5", price: { inPerM: 1, outPerM: 5 } },
  { match: "haiku-3-5", price: { inPerM: 0.8, outPerM: 4 } },
];

/**
 * An unrecognised model is priced at Opus rates: an unknown model should make
 * the cost dashboard look too expensive, never too cheap. A silent understate
 * is how you discover a margin hole from your bank balance.
 */
const FALLBACK: Price = { inPerM: 5, outPerM: 25 };

/** Cache rates are multipliers on the model's base input rate. */
const CACHE_WRITE_5M = 1.25;
const CACHE_WRITE_1H = 2;
const CACHE_READ = 0.1;

const warnedModels = new Set<string>();

function priceFor(model: string): Price {
  const hit = PRICES.find((p) => model.toLowerCase().includes(p.match));
  if (!hit) {
    if (!warnedModels.has(model)) {
      warnedModels.add(model);
      console.warn(`[costs] no price for model "${model}" — billing it at Opus rates`);
    }
    return FALLBACK;
  }
  return hit.price;
}

/** The token counts we meter per model. All are billed at different rates. */
export interface TokenCounts {
  /** Base input: tokens NOT served from, or written to, the cache. */
  inputTokens: number;
  outputTokens: number;
  cacheWrite5mTokens: number;
  cacheWrite1hTokens: number;
  cacheReadTokens: number;
}

/** USD cost for a model's token counts. */
export function usdFor(model: string, t: TokenCounts): number {
  const p = priceFor(model);
  const inRate = p.inPerM / 1_000_000;
  return (
    t.inputTokens * inRate +
    t.cacheWrite5mTokens * inRate * CACHE_WRITE_5M +
    t.cacheWrite1hTokens * inRate * CACHE_WRITE_1H +
    t.cacheReadTokens * inRate * CACHE_READ +
    (t.outputTokens * p.outPerM) / 1_000_000
  );
}

export function usdToKes(usd: number): number {
  return usd * config.USD_TO_KES;
}
