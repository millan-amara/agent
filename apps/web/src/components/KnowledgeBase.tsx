"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, Upload, Trash2 } from "lucide-react";
import { api, type KbDoc } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input, Textarea } from "@/components/ui/Field";

export function KnowledgeBase() {
  const [docs, setDocs] = useState<KbDoc[]>([]);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () => api.kbDocs().then(setDocs).catch(() => {});
  useEffect(() => {
    refresh();
  }, []);

  const addText = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.addKbText({ title: title.trim(), content });
      setMsg(`Added “${title.trim()}” (${res.chunks} chunks indexed).`);
      setTitle("");
      setContent("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      const res = await api.uploadKb(file);
      setMsg(`Uploaded ${file.name} (${res.chunks} chunks indexed).`);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  const remove = async (id: string) => {
    try {
      await api.deleteKb(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted">
        Upload docs and FAQs so the AI can answer from your own material — not just the profile
        form. It searches these when a question isn&apos;t covered by your instructions.
      </p>
      {msg && <p className="rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-700">{msg}</p>}
      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      {docs.length > 0 && (
        <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
          {docs.map((d) => (
            <li key={d.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
              <span className="grid size-8 shrink-0 place-items-center rounded-card bg-primary-soft text-primary-700">
                <FileText className="size-4" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate font-medium">{d.title}</div>
                <div className="text-xs text-muted">
                  {d.chunks} chunks · {d.source}
                </div>
              </div>
              <button
                onClick={() => void remove(d.id)}
                className="grid size-8 shrink-0 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={addText} className="space-y-2">
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title (e.g. Pricing & packages)"
        />
        <Textarea
          value={content}
          onChange={(e) => setContent(e.target.value)}
          rows={5}
          className="resize-y"
          placeholder="Paste FAQ answers, policies, product details…"
        />
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={busy || !title.trim() || !content.trim()}>
            {busy ? "Indexing…" : "Add to knowledge base"}
          </Button>
          <span className="text-xs text-muted">or</span>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-card border border-line bg-surface px-4 py-2 text-sm font-medium hover:bg-canvas">
            <Upload className="size-4" /> Upload .txt / .md
            <input
              ref={fileRef}
              type="file"
              accept=".txt,.md,.markdown"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void upload(f);
              }}
            />
          </label>
        </div>
      </form>
    </div>
  );
}
