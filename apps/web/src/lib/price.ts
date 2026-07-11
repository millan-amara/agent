/**
 * Mirrors `parseFixedAmountKes` in the API (apps/api/src/agent/prompt.ts), which is
 * the authoritative copy — the server re-derives this on save and never trusts the
 * client. This one exists purely so the settings form can tell the owner, as they
 * type, whether a price is something the AI can invoice or something it must hand to
 * a human. Keep the two rules in step.
 *
 * A price is only invoiceable when it names exactly ONE number and carries no wording
 * that makes it a starting point, a range, or a rate.
 */
export function parseFixedAmountKes(price?: string): number | undefined {
  const text = (price ?? "").trim();
  if (!text) return undefined;
  if (
    /\b(from|starting|onwards?|approx\.?|approximately|around|about|up\s?to|negotiable|varies|variable|depends|quote|tbd|each|hourly|per\s?(hour|hr|day|month|week)|\/\s?(hour|hr|day|month|week))\b/i.test(
      text,
    )
  ) {
    return undefined;
  }
  const numbers = text.match(/\d[\d,]*(?:\.\d+)?/g) ?? [];
  if (numbers.length !== 1) return undefined;
  const amount = Number(numbers[0]!.replace(/,/g, ""));
  if (!Number.isFinite(amount) || amount <= 0 || amount > 10_000_000) return undefined;
  return Math.round(amount);
}

/** "KES 3,500" — how a derived amount is shown back to the owner. */
export function formatKes(amount: number): string {
  return `KES ${amount.toLocaleString("en-KE")}`;
}
