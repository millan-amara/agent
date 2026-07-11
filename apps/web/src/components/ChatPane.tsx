"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronLeft,
  Send,
  Bot,
  Check,
  CheckCheck,
  AlertCircle,
  Mic,
  Image as ImageIcon,
  Paperclip,
  Lock,
  PanelRight,
} from "lucide-react";
import Link from "next/link";
import {
  api,
  type ContactDetail,
  type ApiMessage,
  type MessageTemplate,
  type TeamMember,
} from "@/lib/api";
import { StatePill } from "./StatePill";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";

function displayName(c: { name: string | null; phone: string }) {
  return c.name ?? c.phone;
}

function Bubble({ m }: { m: ApiMessage }) {
  if (m.kind === "event") {
    return (
      <div className="my-2 flex justify-center">
        <span className="rounded-full bg-line/50 px-3 py-1 text-[11px] text-muted">{m.text}</span>
      </div>
    );
  }
  const inbound = m.direction === "in";
  const human = !inbound && m.author === "human";
  const ai = !inbound && m.author === "ai";

  const MediaIcon = m.mediaType === "audio" ? Mic : m.mediaType === "image" ? ImageIcon : Paperclip;
  const mediaLabel =
    m.mediaType === "audio"
      ? "Voice note"
      : m.mediaType === "image"
        ? "Image"
        : m.mediaType
          ? "Attachment"
          : null;

  return (
    <div className={`flex flex-col ${inbound ? "items-start" : "items-end"}`}>
      <div
        className={`max-w-[78%] whitespace-pre-wrap px-3.5 py-2 text-sm shadow-card ${
          inbound
            ? "rounded-2xl rounded-bl-md bg-surface text-ink"
            : human
              ? "rounded-2xl rounded-br-md bg-primary-700 text-white"
              : "rounded-2xl rounded-br-md bg-primary-soft text-ink"
        }`}
      >
        {mediaLabel && (
          <div className="mb-1 flex items-center gap-1.5 text-[11px] font-medium opacity-70">
            <MediaIcon className="size-3.5" />
            {mediaLabel}
          </div>
        )}
        {m.text}
      </div>
      <div className="mt-0.5 flex items-center gap-1 px-1 text-[10px] text-muted">
        {ai && (
          <span className="inline-flex items-center gap-0.5 font-medium text-primary-700">
            <Bot className="size-3" /> AI
          </span>
        )}
        {human && <span className="font-medium">You</span>}
        <span className="tnum">
          {new Date(m.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
        </span>
        {!inbound && <Tick status={m.status} />}
      </div>
    </div>
  );
}

function Tick({ status }: { status?: string | null }) {
  if (status === "failed")
    return (
      <span className="inline-flex items-center gap-0.5 text-danger">
        <AlertCircle className="size-3" /> failed
      </span>
    );
  if (status === "read") return <CheckCheck className="size-3.5 text-sky-500" />;
  if (status === "delivered") return <CheckCheck className="size-3.5" />;
  if (status === "sent") return <Check className="size-3.5" />;
  return null;
}

export function ChatPane({
  detail,
  onChanged,
  onBack,
  onOpenLead,
}: {
  detail: ContactDetail;
  onChanged: () => void;
  onBack?: () => void;
  /** Opens the lead panel as a sheet. Only passed below lg, where it isn't docked. */
  onOpenLead?: () => void;
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

  const disabled = detail.optedOut || !detail.windowOpen;

  return (
    <div className="flex h-full min-h-0 flex-col bg-canvas">
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2.5 md:px-4">
        {onBack && (
          <button
            onClick={onBack}
            className="-ml-1 rounded-card p-1 text-muted hover:bg-canvas hover:text-ink md:hidden"
            aria-label="Back"
          >
            <ChevronLeft className="size-5" />
          </button>
        )}
        <Avatar name={detail.name} phone={detail.phone} attention={detail.needsHuman} />
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
          className="hidden max-w-[8rem] rounded-card border border-line bg-surface px-2 py-1.5 text-xs text-muted outline-none focus:border-primary sm:block"
        >
          <option value="">Unassigned</option>
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name ?? m.email}
            </option>
          ))}
        </select>
        {/* Below lg the lead panel isn't on screen, so this is the only way to reach
            the lead's stage and details. Hidden on lg+, where the panel is always up. */}
        {onOpenLead && (
          <button
            onClick={onOpenLead}
            className="rounded-card p-1.5 text-muted hover:bg-canvas hover:text-ink lg:hidden"
            aria-label="Lead details"
            title="Lead details"
          >
            <PanelRight className="size-5" />
          </button>
        )}
        {!detail.optedOut && (
          <Button variant={detail.aiPaused ? "primary" : "secondary"} size="sm" onClick={toggleAi}>
            {detail.aiPaused ? "Resume AI" : "Take over"}
          </Button>
        )}
      </header>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto px-3 py-4 md:px-6">
        {detail.messages.map((m) => (
          <Bubble key={m.id} m={m} />
        ))}
        <div ref={bottomRef} />
      </div>

      <footer className="border-t border-line bg-surface p-3 md:px-4">
        {!detail.windowOpen && !detail.optedOut && (
          <ClosedWindowNotice detail={detail} onChanged={onChanged} />
        )}
        {error && (
          <div className="mb-2 rounded-card bg-danger-soft px-3 py-2 text-xs text-danger">{error}</div>
        )}
        <div
          className={`flex items-end gap-2 rounded-xl border bg-surface p-1.5 transition-colors focus-within:border-primary ${
            disabled ? "border-line opacity-60" : "border-line"
          }`}
        >
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
              detail.optedOut
                ? "Customer has opted out"
                : "Reply as the business… (sending pauses the AI)"
            }
            disabled={disabled}
            className="max-h-32 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted/70 disabled:text-muted"
          />
          <button
            onClick={() => void send()}
            disabled={sending || !draft.trim() || disabled}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-700 text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </footer>
    </div>
  );
}

/**
 * Shown when the 24h customer-service window has closed. Outside that window Meta
 * only permits an APPROVED template, so that's exactly what this offers — the copy
 * used to claim templates were "coming in a later update", which was never true:
 * follow-ups and broadcasts have always sent them. A human in the inbox just had no
 * way to.
 */
function ClosedWindowNotice({
  detail,
  onChanged,
}: {
  detail: ContactDetail;
  onChanged: () => void;
}) {
  const [templates, setTemplates] = useState<MessageTemplate[] | null>(null);
  const [templateId, setTemplateId] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .messageTemplates()
      .then((all) => {
        // Only approved templates are legal outside the window; a draft would be
        // rejected by the Graph API anyway.
        const approved = all.filter((t) => t.status === "approved");
        setTemplates(approved);
        setTemplateId(approved[0]?.id ?? "");
      })
      .catch(() => setTemplates([]));
  }, []);

  const send = async () => {
    if (!templateId || sending) return;
    setSending(true);
    setError(null);
    try {
      await api.sendTemplate(detail.id, templateId);
      onChanged();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSending(false);
    }
  };

  const selected = templates?.find((t) => t.id === templateId);

  return (
    <div className="mb-2 rounded-card border border-line bg-canvas px-3 py-2.5">
      <div className="flex items-start gap-2 text-xs text-muted">
        <Lock className="mt-0.5 size-3.5 shrink-0" />
        <span>
          This customer last wrote more than 24 hours ago. WhatsApp only allows an approved
          template until they reply.
        </span>
      </div>

      {error && <p className="mt-2 text-xs text-danger">{error}</p>}

      {templates === null ? (
        <p className="mt-2 text-xs text-muted">Loading templates…</p>
      ) : templates.length === 0 ? (
        <p className="mt-2 text-xs text-muted">
          You have no approved templates yet — create one in{" "}
          <Link href="/settings" className="font-medium text-primary-700 hover:underline">
            Settings → WhatsApp
          </Link>
          , then submit it to Meta for approval.
        </p>
      ) : (
        <div className="mt-2 space-y-2">
          <div className="flex items-center gap-2">
            <select
              value={templateId}
              onChange={(e) => setTemplateId(e.target.value)}
              aria-label="Template to send"
              className="min-w-0 flex-1 rounded-card border border-line bg-surface px-2 py-1.5 text-xs outline-none focus:border-primary"
            >
              {templates.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            <Button size="sm" onClick={() => void send()} disabled={sending || !templateId}>
              {sending ? "Sending…" : "Send template"}
            </Button>
          </div>
          {/* Templates are pre-approved and uneditable, so show exactly what will go out. */}
          {selected && (
            <p className="rounded-card bg-surface px-2.5 py-1.5 text-xs text-muted">
              {selected.body}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
