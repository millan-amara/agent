import type { HTMLAttributes } from "react";

/** A surface that lifts gently off the canvas. Default for grouped content. */
export function Card({ className = "", ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={`rounded-card border border-line bg-surface shadow-card ${className}`}
      {...props}
    />
  );
}

/** Section eyebrow — small, uppercase, muted. The standard panel header. */
export function CardLabel({ className = "", ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      className={`text-xs font-semibold uppercase tracking-wide text-muted ${className}`}
      {...props}
    />
  );
}
