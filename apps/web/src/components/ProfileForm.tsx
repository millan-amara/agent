"use client";

import { useState } from "react";
import {
  Store,
  Tags,
  MessagesSquare,
  ShieldCheck,
  Plus,
  X,
  Sparkles,
  Loader2,
  type LucideIcon,
} from "lucide-react";
import { api, type BusinessProfile } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";

/**
 * The guided prompt builder: structured fields that compile into the agent's
 * system prompt server-side. No raw "system prompt" textarea — plain language,
 * grouped as "teach your AI" sections.
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
  // The "never do" list is edited as raw multiline text so typing (blank lines,
  // trailing spaces) never fights the user. It's split into a list on submit.
  const [neverSayText, setNeverSayText] = useState((initial.neverSay ?? []).join("\n"));
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const set = <K extends keyof BusinessProfile>(key: K, value: BusinessProfile[K]) =>
    setP((prev) => ({ ...prev, [key]: value }));

  const draft = async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const { description } = await api.draftProfile(p.description ?? "");
      if (description) set("description", description);
    } catch (err) {
      setDraftError((err as Error).message || "Couldn't draft right now — try again.");
    } finally {
      setDrafting(false);
    }
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...p,
          neverSay: neverSayText
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean),
        });
      }}
      className="space-y-7"
    >
      <Section
        icon={Store}
        title="The basics"
        description="What you do and how you operate — the AI's foundation."
      >
        <Field
          label="Tell Azayon about your business"
          hint="What you do, who for, where. The AI uses this to answer customers."
          action={
            <button
              type="button"
              onClick={() => void draft()}
              disabled={drafting}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-card border border-line px-2.5 py-1 text-xs font-medium text-primary-700 transition-colors hover:bg-primary-soft disabled:opacity-50"
            >
              {drafting ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Sparkles className="size-3.5" />
              )}
              {drafting ? "Drafting…" : "Draft with AI"}
            </button>
          }
        >
          <Textarea
            required
            rows={4}
            value={p.description}
            onChange={(e) => set("description", e.target.value)}
            placeholder="e.g. We're a physiotherapy clinic in Westlands helping people recover from injury and pain. Or jot a few words and tap Draft with AI."
          />
          {draftError && <p className="mt-1 text-xs text-danger">{draftError}</p>}
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business hours">
            <Input
              value={p.businessHours ?? ""}
              onChange={(e) => set("businessHours", e.target.value)}
              placeholder="Mon–Fri 8am–6pm, Sat 9am–1pm"
            />
          </Field>
          <Field label="How do bookings work?">
            <Input
              value={p.bookingInfo ?? ""}
              onChange={(e) => set("bookingInfo", e.target.value)}
              placeholder="Collect name + preferred time; front desk confirms"
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={Tags}
        title="Services & prices"
        description="The AI only ever quotes prices from this list — nothing else."
      >
        <ListEditor
          rows={(p.services ?? []).map((s) => [s.name, s.price ?? ""])}
          placeholders={["Service", "Price (e.g. KES 3,500)"]}
          addLabel="Add a service"
          onChange={(rows) =>
            set(
              "services",
              rows.map(([name, price]) => ({ name: name ?? "", price: price || undefined })),
            )
          }
        />
      </Section>

      <Section
        icon={MessagesSquare}
        title="Common questions"
        description="Answer these once and the AI handles them forever."
      >
        <ListEditor
          rows={(p.faqs ?? []).map((f) => [f.q, f.a])}
          placeholders={["Question", "Answer"]}
          addLabel="Add a question"
          onChange={(rows) => set("faqs", rows.map(([q, a]) => ({ q: q ?? "", a: a ?? "" })))}
        />
      </Section>

      <Section
        icon={ShieldCheck}
        title="Voice & guardrails"
        description="How replies should sound, and the lines the AI must never cross."
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tone" hint="How should replies sound?">
            <Input
              value={p.tone ?? ""}
              onChange={(e) => set("tone", e.target.value)}
              placeholder="Warm, reassuring, professional"
            />
          </Field>
          <Field label="Languages">
            <Input
              value={p.languages ?? ""}
              onChange={(e) => set("languages", e.target.value)}
              placeholder="Reply in the customer's language — English & Swahili"
            />
          </Field>
        </div>
        <Field label="Things the AI must never do" hint="One per line.">
          <Textarea
            rows={3}
            value={neverSayText}
            onChange={(e) => setNeverSayText(e.target.value)}
            placeholder={"Quote prices not in the list\nPromise medical outcomes"}
          />
        </Field>
      </Section>

      <Button type="submit" size="lg" disabled={saving}>
        {saving ? "Saving…" : submitLabel}
      </Button>
    </form>
  );
}

function Section({
  icon: Icon,
  title,
  description,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-3 flex items-start gap-3">
        <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-700">
          <Icon className="size-4" strokeWidth={2} />
        </span>
        <div>
          <h3 className="text-sm font-semibold text-ink">{title}</h3>
          <p className="text-sm text-muted">{description}</p>
        </div>
      </div>
      <div className="space-y-4 sm:pl-11">{children}</div>
    </section>
  );
}

function Field({
  label,
  hint,
  action,
  children,
}: {
  label: string;
  hint?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="block">
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-ink">{label}</span>
        {action}
      </div>
      {hint && <span className="-mt-0.5 mb-1.5 block text-xs text-muted">{hint}</span>}
      {children}
    </div>
  );
}

function ListEditor({
  rows,
  placeholders,
  addLabel,
  onChange,
}: {
  rows: string[][];
  placeholders: [string, string];
  addLabel: string;
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
          <Input
            value={row[0] ?? ""}
            onChange={(e) => update(i, 0, e.target.value)}
            placeholder={placeholders[0]}
            className="w-2/5"
          />
          <Input
            value={row[1] ?? ""}
            onChange={(e) => update(i, 1, e.target.value)}
            placeholder={placeholders[1]}
            className="flex-1"
          />
          <button
            type="button"
            onClick={() => onChange(rows.filter((_, k) => k !== i))}
            className="grid size-9 shrink-0 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
            aria-label="Remove"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={() => onChange([...rows, ["", ""]])}
        className="inline-flex items-center gap-1.5 rounded-card border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary-700"
      >
        <Plus className="size-3.5" />
        {addLabel}
      </button>
    </div>
  );
}
