import { Flame, AlertTriangle, User, Bot, Ban } from "lucide-react";
import type { ApiContact } from "@/lib/api";
import { Badge, type BadgeTone } from "@/components/ui/Badge";

/**
 * The glanceable AI state — on every conversation row and in the chat header.
 * Amber is reserved for "needs your attention now" (escalations); everything
 * else stays neutral.
 */
export function StatePill({ contact, size = "sm" }: { contact: ApiContact; size?: "sm" | "md" }) {
  let tone: BadgeTone = "primary";
  let Icon = Bot;
  let label = "AI";

  if (contact.optedOut) {
    tone = "neutral";
    Icon = Ban;
    label = "Opted out";
  } else if (contact.needsHuman) {
    tone = "attention";
    Icon = Flame;
    label = "Needs you";
  } else if (contact.needsReview) {
    tone = "attention";
    Icon = AlertTriangle;
    label = "Needs review";
  } else if (contact.aiPaused) {
    tone = "neutral";
    Icon = User;
    label = "Human";
  }

  const iconSize = size === "sm" ? "size-3" : "size-3.5";
  return (
    <Badge tone={tone} size={size}>
      <Icon className={iconSize} strokeWidth={2.25} />
      {label}
    </Badge>
  );
}
