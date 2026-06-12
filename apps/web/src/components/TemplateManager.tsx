"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type MessageTemplate } from "@/lib/api";

function StatusChip({ t }: { t: MessageTemplate }) {
  const map: Record<string, string> = {
    draft: "border border-line bg-canvas text-muted",
    pending: "bg-attentionSoft text-attention",
    approved: "bg-primary-soft text-primary-dark",
    rejected: "bg-red-50 text-danger",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${map[t.status] ?? map.draft}`}>
      {t.status}
    </span>
  );
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
      <div className="mb-2 flex items-center justify-between">
        <p className="text-xs text-muted">
          Needed to message customers more than 24h after their last reply (e.g. follow-ups).
        </p>
        <div className="flex gap-2">
          <button onClick={() => void sync()} className="text-xs font-medium text-muted hover:text-ink">
            Refresh statuses
          </button>
          <button
            onClick={() => setShowForm((s) => !s)}
            className="rounded-card border border-line px-2.5 py-1 text-xs font-medium hover:bg-canvas"
          >
            {showForm ? "Cancel" : "+ New template"}
          </button>
        </div>
      </div>

      {error && <p className="mb-2 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</p>}
      {notice && (
        <p className="mb-2 rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-dark">{notice}</p>
      )}
      {!wabaConfigured && (
        <p className="mb-2 rounded-card border border-line bg-canvas px-3 py-2 text-xs text-muted">
          Add your WhatsApp Business Account ID in the connection section above to enable
          submission to Meta.
        </p>
      )}

      {showForm && (
        <form onSubmit={create} className="mb-3 space-y-2 rounded-card border border-line p-3">
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-xs">
              <span className="mb-1 block font-medium">Name (lowercase_underscores)</span>
              <input
                value={name}
                onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                placeholder="followup_check_in"
                className="w-full rounded-card border border-line px-2.5 py-1.5 outline-none focus:border-primary"
              />
            </label>
            <label className="text-xs">
              <span className="mb-1 block font-medium">Category</span>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full rounded-card border border-line bg-white px-2.5 py-1.5 outline-none focus:border-primary"
              >
                <option value="UTILITY">Utility (about their inquiry — easier approval)</option>
                <option value="MARKETING">Marketing (promotional)</option>
              </select>
            </label>
          </div>
          <label className="block text-xs">
            <span className="mb-1 block font-medium">
              Message — use {"{{1}}"} for the customer&apos;s name, {"{{2}}"} for your business name
            </span>
            <textarea
              rows={3}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={"Hi {{1}}, this is {{2}} following up on your inquiry. Are you still interested? Reply and we'll pick up where we left off."}
              className="w-full rounded-card border border-line px-2.5 py-1.5 outline-none focus:border-primary"
            />
          </label>
          <button
            disabled={busy || !name || !body.trim()}
            className="rounded-card bg-primary-dark px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
          >
            {busy ? "Saving…" : "Save draft"}
          </button>
        </form>
      )}

      {templates.length === 0 && !showForm ? (
        <p className="rounded-card border border-line bg-canvas px-3 py-4 text-center text-xs text-muted">
          No templates yet. Create one so follow-ups can reach customers after the 24h window.
        </p>
      ) : (
        <ul className="space-y-2">
          {templates.map((t) => (
            <li key={t.id} className="rounded-card border border-line p-3">
              <div className="flex items-center justify-between gap-2">
                <span className="tnum text-sm font-medium">{t.name}</span>
                <div className="flex items-center gap-2">
                  <StatusChip t={t} />
                  {(t.status === "draft" || t.status === "rejected") && (
                    <>
                      <button
                        onClick={() => void submit(t.id)}
                        disabled={!wabaConfigured}
                        className="rounded-card bg-primary-dark px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                      >
                        Submit to Meta
                      </button>
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
              <p className="mt-1 whitespace-pre-wrap text-xs text-muted">{t.body}</p>
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
