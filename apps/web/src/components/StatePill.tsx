import type { ApiContact } from "@/lib/api";

/**
 * The glanceable AI state — on every conversation row and in the chat header.
 * Amber is reserved for "needs your attention now" (escalations); everything
 * else stays neutral.
 */
export function StatePill({ contact, size = "sm" }: { contact: ApiContact; size?: "sm" | "md" }) {
  const cls = size === "sm" ? "px-1.5 py-0.5 text-[10px]" : "px-2 py-0.5 text-xs";
  if (contact.optedOut) {
    return (
      <span className={`${cls} rounded-full border border-line bg-canvas font-medium text-muted`}>
        Opted out
      </span>
    );
  }
  if (contact.needsHuman) {
    return (
      <span className={`${cls} rounded-full bg-attentionSoft font-medium text-attention`}>
        🔥 Needs you
      </span>
    );
  }
  if (contact.aiPaused) {
    return (
      <span className={`${cls} rounded-full border border-line bg-canvas font-medium text-muted`}>
        👤 Human
      </span>
    );
  }
  return (
    <span className={`${cls} rounded-full bg-primary-soft font-medium text-primary-dark`}>
      🤖 AI
    </span>
  );
}
