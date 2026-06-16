"use client";

import { useEffect, useState } from "react";
import { Megaphone } from "lucide-react";
import {
  api,
  type Broadcast,
  type BroadcastSegment,
  type MessageTemplate,
  type TenantInfo,
} from "@/lib/api";
import { Card } from "@/components/ui/Card";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";
import { PageHeader } from "@/components/ui/PageHeader";
import { SegmentedControl } from "@/components/ui/SegmentedControl";

function statusTone(status: string): BadgeTone {
  if (status === "sending") return "attention";
  if (status === "failed") return "danger";
  if (status === "done" || status === "completed" || status === "sent") return "success";
  return "neutral";
}

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
    <div className="mx-auto h-full w-full max-w-3xl space-y-5 overflow-y-auto p-4 md:p-8">
      <PageHeader
        title="Broadcasts"
        className="mb-0"
        subtitle="Send an approved template to a group of customers. Outside the 24-hour window only approved templates are allowed — opted-out customers are always skipped."
      />

      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <Card className="space-y-4 p-5">
        <label className="block text-sm">
          <span className="mb-1 block font-medium">Template</span>
          <Select
            value={templateId}
            onChange={(e) => setTemplateId(e.target.value)}
            className="max-w-md"
          >
            <option value="">Choose an approved template…</option>
            {approved.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </Select>
          {approved.length === 0 && (
            <span className="mt-1 block text-xs text-muted">
              No approved templates yet — create and submit one in Settings → WhatsApp.
            </span>
          )}
        </label>

        <div className="text-sm">
          <span className="mb-1 block font-medium">Audience</span>
          <SegmentedControl
            value={segmentType}
            onChange={setSegmentType}
            options={[
              { value: "all", label: "Everyone" },
              { value: "stage", label: "By stage" },
              { value: "source", label: "By source" },
            ]}
          />
          {segmentType === "stage" && (
            <Select value={stage} onChange={(e) => setStage(e.target.value)} className="mt-2 max-w-xs">
              <option value="">Pick a stage…</option>
              {tenant.stages.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </Select>
          )}
          {segmentType === "source" && (
            <Input
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="Exact source, e.g. ctwa:Back pain ad"
              className="mt-2 max-w-md"
            />
          )}
        </div>

        <div className="flex items-center gap-3 border-t border-line pt-4">
          <Button onClick={() => void send()} disabled={busy || !templateId || count === 0}>
            <Megaphone className="size-4" />
            {busy ? "Starting…" : "Send broadcast"}
          </Button>
          <span className="text-sm text-muted">
            {count === null ? "" : `${count} recipient${count === 1 ? "" : "s"}`}
          </span>
        </div>
      </Card>

      {broadcasts.length > 0 && (
        <Card className="p-5">
          <h2 className="mb-3 font-semibold">Recent broadcasts</h2>
          <ul className="divide-y divide-line">
            {broadcasts.map((b) => (
              <li key={b.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div className="min-w-0">
                  <div className="truncate font-medium">
                    {templates.find((t) => t.id === b.templateId)?.name ?? "Template"}
                  </div>
                  <div className="text-xs text-muted">{new Date(b.createdAt).toLocaleString()}</div>
                </div>
                <div className="flex shrink-0 flex-col items-end gap-1 text-right text-xs">
                  <Badge tone={statusTone(b.status)}>
                    <span className="capitalize">{b.status}</span>
                  </Badge>
                  <div className="tnum text-muted">
                    {b.sent}/{b.total} sent{b.failed ? ` · ${b.failed} failed` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
