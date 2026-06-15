"use client";

import { useEffect, useState } from "react";
import {
  api,
  type Broadcast,
  type BroadcastSegment,
  type MessageTemplate,
  type TenantInfo,
} from "@/lib/api";

export default function BroadcastsPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [broadcasts, setBroadcasts] = useState<Broadcast[]>([]);
  const [templateId, setTemplateId] = useState("");
  const [segmentType, setSegmentType] = useState<"all" | "stage" | "source">("all");
  const [stage, setStage] = useState("");
  const [source, setSource] = useState("");
  const [count, setCount] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const approved = templates.filter((t) => t.status === "approved");

  const segment = (): BroadcastSegment =>
    segmentType === "stage"
      ? { stage }
      : segmentType === "source"
        ? { source }
        : { all: true };

  const refresh = () => api.broadcasts().then(setBroadcasts).catch(() => {});
  useEffect(() => {
    api.tenant().then(setTenant).catch(() => {});
    api.messageTemplates().then(setTemplates).catch(() => {});
    refresh();
  }, []);

  // Live progress while anything is sending.
  useEffect(() => {
    if (!broadcasts.some((b) => b.status === "sending")) return;
    const t = setInterval(refresh, 2000);
    return () => clearInterval(t);
  }, [broadcasts]);

  useEffect(() => {
    api
      .previewBroadcast(segment())
      .then((r) => setCount(r.count))
      .catch(() => setCount(null));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [segmentType, stage, source]);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.createBroadcast({ templateId, segment: segment() });
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  if (!tenant) return <p className="p-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="mx-auto h-full w-full max-w-3xl space-y-4 overflow-y-auto p-4 md:p-6">
      <h1 className="text-lg font-semibold">Broadcasts</h1>
      <p className="text-xs text-muted">
        Send an approved template to a group of customers. Outside the 24-hour window only approved
        templates are allowed — opted-out customers are always skipped.
      </p>

      {error && <p className="rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}

      <section className="space-y-3 rounded-card border border-line bg-white p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Template</span>
          <select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="w-full max-w-md rounded-card border border-line bg-white px-3 py-2 outline-none focus:border-primary"
          >
            <option value="">Choose an approved template…</option>
            {approved.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          {approved.length === 0 && (
            <span className="mt-1 block text-xs text-muted">
              No approved templates yet — create and submit one in Settings → WhatsApp.
            </span>
          )}
        </label>

        <div className="text-sm">
          <span className="mb-1 block font-medium">Audience</span>
          <div className="flex flex-wrap gap-2">
            {(["all", "stage", "source"] as const).map((s) => (
              <button
                key={s}
                onClick={() => setSegmentType(s)}
                className={`rounded-full px-3 py-1 text-xs font-medium ${
                  segmentType === s
                    ? "bg-primary-dark text-white"
                    : "border border-line bg-white text-muted"
                }`}
              >
                {s === "all" ? "Everyone" : s === "stage" ? "By stage" : "By source"}
              </button>
            ))}
          </div>
          {segmentType === "stage" && (
            <select
              value={stage}
              onChange={(e) => setStage(e.target.value)}
              className="mt-2 rounded-card border border-line bg-white px-3 py-2 outline-none focus:border-primary"
            >
              <option value="">Pick a stage…</option>
              {tenant.stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          )}
          {segmentType === "source" && (
            <input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Exact source, e.g. ctwa:Back pain ad"
              className="mt-2 w-full max-w-md rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
            />
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => void send()}
            disabled={busy || !templateId || count === 0}
            className="rounded-card bg-primary-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Starting…" : "Send broadcast"}
          </button>
          <span className="text-sm text-muted">
            {count === null ? "" : `${count} recipient${count === 1 ? "" : "s"}`}
          </span>
        </div>
      </section>

      {broadcasts.length > 0 && (
        <section className="rounded-card border border-line bg-white p-5">
          <h2 className="mb-3 font-semibold">Recent broadcasts</h2>
          <ul className="divide-y divide-line">
            {broadcasts.map((b) => (
              <li key={b.id} className="flex items-center justify-between py-2 text-sm">
                <div>
                  <div className="font-medium">
                    {templates.find((t) => t.id === b.templateId)?.name ?? "Template"}
                  </div>
                  <div className="text-xs text-muted">
                    {new Date(b.createdAt).toLocaleString()}
                  </div>
                </div>
                <div className="text-right text-xs">
                  <div className="font-medium capitalize">{b.status}</div>
                  <div className="text-muted tnum">
                    {b.sent}/{b.total} sent{b.failed ? ` · ${b.failed} failed` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
