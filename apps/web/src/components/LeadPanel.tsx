"use client";

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

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-2">
      <dt className="capitalize text-muted">{label.replace(/_/g, " ")}</dt>
      <dd className={`text-right font-medium ${mono ? "tnum" : ""}`}>{value}</dd>
    </div>
  );
}
