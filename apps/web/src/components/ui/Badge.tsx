import type { HTMLAttributes } from "react";

export type BadgeTone = "neutral" | "primary" | "attention" | "accent" | "success" | "danger";

const tones: Record<BadgeTone, string> = {
  neutral: "border border-line bg-canvas text-muted",
  primary: "bg-primary-soft text-primary-700",
  attention: "bg-attentionSoft text-attention",
  accent: "bg-accent-soft text-accent-deep",
  success: "bg-success-soft text-success",
  danger: "bg-danger-soft text-danger",
};

export function Badge({
  tone = "neutral",
  size = "sm",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: BadgeTone; size?: "sm" | "md" }) {
  const sz = size === "sm" ? "px-2 py-0.5 text-xs" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-medium ${sz} ${tones[tone]} ${className}`}
      {...props}
    />
  );
}
