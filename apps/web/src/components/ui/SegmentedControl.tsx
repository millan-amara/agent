import type { ReactNode } from "react";

export type SegmentOption<T extends string> = { value: T; label: ReactNode; count?: number };

/** Track-and-thumb segmented control. Replaces ad-hoc pill filter rows. */
export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  className = "",
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  className?: string;
}) {
  return (
    <div className={`inline-flex flex-wrap gap-1 rounded-card bg-canvas p-1 ${className}`}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            onClick={() => onChange(o.value)}
            className={`rounded-[7px] px-3 py-1.5 text-xs font-medium transition-colors ${
              active ? "bg-surface text-ink shadow-card" : "text-muted hover:text-ink"
            }`}
          >
            {o.label}
            {o.count !== undefined && <span className="tnum ml-1.5 opacity-60">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}
