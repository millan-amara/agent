"use client";

import { useCallback, useEffect, useState } from "react";
import { MessagesSquare, ServerCrash, X } from "lucide-react";
import { api, type Conversation, type ContactDetail, type TenantInfo, type TeamMember } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { ChatPane } from "@/components/ChatPane";
import { LeadPanel } from "@/components/LeadPanel";
import { StatePill } from "@/components/StatePill";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { EmptyState } from "@/components/ui/EmptyState";

export default function InboxPage() {
  const [tenant, setTenant] = useState<TenantInfo | null>(null);
  const [conversations, setConversations] = useState<Conversation[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [detail, setDetail] = useState<ContactDetail | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  // Lead panel as a slide-over, for viewports below lg where it isn't docked.
  const [leadOpen, setLeadOpen] = useState(false);

  /**
   * True from the moment a conversation is picked until ITS detail has arrived.
   * Keyed on the id rather than `detail === null` for two reasons: a fresh pick used
   * to fall through to the "Select a conversation" empty state while loading, and
   * switching chats used to keep rendering the PREVIOUS chat's messages under the
   * new one's name until the fetch landed.
   */
  const detailLoading = selectedId !== null && detail?.id !== selectedId;
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
    // Don't carry one lead's open panel over to the next conversation.
    setLeadOpen(false);
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
      <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center text-sm text-muted">
        <ServerCrash className="size-8 text-muted/60" strokeWidth={1.75} />
        <p>
          Can&apos;t reach the Azayon server ({error}).
          <br />
          Is the API running on port 3001?
        </p>
      </div>
    );
  }

  const needYou = conversations?.filter((c) => c.needsHuman || c.needsReview).length ?? 0;

  return (
    <div className="flex h-full min-h-0">
      {/* Conversation list */}
      <aside
        className={`w-full flex-col border-r border-line bg-surface md:flex md:w-80 md:shrink-0 ${
          selectedId ? "hidden" : "flex"
        }`}
      >
        <div className="flex items-center justify-between gap-2 border-b border-line px-4 py-3.5">
          <div>
            <h1 className="font-semibold">Conversations</h1>
            {conversations && (
              <p className="text-xs text-muted">{conversations.length} total</p>
            )}
          </div>
          {needYou > 0 && (
            <Badge tone="attention" size="md">
              {needYou} need you
            </Badge>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {conversations === null ? (
            <ListSkeleton />
          ) : conversations.length === 0 ? (
            <EmptyState
              icon={MessagesSquare}
              title="No conversations yet"
              description="Message your WhatsApp number and the chat will appear here live."
            />
          ) : (
            conversations.map((c) => {
              const selected = selectedId === c.id;
              const attention = c.needsHuman || c.needsReview;
              const prefix =
                c.lastMessage?.author === "customer"
                  ? ""
                  : c.lastMessage?.author === "ai"
                    ? "AI: "
                    : "You: ";
              return (
                <button
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  className={`relative flex w-full gap-3 border-b border-line px-3 py-3 text-left transition-colors hover:bg-canvas ${
                    selected ? "bg-primary-soft/50" : attention ? "bg-attentionSoft/30" : ""
                  }`}
                >
                  {c.needsHuman && (
                    <span className="absolute inset-y-2 left-0 w-0.5 rounded-full bg-attention" />
                  )}
                  <Avatar name={c.name} phone={c.phone} attention={c.needsHuman} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-ink">
                        {c.name ?? c.phone}
                      </span>
                      {c.lastMessage && (
                        <span className="tnum shrink-0 text-xs text-muted">
                          {timeAgo(c.lastMessage.createdAt)}
                        </span>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted">
                      {c.lastMessage ? `${prefix}${c.lastMessage.text}` : "—"}
                    </p>
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <StatePill contact={c} />
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-xs text-muted">{c.stage}</span>
                        {memberLabel(c.assignedUserId) && (
                          <span
                            className="grid size-5 place-items-center rounded-full bg-primary-soft text-[10px] font-bold text-primary-700"
                            title="Assigned"
                          >
                            {memberLabel(c.assignedUserId)}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </aside>

      {/* Chat */}
      <section className={`min-w-0 flex-1 ${selectedId ? "flex" : "hidden md:flex"}`}>
        {!selectedId ? (
          <div className="flex h-full w-full flex-col items-center justify-center gap-3 bg-canvas text-center">
            <div className="grid size-14 place-items-center rounded-full bg-line/50 text-muted">
              <MessagesSquare className="size-7" strokeWidth={1.5} />
            </div>
            <p className="text-sm text-muted">Select a conversation to get started</p>
          </div>
        ) : detailLoading ? (
          <ChatSkeleton />
        ) : (
          <ChatPane
            detail={detail!}
            onChanged={onChanged}
            onBack={() => setSelectedId(null)}
            onOpenLead={() => setLeadOpen(true)}
          />
        )}
      </section>

      {/* Lead panel — docked from lg up */}
      <aside className="hidden w-72 shrink-0 border-l border-line bg-surface lg:block">
        {detail && tenant ? (
          <LeadPanel detail={detail} stages={tenant.stages} onChanged={onChanged} />
        ) : (
          <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted">
            Lead details appear here
          </div>
        )}
      </aside>

      {/* Below lg the panel has nowhere to dock, so the same content slides over.
          Without this, stage and lead details are unreachable on a phone. */}
      {leadOpen && detail && tenant && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Lead details">
          <button
            type="button"
            aria-label="Close lead details"
            onClick={() => setLeadOpen(false)}
            className="absolute inset-0 bg-ink/40"
          />
          <div className="absolute inset-y-0 right-0 flex w-[min(20rem,88vw)] flex-col border-l border-line bg-surface shadow-xl">
            <div className="flex shrink-0 items-center justify-between border-b border-line px-4 py-3">
              <span className="text-sm font-semibold text-ink">Lead details</span>
              <button
                type="button"
                onClick={() => setLeadOpen(false)}
                aria-label="Close"
                className="rounded-card p-1 text-muted hover:bg-canvas hover:text-ink"
              >
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <LeadPanel detail={detail} stages={tenant.stages} onChanged={onChanged} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="divide-y divide-line">
      {Array.from({ length: 7 }).map((_, i) => (
        <div key={i} className="flex gap-3 px-3 py-3">
          <Skeleton className="size-9 rounded-full" />
          <div className="flex-1 space-y-2 py-0.5">
            <Skeleton className="h-3 w-1/2" />
            <Skeleton className="h-3 w-4/5" />
          </div>
        </div>
      ))}
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

/**
 * Placeholder while a conversation's detail loads. Mirrors ChatPane's real geometry
 * — header, alternating bubbles, composer — so the swap doesn't jolt the layout.
 */
function ChatSkeleton() {
  // Fixed widths (not random) so the shape is stable across re-renders.
  const bubbles: Array<{ inbound: boolean; w: string }> = [
    { inbound: true, w: "w-40" },
    { inbound: false, w: "w-56" },
    { inbound: true, w: "w-32" },
    { inbound: false, w: "w-44" },
    { inbound: true, w: "w-52" },
  ];
  return (
    <div className="flex h-full w-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 md:px-4">
        <Skeleton className="size-9 shrink-0 rounded-full" />
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3.5 w-32" />
          <Skeleton className="h-2.5 w-24" />
        </div>
        <Skeleton className="h-8 w-20 rounded-card" />
      </header>

      <div className="min-h-0 flex-1 space-y-3 overflow-hidden px-3 py-4 md:px-6">
        {bubbles.map((b, i) => (
          <div key={i} className={`flex ${b.inbound ? "justify-start" : "justify-end"}`}>
            <Skeleton className={`h-9 ${b.w} max-w-[78%] rounded-2xl`} />
          </div>
        ))}
      </div>

      <footer className="border-t border-line bg-surface p-3 md:px-4">
        <Skeleton className="h-11 w-full rounded-xl" />
      </footer>
    </div>
  );
}
