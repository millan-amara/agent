"use client";

import { useState } from "react";
import { Copy, Lock, Unlock } from "lucide-react";
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
  const fields = Object.entries(detail.fields);

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

      <section>
        <CardLabel className="mb-2">Captured by AI</CardLabel>
        {fields.length === 0 ? (
          <p className="text-sm text-muted">Nothing yet — fills in as the conversation goes.</p>
        ) : (
          <dl className="space-y-1.5 text-sm">
            {fields.map(([k, v]) => (
              <Row key={k} label={k} value={String(v)} />
            ))}
          </dl>
        )}
      </section>

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
