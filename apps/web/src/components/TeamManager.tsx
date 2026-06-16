"use client";

import { useEffect, useState } from "react";
import { Trash2 } from "lucide-react";
import { api, type AuditEntry, type TeamMember } from "@/lib/api";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input, Select } from "@/components/ui/Field";

export function TeamManager({ isOwner }: { isOwner: boolean }) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [audit, setAudit] = useState<AuditEntry[]>([]);
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("agent");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = () => {
    api.team().then(setMembers).catch(() => {});
    if (isOwner) api.auditLog().then(setAudit).catch(() => {});
  };
  useEffect(refresh, [isOwner]);

  const invite = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setError(null);
    try {
      await api.inviteMember({ email: email.trim(), role });
      setMsg(`Invite sent to ${email.trim()}.`);
      setEmail("");
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (id: string) => {
    setError(null);
    try {
      await api.removeMember(id);
      refresh();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="space-y-5">
      {msg && <p className="rounded-card bg-primary-soft px-3 py-2 text-xs text-primary-700">{msg}</p>}
      {error && <p className="rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</p>}

      <ul className="divide-y divide-line overflow-hidden rounded-card border border-line">
        {members.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2.5 text-sm">
            <Avatar name={m.name} phone={m.email} size="sm" />
            <div className="min-w-0 flex-1">
              <div className="truncate font-medium">{m.name ?? m.email}</div>
              <div className="truncate text-xs text-muted">{m.email}</div>
            </div>
            <Badge tone={m.role === "owner" ? "primary" : "neutral"}>{m.role}</Badge>
            {!m.emailVerified && <Badge tone="attention">invite pending</Badge>}
            {isOwner && (
              <button
                onClick={() => void remove(m.id)}
                className="grid size-8 shrink-0 place-items-center rounded-card text-muted hover:bg-danger-soft hover:text-danger"
                aria-label="Remove"
              >
                <Trash2 className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ul>

      {isOwner ? (
        <form onSubmit={invite} className="flex flex-wrap items-end gap-2">
          <label className="text-sm">
            <span className="mb-1 block font-medium">Invite a teammate</span>
            <Input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="name@business.co.ke"
              className="w-64"
            />
          </label>
          <Select value={role} onChange={(e) => setRole(e.target.value)} className="w-auto">
            <option value="agent">Agent</option>
            <option value="owner">Owner</option>
          </Select>
          <Button type="submit" disabled={!email.trim()}>
            Send invite
          </Button>
        </form>
      ) : (
        <p className="text-xs text-muted">Only the account owner can invite or remove teammates.</p>
      )}

      {isOwner && audit.length > 0 && (
        <div>
          <h3 className="mb-2 text-sm font-semibold">Recent activity</h3>
          <ul className="space-y-1 text-xs text-muted">
            {audit.slice(0, 30).map((a) => (
              <li key={a.id} className="flex justify-between gap-3">
                <span className="truncate">
                  <span className="font-medium text-ink">{a.actor}</span> · {a.action}
                  {a.detail ? ` — ${a.detail}` : ""}
                </span>
                <span className="shrink-0">{new Date(a.createdAt).toLocaleString()}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
