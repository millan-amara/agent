"use client";

import { useState } from "react";
import { api, type ContactDetail } from "@/lib/api";

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
    <div className="flex h-full flex-col gap-4 overflow-y-auto bg-white p-4">
      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Lead</h3>
        <dl className="space-y-1.5 text-sm">
          <Row label="Name" value={detail.name ?? "—"} />
          <Row label="Phone" value={detail.phone} mono />
          <Row label="Source" value={detail.source ?? "—"} />
          <Row
            label="Since"
            value={new Date(detail.createdAt).toLocaleDateString([], {
              day: "numeric",
              month: "short",
            })}
          />
        </dl>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Stage</h3>
        <select
          value={detail.stage}
          onChange={(e) => void api.setStage(detail.id, e.target.value).then(onChanged)}
          className="w-full rounded-card border border-line bg-white px-2 py-1.5 text-sm outline-none focus:border-primary"
        >
          {stages.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </section>

      <section>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Captured by AI
        </h3>
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Appointments
          </h3>
          <ul className="space-y-2">
            {detail.appointments!.map((a) => (
              <li key={a.id} className="rounded-card border border-line p-2 text-sm">
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
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Payments
          </h3>
          <ul className="space-y-1.5">
            {detail.invoices!.map((i) => (
              <li key={i.id} className="space-y-1.5 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-muted">{i.description}</span>
                  <span className="tnum shrink-0 font-medium">
                    KES {i.amountKes.toLocaleString()}
                  </span>
                  <span
                    className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${
                      i.status === "paid"
                        ? "bg-primary-soft text-primary-dark"
                        : i.status === "pending_approval"
                          ? "bg-attentionSoft text-attention"
                          : "border border-line bg-canvas text-muted"
                    }`}
                  >
                    {i.status === "pending_approval" ? "needs approval" : i.status}
                  </span>
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
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Follow-ups
        </h3>
        {detail.followUps.length === 0 ? (
          <p className="text-sm text-muted">None scheduled.</p>
        ) : (
          <ul className="space-y-2">
            {detail.followUps.map((f) => (
              <li key={f.id} className="rounded-card border border-line p-2 text-sm">
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

      <section className="mt-auto rounded-card border border-line bg-canvas p-2 text-xs text-muted">
        {detail.windowOpen
          ? "Messaging window open — free-form replies allowed."
          : "Window closed — only template messages until the customer writes again."}
      </section>
    </div>
  );
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
      <div className="space-y-1 rounded-card border border-line bg-canvas p-2">
        <p className="text-[11px] text-muted">
          Window closed — link ready, send it once the customer writes back:
        </p>
        <div className="flex items-center gap-1.5">
          <input
            readOnly
            value={manualLink}
            onFocus={(e) => e.currentTarget.select()}
            className="min-w-0 flex-1 truncate rounded border border-line bg-white px-1.5 py-1 text-[11px]"
          />
          <button
            onClick={() => void navigator.clipboard?.writeText(manualLink)}
            className="shrink-0 rounded border border-line px-2 py-1 text-[11px] font-medium hover:bg-white"
          >
            Copy
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <button
        disabled={busy}
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
        className="w-full rounded-card bg-primary px-2 py-1.5 text-xs font-medium text-white hover:bg-primary-dark disabled:opacity-50"
      >
        {busy ? "Sending…" : "Approve & send payment link"}
      </button>
      {error && <p className="text-[11px] text-attention">{error}</p>}
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
