"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Conversation, type TenantInfo } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { StatePill } from "@/components/StatePill";

export default function PipelinePage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [contacts, setContacts] = useState<Conversation[]>([]);
  const [dragId, setDragId] = useState<string | null>(null);
  const [overStage, setOverStage] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api.conversations().then(setContacts).catch(() => {});
  }, []);

  useEffect(() => {
    api.tenant().then(setTenant).catch(() => {});
    refresh();
  }, [refresh]);

  useLive(useCallback(() => refresh(), [refresh]));

  const drop = async (stage: string) => {
    setOverStage(null);
    if (!dragId) return;
    const id = dragId;
    setDragId(null);
    // Optimistic move; live event corrects if the server disagrees.
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, stage } : c)));
    try {
      await api.setStage(id, stage);
    } finally {
      refresh();
    }
  };

  if (!tenant) return <p className="p-6 text-sm text-muted">Loading…</p>;

  return (
    <div className="h-full overflow-x-auto overflow-y-hidden p-4">
      <div className="flex h-full min-w-max gap-3">
        {tenant.stages.map((stage) => {
          const cards = contacts.filter((c) => c.stage === stage);
          return (
            <div
              key={stage}
              onDragOver={(e) => {
                e.preventDefault();
                setOverStage(stage);
              }}
              onDragLeave={() => setOverStage((s) => (s === stage ? null : s))}
              onDrop={() => void drop(stage)}
              className={`flex h-full w-64 shrink-0 flex-col rounded-card border bg-white ${
                overStage === stage ? "border-primary" : "border-line"
              }`}
            >
              <div className="flex items-center justify-between border-b border-line px-3 py-2">
                <span className="text-sm font-semibold">{stage}</span>
                <span className="tnum rounded-full bg-canvas px-2 py-0.5 text-xs text-muted">
                  {cards.length}
                </span>
              </div>
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
                {cards.map((c) => (
                  <div
                    key={c.id}
                    draggable
                    onDragStart={() => setDragId(c.id)}
                    onDragEnd={() => setDragId(null)}
                    className="cursor-grab rounded-card border border-line bg-white p-2.5 shadow-sm active:cursor-grabbing"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{c.name ?? c.phone}</span>
                      <StatePill contact={c} />
                    </div>
                    {c.lastMessage && (
                      <p className="mt-1 truncate text-xs text-muted">{c.lastMessage.text}</p>
                    )}
                    <div className="mt-1 flex items-center justify-between">
                      <span className="text-[10px] text-muted">{c.source ?? ""}</span>
                      <span className="text-[10px] text-muted">
                        {c.lastMessage ? timeAgo(c.lastMessage.createdAt) : ""}
                      </span>
                    </div>
                  </div>
                ))}
                {cards.length === 0 && (
                  <p className="px-1 py-3 text-center text-xs text-muted">Drop leads here</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function timeAgo(iso: string): string {
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "now";
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}
