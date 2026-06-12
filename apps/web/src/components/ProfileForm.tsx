"use client";

import { useState } from "react";
import type { BusinessProfile } from "@/lib/api";

/**
 * The guided prompt builder: structured fields that compile into the agent's
 * system prompt server-side. No raw "system prompt" textarea — plain language.
 */
export function ProfileForm({
  initial,
  saving,
  submitLabel,
  onSubmit,
}: {
  initial: BusinessProfile;
  saving: boolean;
  submitLabel: string;
  onSubmit: (profile: BusinessProfile) => void;
}) {
  const [p, setP] = useState<BusinessProfile>({
    ...initial,
    services: initial.services ?? [],
    faqs: initial.faqs ?? [],
    neverSay: initial.neverSay ?? [],
  });

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) =>
    setP((prev) => ({ ...prev, [key]: value }));

  const input =
    "w-full rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary";

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit(p);
      }}
      className="space-y-5"
    >
      <Field
        label="Tell Azayon about your business"
        hint="What you do, who for, where. The AI uses this to answer customers."
      >
        <textarea
          required
          rows={3}
          value={p.description}
          onChange={(e) => set("description", e.target.value)}
          className={input}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Business hours">
          <input
            value={p.businessHours ?? ""}
            onChange={(e) => set("businessHours", e.target.value)}
            placeholder="Mon–Fri 8am–6pm, Sat 9am–1pm"
            className={input}
          />
        </Field>
        <Field label="How do bookings work?">
          <input
            value={p.bookingInfo ?? ""}
            onChange={(e) => set("bookingInfo", e.target.value)}
            placeholder="Collect name + preferred time; front desk confirms"
            className={input}
          />
        </Field>
      </div>

      <Field
        label="Services & prices"
        hint="The AI only ever quotes prices from this list — nothing else."
      >
        <ListEditor
          rows={(p.services ?? []).map((s) => [s.name, s.price ?? ""])}
          placeholders={["Service", "Price (e.g. KES 3,500)"]}
          onChange={(rows) =>
            set(
              "services",
              rows.map(([name, price]) => ({ name: name ?? "", price: price || undefined })),
            )
          }
        />
      </Field>

      <Field label="Common questions & answers">
        <ListEditor
          rows={(p.faqs ?? []).map((f) => [f.q, f.a])}
          placeholders={["Question", "Answer"]}
          onChange={(rows) => set("faqs", rows.map(([q, a]) => ({ q: q ?? "", a: a ?? "" })))}
        />
      </Field>

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tone" hint="How should replies sound?">
          <input
            value={p.tone ?? ""}
            onChange={(e) => set("tone", e.target.value)}
            placeholder="Warm, reassuring, professional"
            className={input}
          />
        </Field>
        <Field label="Languages">
          <input
            value={p.languages ?? ""}
            onChange={(e) => set("languages", e.target.value)}
            placeholder="Reply in the customer's language — English & Swahili"
            className={input}
          />
        </Field>
      </div>

      <Field label="Things the AI must never do" hint="One per line.">
        <textarea
          rows={3}
          value={(p.neverSay ?? []).join("\n")}
          onChange={(e) =>
            set(
              "neverSay",
              e.target.value.split("\n").map((s) => s.trim()).filter(Boolean),
            )
          }
          placeholder={"Quote prices not in the list\nPromise outcomes"}
          className={input}
        />
      </Field>

      <button
        disabled={saving}
        className="rounded-card bg-primary-dark px-5 py-2 text-sm font-semibold text-white disabled:opacity-50"
      >
        {saving ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {hint && <span className="mb-1.5 block text-xs text-muted">{hint}</span>}
      {children}
    </label>
  );
}

function ListEditor({
  rows,
  placeholders,
  onChange,
}: {
  rows: string[][];
  placeholders: [string, string];
  onChange: (rows: string[][]) => void;
}) {
  const update = (i: number, j: number, value: string) => {
    const next = rows.map((r) => [...r]);
    next[i]![j] = value;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="flex gap-2">
          <input
            value={row[0] ?? ""}
            onChange={(e) => update(i, 0, e.target.value)}
            placeholder={placeholders[0]}
            className="w-2/5 rounded-card border border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <input
            value={row[1] ?? ""}
            onChange={(e) => update(i, 1, e.target.value)}
            placeholder={placeholders[1]}
            className="flex-1 rounded-card border border-line px-3 py-1.5 text-sm outline-none focus:border-primary"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            className="px-2 text-muted hover:text-danger"
            aria-label="Remove"
          >
            ✕
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ["", ""]])}
        className="rounded-card border border-line px-3 py-1.5 text-xs font-medium text-muted hover:bg-canvas"
      >
        + Add
      </button>
    </div>
  );
}
