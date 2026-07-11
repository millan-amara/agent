"use client";

import { useState } from "react";
import { Copy, Lock, Pencil, Plus, Unlock, X } from "lucide-react";
import { api, type ContactDetail } from "@/lib/api";
import { StatePill } from "@/components/StatePill";
import { CardLabel } from "@/components/ui/Card";
import { Avatar } from "@/components/ui/Avatar";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";

export function LeadPanel({
  detail,
  stages,
  onChanged,
}: {
  detail: ContactDetail;
  stages: string[];
  onChanged: () => void;
}) {
  return (
    <div className="flex h-full flex-col gap-5 overflow-y-auto bg-surface p-4">
      {/* Customer identity card */}
      <section className="rounded-card border border-line bg-canvas/60 p-3">
        <div className="flex items-center gap-3">
          <Avatar name={detail.name} phone={detail.phone} size="lg" attention={detail.needsHuman} />
          <div className="min-w-0 flex-1">
            <div className="truncate font-semibold">{detail.name ?? detail.phone}</div>
            <div className="tnum text-xs text-muted">{detail.phone}</div>
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between gap-2">
          <StatePill contact={detail} size="md" />
          <span className="text-xs text-muted">
            since{" "}
            {new Date(detail.createdAt).toLocaleDateString([], { day: "numeric", month: "short" })}
          </span>
        </div>
        {detail.source && (
          <div className="mt-1.5 truncate text-xs text-muted">via {detail.source}</div>
        )}
      </section>

      <section>
        <CardLabel className="mb-2">Stage</CardLabel>
        <Select
          value={detail.stage}
          onChange={(e) => void api.setStage(detail.id, e.target.value).then(onChanged)}
        >
          {stages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </Select>
      </section>

      <DetailsSection detail={detail} onChanged={onChanged} />

      {(detail.appointments?.length ?? 0) > 0 && (
        <section>
          <CardLabel className="mb-2">Appointments</CardLabel>
          <ul className="space-y-2">
            {detail.appointments!.map((a) => (
              <li key={a.id} className="rounded-card border border-line p-2.5 text-sm">
                <div className="font-medium">
                  {new Date(a.startsAt).toLocaleString([], {
                    weekday: "short",
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                {a.note && <div className="text-xs text-muted">{a.note}</div>}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(detail.invoices?.length ?? 0) > 0 && (
        <section>
          <CardLabel className="mb-2">Payments</CardLabel>
          <ul className="space-y-2">
            {detail.invoices!.map((i) => (
              <li key={i.id} className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 flex-1 truncate text-muted">{i.description}</span>
                  <span className="tnum shrink-0 font-medium">
                    KES {i.amountKes.toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-2">
                  <Badge tone={invoiceTone(i.status)}>
                    {i.status === "pending_approval" ? "needs approval" : i.status}
                  </Badge>
                </div>
                {i.status === "pending_approval" && (
                  <ApproveInvoiceButton
                    contactId={detail.id}
                    invoiceId={i.id}
                    onApproved={onChanged}
                  />
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <CardLabel className="mb-2">Follow-ups</CardLabel>
        {detail.followUps.length === 0 ? (
          <p className="text-sm text-muted">None scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {detail.followUps.map((f) => (
              <li key={f.id} className="rounded-card border border-line p-2.5 text-sm">
                <div className="font-medium">
                  {new Date(f.dueAt).toLocaleString([], {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </div>
                <div className="text-xs text-muted">{f.note}</div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-auto flex items-start gap-2 rounded-card border border-line bg-canvas p-2.5 text-xs text-muted">
        {detail.windowOpen ? (
          <Unlock className="mt-0.5 size-3.5 shrink-0 text-success" />
        ) : (
          <Lock className="mt-0.5 size-3.5 shrink-0" />
        )}
        <span>
          {detail.windowOpen
            ? "Messaging window open — free-form replies allowed."
            : "Window closed — only template messages until the customer writes again."}
        </span>
      </section>
    </div>
  );
}

function invoiceTone(status: string): BadgeTone {
  if (status === "paid") return "success";
  if (status === "pending_approval") return "attention";
  return "neutral";
}

function ApproveInvoiceButton({
  contactId,
  invoiceId,
  onApproved,
}: {
  contactId: string;
  invoiceId: string;
  onApproved: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set when the 24h window was closed: the link is minted but couldn't be
  // pushed, so we show it for the owner to copy/send manually.
  const [manualLink, setManualLink] = useState<string | null>(null);

  if (manualLink) {
    return (
      <div className="space-y-1.5 rounded-card border border-line bg-canvas p-2.5">
        <p className="text-xs text-muted">
          Window closed — link ready, send it once the customer writes back:
        </p>
        <div className="flex items-center gap-1.5">
          <Input
            readOnly
            value={manualLink}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 px-2 py-1 text-xs"
          />
          <button
            onClick={() => void navigator.clipboard?.writeText(manualLink)}
            className="inline-flex shrink-0 items-center gap-1 rounded-card border border-line bg-surface px-2 py-1.5 text-xs font-medium hover:bg-canvas"
          >
            <Copy className="size-3" /> Copy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <Button
        size="sm"
        disabled={busy}
        className="w-full"
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            const res = await api.approveInvoice(contactId, invoiceId);
            if (!res.delivered && res.payUrl) {
              // Keep this component mounted so the link stays visible — a refresh
              // would flip the invoice to "pending" and unmount the button.
              setManualLink(res.payUrl);
            } else {
              onApproved();
            }
          } catch (err) {
            setError((err as Error).message);
            setBusy(false);
          }
        }}
      >
        {busy ? "Sending…" : "Approve & send payment link"}
      </Button>
      {error && <p className="text-xs text-attention">{error}</p>}
    </div>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="capitalize text-muted">{label.replace(/_/g, " ")}</dt>
      <dd className={`text-right font-medium ${mono ? "tnum" : ""}`}>{value}</dd>
    </div>
  );
}

// Mirrors the server caps (MAX_LEAD_* in agent/tools.ts), which apply equally to
// details the AI captures and details typed here.
const MAX_DETAILS = 30;
const MAX_KEY_LEN = 60;
const MAX_VALUE_LEN = 500;

type DetailRow = { key: number; k: string; v: string };

/**
 * The lead's details — captured by the AI during qualification, and editable by hand.
 * Read-only until you hit Edit, so a stray tap on a phone can't quietly rewrite a
 * lead. Saving sends the whole map (the API replaces rather than merges, which is
 * what lets a detail actually be deleted).
 */
function DetailsSection({ detail, onChanged }: { detail: ContactDetail; onChanged: () => void }) {
  const [editing, setEditing] = useState(false);
  const [rows, setRows] = useState<DetailRow[]>([]);
  const [nextKey, setNextKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entries = Object.entries(detail.fields);

  const startEditing = () => {
    // Values may be numbers/booleans from the AI; they edit (and re-save) as text,
    // which is how the prompt renders them anyway.
    setRows(entries.map(([k, v], i) => ({ key: i, k, v: String(v) })));
    setNextKey(entries.length);
    setError(null);
    setEditing(true);
  };

  const duplicate = (() => {
    const seen = new Set<string>();
    for (const r of rows) {
      const k = r.k.trim().toLowerCase();
      if (!k) continue;
      if (seen.has(k)) return r.k.trim();
      seen.add(k);
    }
    return null;
  })();

  const save = async () => {
    if (duplicate) return;
    setSaving(true);
    setError(null);
    const fields: Record<string, string> = {};
    for (const r of rows) {
      const k = r.k.trim();
      if (k) fields[k] = r.v.trim();
    }
    try {
      await api.setLeadFields(detail.id, fields);
      setEditing(false);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  if (!editing) {
    return (
      <section>
        <div className="mb-2 flex items-center justify-between gap-2">
          <CardLabel>Details</CardLabel>
          <button
            type="button"
            onClick={startEditing}
            className="inline-flex items-center gap-1 text-xs font-medium text-primary-700 hover:underline"
          >
            <Pencil className="size-3" />
            Edit
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="text-sm text-muted">
            Nothing yet — the AI fills this in as the conversation goes, or add it yourself.
          </p>
        ) : (
          <dl className="space-y-1.5 text-sm">
            {entries.map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
          </dl>
        )}
      </section>
    );
  }

  return (
    <section>
      <CardLabel className="mb-2">Details</CardLabel>

      {error && <p className="mb-2 rounded-card bg-danger-soft px-2.5 py-1.5 text-xs text-danger">{error}</p>}

      <div className="space-y-2">
        {rows.map((row, i) => (
          <div key={row.key} className="flex items-center gap-1.5">
            <Input
              value={row.k}
              maxLength={MAX_KEY_LEN}
              placeholder="Detail"
              aria-label={`Detail ${i + 1} name`}
              onChange={(e) =>
                setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, k: e.target.value } : r)))
              }
              className="w-2/5 px-2 py-1 text-xs"
            />
            <Input
              value={row.v}
              maxLength={MAX_VALUE_LEN}
              placeholder="Value"
              aria-label={`Detail ${i + 1} value`}
              onChange={(e) =>
                setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, v: e.target.value } : r)))
              }
              className="min-w-0 flex-1 px-2 py-1 text-xs"
            />
            <button
              type="button"
              aria-label={`Remove ${row.k || `detail ${i + 1}`}`}
              onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              className="grid size-7 shrink-0 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>

      <button
        type="button"
        disabled={rows.length >= MAX_DETAILS}
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, k: "", v: "" }]);
          setNextKey((k) => k + 1);
        }}
        className="mt-2 inline-flex items-center gap-1.5 rounded-card border border-dashed border-line px-2.5 py-1 text-xs font-medium text-muted hover:border-primary hover:text-primary-700 disabled:opacity-50"
      >
        <Plus className="size-3" />
        Add detail
      </button>

      {duplicate && (
        <p className="mt-2 text-xs text-danger">“{duplicate}” is used twice — names must be unique.</p>
      )}

      <div className="mt-3 flex items-center gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving || duplicate !== null}>
          {saving ? "Saving…" : "Save"}
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)} disabled={saving}>
          Cancel
        </Button>
      </div>
    </section>
  );
}
