import type { LucideIcon } from "lucide-react";
import { Card } from "./Card";

/** A single stat tile: optional icon, big number, label, optional hint. */
export function MetricCard({
  icon: Icon,
  label,
  value,
  hint,
  emphasis = false,
}: {
  icon?: LucideIcon;
  label: string;
  value: number | string;
  hint?: string;
  emphasis?: boolean;
}) {
  return (
    <Card className="p-4">
      {Icon && <Icon className="size-4 text-muted" strokeWidth={2} />}
      <div className={`tnum mt-2 text-2xl font-semibold ${emphasis ? "text-primary-700" : ""}`}>
        {value}
      </div>
      <div className="text-xs text-muted">{label}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </Card>
  );
}
