import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

/** Calm, friendly empty state — icon medallion, title, one line, optional action. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className = "",
}: {
  icon: LucideIcon;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-col items-center gap-3 px-6 py-10 text-center ${className}`}>
      <div className="grid size-12 place-items-center rounded-full bg-primary-soft text-primary-700">
        <Icon className="size-6" strokeWidth={1.75} />
      </div>
      <p className="text-sm font-medium text-ink">{title}</p>
      {description && <p className="max-w-xs text-sm text-muted">{description}</p>}
      {action && <div className="mt-1">{action}</div>}
    </div>
  );
}
