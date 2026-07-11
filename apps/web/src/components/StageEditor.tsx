"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus, X, Info } from "lucide-react";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Field";

/**
 * Editor for the tenant's pipeline stages: rename, reorder, add, remove.
 *
 * Each row remembers the name it was loaded with (`original`). That's what lets the
 * server tell a rename from a delete-plus-add — leads are stored against the stage
 * NAME, so without it a rename would strand every lead in the old name. New rows
 * carry `original: null`.
 *
 * Reordering is up/down buttons rather than drag: it works on touch, it's keyboard
 * accessible, and the order matters (the first stage is where new leads land and is
 * what the dashboard counts as "not yet qualified").
 */
type Row = { key: number; name: string; original: string | null };

const MIN_STAGES = 2;
const MAX_STAGES = 12;

export function StageEditor({
  stages,
  onSaved,
}: {
  stages: string[];
  onSaved: (stages: string[]) => void;
}) {
  const [rows, setRows] = useState<Row[]>(() =>
    stages.map((name, i) => ({ key: i, name, original: name })),
  );
  const [nextKey, setNextKey] = useState(stages.length);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const names = rows.map((r) => r.name.trim());
  const removed = stages.filter((s) => !rows.some((r) => r.original === s));
  const dirty =
    rows.length !== stages.length || rows.some((r, i) => r.original !== stages[i] || r.name.trim() !== stages[i]);

  const duplicate = (() => {
    const seen = new Set<string>();
    for (const n of names) {
      const k = n.toLowerCase();
      if (!k) continue;
      if (seen.has(k)) return n;
      seen.add(k);
    }
    return null;
  })();

  const invalid =
    names.some((n) => !n) || duplicate !== null || rows.length < MIN_STAGES || rows.length > MAX_STAGES;

  const move = (i: number, delta: number) => {
    const j = i + delta;
    if (j < 0 || j >= rows.length) return;
    const next = [...rows];
    [next[i], next[j]] = [next[j]!, next[i]!];
    setRows(next);
  };

  const save = async () => {
    setSaving(true);
    setError(null);
    setMsg(null);
    const finalStages = names;
    const renames = rows
      .filter((r) => r.original && r.name.trim() && r.original !== r.name.trim())
      .map((r) => ({ from: r.original!, to: r.name.trim() }));
    try {
      const res = await api.saveStages(finalStages, renames);
      // Re-baseline: every surviving row is now its own "original".
      setRows(res.stages.map((name, i) => ({ key: i, name, original: name })));
      setNextKey(res.stages.length);
      setMsg("Pipeline saved. Your AI uses the new stage names immediately.");
      onSaved(res.stages);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      {msg && (
        <p className="rounded-card bg-success-soft px-3 py-2 text-sm text-success">{msg}</p>
      )}
      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-sm text-danger">{error}</p>}

      <ul className="space-y-2">
        {rows.map((row, i) => (
          <li key={row.key} className="flex items-center gap-2">
            <span className="w-5 shrink-0 text-right text-xs tabular-nums text-muted">{i + 1}</span>
            <Input
              value={row.name}
              maxLength={40}
              aria-label={`Stage ${i + 1} name`}
              placeholder="Stage name"
              onChange={(e) =>
                setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, name: e.target.value } : r)))
              }
              className="flex-1"
            />
            <div className="flex shrink-0 items-center">
              <IconButton
                label={`Move ${row.name || `stage ${i + 1}`} up`}
                disabled={i === 0}
                onClick={() => move(i, -1)}
              >
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton
                label={`Move ${row.name || `stage ${i + 1}`} down`}
                disabled={i === rows.length - 1}
                onClick={() => move(i, 1)}
              >
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton
                label={`Remove ${row.name || `stage ${i + 1}`}`}
                disabled={rows.length <= MIN_STAGES}
                danger
                onClick={() => setRows((rs) => rs.filter((r) => r.key !== row.key))}
              >
                <X className="size-4" />
              </IconButton>
            </div>
          </li>
        ))}
      </ul>

      <button
        type="button"
        disabled={rows.length >= MAX_STAGES}
        onClick={() => {
          setRows((rs) => [...rs, { key: nextKey, name: "", original: null }]);
          setNextKey((k) => k + 1);
        }}
        className="inline-flex items-center gap-1.5 rounded-card border border-dashed border-line px-3 py-1.5 text-xs font-medium text-muted hover:border-primary hover:text-primary-700 disabled:opacity-50"
      >
        <Plus className="size-3.5" />
        Add a stage
      </button>

      {duplicate && (
        <p className="text-xs text-danger">“{duplicate}” is used twice — stage names must be unique.</p>
      )}
      {names.some((n) => !n) && <p className="text-xs text-danger">Stage names can't be empty.</p>}

      {/* Deleting a stage can't silently swallow the leads standing in it. */}
      {removed.length > 0 && names[0] && (
        <p className="flex items-start gap-1.5 rounded-card bg-warning-soft px-3 py-2 text-xs text-warning">
          <Info className="mt-px size-3.5 shrink-0" />
          <span>
            Any lead still in {removed.map((s) => `“${s}”`).join(", ")} will move to “{names[0]}” when
            you save.
          </span>
        </p>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button onClick={() => void save()} disabled={saving || invalid || !dirty}>
          {saving ? "Saving…" : "Save pipeline"}
        </Button>
        <span className="text-xs text-muted">
          New leads start in “{names[0] || "—"}”.
        </span>
      </div>
    </div>
  );
}

function IconButton({
  label,
  disabled,
  danger,
  onClick,
  children,
}: {
  label: string;
  disabled?: boolean;
  danger?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className={`grid size-9 shrink-0 place-items-center rounded-card text-muted transition-colors disabled:opacity-30 disabled:hover:bg-transparent ${
        danger ? "hover:bg-danger-soft hover:text-danger" : "hover:bg-canvas hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}
