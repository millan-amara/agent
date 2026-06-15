"use client";

import { useCallback, useEffect, useState } from "react";
import { api, type Conversation, type ContactDetail, type TenantInfo, type TeamMember } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { ChatPane } from "@/components/ChatPane";
import { LeadPanel } from "@/components/LeadPanel";
import { StatePill } from "@/components/StatePill";

export default function InboxPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [error, setError] = useState<string | null>(null);

  const memberLabel = (id?: string | null) => {
    if (!id) return null;
    const m = members.find((x) => x.id === id);
    if (!m) return null;
    return (m.name ?? m.email).slice(0, 2).toUpperCase();
  };

  const refreshList = useCallback(() => {
    api.conversations().then(setConversations).catch((e) => setError((e as Error).message));
  }, []);

  const refreshDetail = useCallback((id: string) => {
    api.contact(id).then(setDetail).catch(() => setDetail(null));
  }, []);

  useEffect(() => {
    api.tenant().then(setTenant).catch((e) => setError((e as Error).message));
    api.team().then(setMembers).catch(() => {});
    refreshList();
  }, [refreshList]);

  useEffect(() => {
    if (selectedId) refreshDetail(selectedId);
    else setDetail(null);
  }, [selectedId, refreshDetail]);

  useLive(
    useCallback(
      (event) => {
        refreshList();
        if (event.contactId === selectedId) refreshDetail(event.contactId);
      },
      [refreshList, refreshDetail, selectedId],
    ),
  );

  const onChanged = useCallback(() => {
    refreshList();
    if (selectedId) refreshDetail(selectedId);
  }, [refreshList, refreshDetail, selectedId]);

  if (error) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm text-muted">
        Can&apos;t reach the Azayon server ({error}). Is the API running on port 3001?
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside
        className={`w-full flex-col border-r border-line bg-white md:flex md:w-80 md:shrink-0 ${
          selectedId ? "hidden" : "flex"
        }`}
      >
        <div className="border-b border-line px-4 py-3">
          <h1 className="font-semibold">Conversations</h1>
          {conversations && (
            <p className="text-xs text-muted">
              {conversations.length} total
              {conversations.some((c) => c.needsHuman || c.needsReview) &&
                ` · ${conversations.filter((c) => c.needsHuman || c.needsReview).length} need you`}
            </p>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations === null ? (
            <p className="p-4 text-sm text-muted">Loading…</p>
          ) : conversations.length === 0 ? (
            <div className="p-6 text-center text-sm text-muted">
              No conversations yet. Message your WhatsApp number and it will appear here live.
            </div>
          ) : (
            conversations.map((c) => (
              <button
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`flex w-full flex-col gap-0.5 border-b border-line px-4 py-3 text-left hover:bg-canvas ${
                  selectedId === c.id ? "bg-primary-soft/50" : ""
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-medium">{c.name ?? c.phone}</span>
                  <StatePill contact={c} />
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-xs text-muted">
                    {c.lastMessage
                      ? `${c.lastMessage.author === "customer" ? "" : c.lastMessage.author === "ai" ? "AI: " : "You: "}${c.lastMessage.text}`
                      : "—"}
                  </span>
                  {c.lastMessage && (
                    <span className="shrink-0 text-[10px] text-muted">
                      {timeAgo(c.lastMessage.createdAt)}
                    </span>
                  )}
                </div>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] text-muted">{c.stage}</span>
                  {memberLabel(c.assignedUserId) && (
                    <span
                      className="rounded-full bg-primary-soft px-1.5 py-0.5 text-[9px] font-semibold text-primary-dark"
                      title="Assigned"
                    >
                      {memberLabel(c.assignedUserId)}
                    </span>
                  )}
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className={`min-w-0 flex-1 ${selectedId ? "flex" : "hidden md:flex"}`}>
        {detail ? (
          <ChatPane detail={detail} onChanged={onChanged} onBack={() => setSelectedId(null)} />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted">
            Select a conversation
          </div>
        )}
      </section>

      {/* Lead panel — desktop only; mobile gets it via the header later */}
      <aside className="hidden w-72 shrink-0 border-l border-line lg:block">
        {detail && tenant ? (
          <LeadPanel detail={detail} stages={tenant.stages} onChanged={onChanged} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
            Lead details appear here
          </div>
        )}
      </aside>
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
