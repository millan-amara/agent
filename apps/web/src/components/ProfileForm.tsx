"use client";

import { useEffect, useState } from "react";
import {
  Store,
  Tags,
  MessagesSquare,
  ShieldCheck,
  Plus,
  X,
  Sparkles,
  Loader2,
  CheckCircle2,
  Info,
  type LucideIcon,
} from "lucide-react";
import { api, type BusinessProfile } from "@/lib/api";
import { parseFixedAmountKes, formatKes } from "@/lib/price";
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
  paymentsEnabled = false,
  bookingAutomated = false,
  onDirtyChange,
}: {
  initial: BusinessProfile;
  saving: boolean;
  submitLabel: string;
  /** Resolves true once the profile is actually persisted (resets the dirty flag). */
  onSubmit: (profile: BusinessProfile) => Promise<boolean>;
  /** Paystack connected — the AI can raise invoices, so prices must be exact. */
  paymentsEnabled?: boolean;
  /** Calendar booking is on — the AI books itself, so booking notes are context only. */
  bookingAutomated?: boolean;
  onDirtyChange?: (dirty: boolean) => void;
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
  // What the last successful save looked like. Compared against the live form to
  // decide whether there's unsaved work worth warning about.
  const [baseline, setBaseline] = useState(() => snapshot(initial, (initial.neverSay ?? []).join("\n")));

  const dirty = snapshot(p, neverSayText) !== baseline;

  useEffect(() => onDirtyChange?.(dirty), [dirty, onDirtyChange]);

  // Catch tab-close / reload with unsaved edits. (Switching settings tabs is
  // guarded separately by the parent, via onDirtyChange.)
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

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

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Drop half-filled rows: a blank service renders as a bare "- " bullet in the
    // system prompt, and a one-sided FAQ teaches the AI nothing. (The server
    // re-applies this — this pass just keeps what we send honest.)
    const cleaned: BusinessProfile = {
      ...p,
      services: (p.services ?? []).filter((s) => s.name.trim()),
      faqs: (p.faqs ?? []).filter((f) => f.q.trim() && f.a.trim()),
      neverSay: neverSayText
        .split("\n")
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const ok = await onSubmit(cleaned);
    if (ok) {
      setP(cleaned);
      setNeverSayText(cleaned.neverSay!.join("\n"));
      setBaseline(snapshot(cleaned, cleaned.neverSay!.join("\n")));
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-7">
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
            maxLength={4000}
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
              maxLength={300}
              placeholder="Mon–Fri 8am–6pm, Sat 9am–1pm"
            />
          </Field>
          <Field
            label={bookingAutomated ? "Anything else about bookings?" : "How do bookings work?"}
            hint={
              bookingAutomated
                ? "Azayon books into your calendar itself. Use this for extra context only — e.g. “arrive 10 minutes early”."
                : "How a booking request should be handled."
            }
          >
            <Input
              value={p.bookingInfo ?? ""}
              onChange={(e) => set("bookingInfo", e.target.value)}
              maxLength={500}
              placeholder={
                bookingAutomated
                  ? "Arrive 10 minutes early; bring any previous scans"
                  : "Collect name + preferred time; front desk confirms"
              }
            />
          </Field>
        </div>
      </Section>

      <Section
        icon={Tags}
        title="Services & prices"
        description={
          paymentsEnabled
            ? "The AI quotes and charges only from this list — never anything else."
            : "The AI only ever quotes prices from this list — nothing else."
        }
      >
        <ListEditor
          rows={(p.services ?? []).map((s) => [s.name, s.price ?? ""])}
          placeholders={["Service", "Price (e.g. KES 3,500)"]}
          labels={["Service name", "Service price"]}
          addLabel="Add a service"
          onChange={(rows) =>
            set(
              "services",
              rows.map(([name, price]) => ({ name: name ?? "", price: price || undefined })),
            )
          }
          // Prices are free text, but create_invoice needs one exact number. Show the
          // owner which of their prices the AI can actually charge, and which it will
          // hand to a human — before a customer finds out the hard way.
          rowHint={paymentsEnabled ? servicePriceHint : undefined}
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
          labels={["Question", "Answer"]}
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
              maxLength={300}
              placeholder="Warm, reassuring, professional"
            />
          </Field>
          <Field label="Languages">
            <Input
              value={p.languages ?? ""}
              onChange={(e) => set("languages", e.target.value)}
              maxLength={300}
              placeholder="Reply in the customer's language — English & Swahili"
            />
          </Field>
        </div>
        <Field
          label="Things the AI must never do"
          hint="One per line. Rules specific to your business — sticking to your price list and never promising outcomes are already built in."
        >
          <Textarea
            rows={3}
            value={neverSayText}
            onChange={(e) => setNeverSayText(e.target.value)}
            placeholder={"Don't discuss our supplier names\nNever agree to same-day home visits"}
          />
        </Field>
      </Section>

      <div className="flex items-center gap-3">
        <Button type="submit" size="lg" disabled={saving}>
          {saving ? "Saving…" : submitLabel}
        </Button>
        {dirty && !saving && <span className="text-xs text-muted">Unsaved changes</span>}
      </div>
    </form>
  );
}

/** Stable string form of the whole profile, for dirty comparison. */
function snapshot(p: BusinessProfile, neverSayText: string): string {
  return JSON.stringify({
    description: p.description ?? "",
    businessHours: p.businessHours ?? "",
    bookingInfo: p.bookingInfo ?? "",
    tone: p.tone ?? "",
    languages: p.languages ?? "",
    // Compare only filled rows — adding an empty row isn't a real change.
    services: (p.services ?? [])
      .filter((s) => s.name.trim())
      .map((s) => [s.name, s.price ?? ""]),
    faqs: (p.faqs ?? []).filter((f) => f.q.trim() && f.a.trim()).map((f) => [f.q, f.a]),
    neverSay: neverSayText
      .split("\n")
      .map((s) => s.trim())
      .filter(Boolean),
  });
}

/** Tells the owner whether the AI can charge this price, or must escalate it. */
function servicePriceHint([name, price]: string[]) {
  if (!name?.trim()) return null;
  const amount = parseFixedAmountKes(price);
  if (amount !== undefined) {
    return (
      <span className="flex items-center gap-1.5 text-xs text-success">
        <CheckCircle2 className="size-3.5 shrink-0" />
        The AI can charge {formatKes(amount)} for this.
      </span>
    );
  }
  return (
    <span className="flex items-center gap-1.5 text-xs text-muted">
      <Info className="size-3.5 shrink-0" />
      {price?.trim()
        ? "Not one fixed price — the AI will quote it but hand the payment to a person."
        : "No price set — the AI won't quote or charge for this."}
    </span>
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
  labels,
  addLabel,
  onChange,
  rowHint,
}: {
  rows: string[][];
  placeholders: [string, string];
  /** Accessible names — these inputs have no visible <label> of their own. */
  labels: [string, string];
  addLabel: string;
  onChange: (rows: string[][]) => void;
  rowHint?: (row: string[]) => React.ReactNode;
}) {
  const update = (i: number, j: number, value: string) => {
    const next = rows.map((r) => [...r]);
    next[i]![j] = value;
    onChange(next);
  };
  return (
    <div className="space-y-2">
      {rows.map((row, i) => (
        <div key={i} className="space-y-1">
          <div className="flex gap-2">
            <Input
              value={row[0] ?? ""}
              onChange={(e) => update(i, 0, e.target.value)}
              placeholder={placeholders[0]}
              aria-label={`${labels[0]} ${i + 1}`}
              maxLength={500}
              className="w-2/5"
            />
            <Input
              value={row[1] ?? ""}
              onChange={(e) => update(i, 1, e.target.value)}
              placeholder={placeholders[1]}
              aria-label={`${labels[1]} ${i + 1}`}
              maxLength={2000}
              className="flex-1"
            />
            <button
              type="button"
              onClick={() => onChange(rows.filter((_, k) => k !== i))}
              className="grid size-9 shrink-0 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
              aria-label={`Remove ${labels[0].toLowerCase()} ${i + 1}`}
            >
              <X className="size-4" />
            </button>
          </div>
          {rowHint && <div className="pl-1">{rowHint(row)}</div>}
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
