"use client";

import { useCallback, useEffect, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { api, type MessageTemplate } from "@/lib/api";
import { Badge, type BadgeTone } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Textarea, Select } from "@/components/ui/Field";

function statusTone(status: string): BadgeTone {
  if (status === "approved") return "success";
  if (status === "pending") return "attention";
  if (status === "rejected") return "danger";
  return "neutral";
}

/**
 * Template messages = the only way to reach customers outside the 24h window.
 * Create → submit to Meta → status flows back via webhook (or manual refresh).
 */
export function TemplateManager({ wabaConfigured }: { wabaConfigured: boolean }) {
  const [templates, setTemplates] = useState<MessageTemplate[]>([]);
  const [showForm, setShowForm] = useState(false);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("UTILITY");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.messageTemplates().then(setTemplates).catch(() => {});
  }, []);
  useEffect(() => refresh(), [refresh]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.createTemplate({ name, category, language: "en", body });
      setName("");
      setBody("");
      setShowForm(false);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const submit = async (id: string) => {
    setError(null);
    try {
      await api.submitTemplate(id);
      setNotice("Submitted to Meta — approval usually takes minutes to a few hours.");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const sync = async () => {
    setError(null);
    const r = await api.syncTemplates().catch(() => null);
    setNotice(r ? `Statuses refreshed (${r.updated} updated).` : "Couldn't reach Meta.");
    refresh();
  };

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="text-xs text-muted">
          Needed to message customers more than 24h after their last reply.
        </p>
        <div className="flex shrink-0 gap-2">
          <Button variant="ghost" size="sm" onClick={() => void sync()}>
            <RefreshCw className="size-3.5" /> Refresh
          </Button>
          <Button variant="secondary" size="sm" onClick={() => setShowForm((s) => !s)}>
            {showForm ? "Cancel" : <><Plus className="size-3.5" /> New template</>}
          </Button>
        </div>
      </div>

      {error && <p className="mb-2 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}
      {notice && (
        <p className="mb-2 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-700">{notice}</p>
      )}
      {!wabaConfigured && (
        <p className="mb-2 rounded-card border border-line bg-canvas px-3 py-2 text-xs text-muted">
          Add your WhatsApp Business Account ID in the connection section above to enable
          submission to Meta.
        </p>
      )}

      {showForm && (
        <form onSubmit={create} className="mb-4 space-y-3 rounded-card border border-line bg-canvas/50 p-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Name (lowercase_underscores)</span>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="followup_check_in"
              />
            </label>
            <label className="block text-xs">
              <span className="mb-1 block font-medium">Category</span>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="UTILITY">Utility (about their inquiry — easier approval)</option>
                <option value="MARKETING">Marketing (promotional)</option>
              </Select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">
              Message — use {"{{1}}"} for the customer&apos;s name, {"{{2}}"} for your business name
            </span>
            <Textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{1}}, this is {{2}} following up on your inquiry. Are you still interested? Reply and we'll pick up where we left off."}
            />
          </label>
          <Button type="submit" size="sm" disabled={busy || !name || !body.trim()}>
            {busy ? "Saving…" : "Save draft"}
          </Button>
        </form>
      )}

      {templates.length === 0 && !showForm ? (
        <p className="rounded-card border border-dashed border-line bg-canvas px-3 py-6 text-center text-xs text-muted">
          No templates yet. Create one so follow-ups can reach customers after the 24h window.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-card border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="tnum text-sm font-medium">{t.name}</span>
                <div className="flex items-center gap-2">
                  <Badge tone={statusTone(t.status)}>{t.status}</Badge>
                  {(t.status === "draft" || t.status === "rejected") && (
                    <>
                      <Button
                        size="sm"
                        onClick={() => void submit(t.id)}
                        disabled={!wabaConfigured}
                      >
                        Submit to Meta
                      </Button>
                      <button
                        onClick={() => void api.deleteTemplate(t.id).then(refresh)}
                        className="text-xs text-muted hover:text-danger"
                      >
                        Delete
                      </button>
                    </>
                  )}
                </div>
              </div>
              <p className="mt-1.5 whitespace-pre-wrap text-xs text-muted">{t.body}</p>
              {t.rejectionReason && (
                <p className="mt-1 text-xs text-danger">Meta: {t.rejectionReason}</p>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
