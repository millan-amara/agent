"use client";

import { useEffect, useRef, useState } from "react";
import { api, type ContactDetail, type ApiMessage, type TeamMember } from "@/lib/api";
import { StatePill } from "./StatePill";

function displayName(c: { name: string | null; phone: string }) {
  return c.name ?? c.phone;
}

function Bubble({ m }: { m: ApiMessage }) {
  if (m.kind === "event") {
    return (
      <div className="my-1 flex justify-center">
        <span className="rounded-full bg-canvas px-3 py-1 text-[11px] text-muted">{m.text}</span>
      </div>
    );
  }
  const inbound = m.direction === "in";
  const mediaLabel =
    m.mediaType === "audio"
      ? "🎤 Voice note"
      : m.mediaType === "image"
        ? "🖼️ Image"
        : m.mediaType
          ? "📎 Attachment"
          : null;
  // Outbound delivery state (only meaningful for real WhatsApp sends).
  const tick =
    m.status === "read"
      ? "✓✓"
      : m.status === "delivered"
        ? "✓✓"
        : m.status === "sent"
          ? "✓"
          : m.status === "failed"
            ? "⚠ failed"
            : "";
  return (
    <div className={`flex ${inbound ? "justify-start" : "justify-end"}`}>
      <div
        className={`my-0.5 max-w-[80%] whitespace-pre-wrap rounded-card border px-3 py-2 text-sm ${
          inbound
            ? "border-line bg-white"
            : m.author === "human"
              ? "border-primary-dark/20 bg-primary-dark text-white"
              : "border-primary/20 bg-primary-soft"
        }`}
      >
        {mediaLabel && (
          <div className="mb-0.5 text-[11px] font-medium opacity-70">{mediaLabel}</div>
        )}
        {m.text}
        <div
          className={`mt-1 text-right text-[10px] ${
            !inbound && m.author === "human" ? "text-white/60" : "text-muted"
          }`}
        >
          {m.author === "ai" ? "AI · " : m.author === "human" ? "You · " : ""}
          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
          {!inbound && tick && (
            <span className={`ml-1 ${m.status === "read" ? "text-sky-400" : ""}`}>{tick}</span>
          )}
        </div>
      </div>
    </div>
  );
}

export function ChatPane({
  detail,
  onChanged,
  onBack,
}: {
  detail: ContactDetail;
  onChanged: () => void;
  onBack?: () => void;
}) {
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [detail.messages.length]);

  useEffect(() => {
    api.team().then(setMembers).catch(() => {});
  }, []);

  const assign = async (userId: string) => {
    setError(null);
    try {
      await api.assignContact(detail.id, userId || null);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const send = async () => {
    if (!draft.trim() || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendMessage(detail.id, draft.trim());
      setDraft("");
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const toggleAi = async () => {
    setError(null);
    try {
      await api.setAi(detail.id, detail.aiPaused);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line bg-white px-4 py-3">
        {onBack && (
          <button onClick={onBack} className="text-muted md:hidden" aria-label="Back">
            ←
          </button>
        )}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate font-semibold">{displayName(detail)}</span>
            <StatePill contact={detail} size="md" />
          </div>
          <div className="tnum text-xs text-muted">{detail.phone}</div>
        </div>
        <select
          value={detail.assignedUserId ?? ""}
          onChange={(e) => void assign(e.target.value)}
          title="Assign conversation"
          className="max-w-[8rem] rounded-card border border-line bg-white px-2 py-1.5 text-xs text-muted outline-none focus:border-primary"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        {!detail.optedOut && (
          <button
            onClick={toggleAi}
            className={`rounded-card border px-3 py-1.5 text-sm font-medium ${
              detail.aiPaused
                ? "border-primary bg-primary text-white"
                : "border-line bg-white text-ink hover:bg-canvas"
            }`}
          >
            {detail.aiPaused ? "Resume AI" : "Take over"}
          </button>
        )}
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {detail.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-line bg-white p-3">
        {!detail.windowOpen && !detail.optedOut && (
          <div className="mb-2 rounded-card border border-line bg-canvas px-3 py-2 text-xs text-muted">
            Use an approved template to message this customer — they last wrote more than 24 hours
            ago. (Templates arrive in a later update.)
          </div>
        )}
        {error && (
          <div className="mb-2 rounded-card bg-red-50 px-3 py-2 text-xs text-danger">{error}</div>
        )}
        <div className="flex items-end gap-2">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={
              detail.optedOut ? "Customer has opted out" : "Reply as the business… (sending pauses the AI)"
            }
            disabled={detail.optedOut || !detail.windowOpen}
            className="max-h-32 flex-1 resize-none rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary disabled:bg-canvas disabled:text-muted"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !draft.trim() || detail.optedOut || !detail.windowOpen}
            className="rounded-card bg-primary-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </footer>
    </div>
  );
}
