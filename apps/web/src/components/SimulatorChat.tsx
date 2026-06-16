"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Zap, Send, RotateCcw } from "lucide-react";
import { api, type ContactDetail } from "@/lib/api";
import { useLive } from "@/lib/useLive";
import { Badge } from "@/components/ui/Badge";

/**
 * The aha moment: chat with your own AI before connecting WhatsApp.
 * You play the customer; the real agent loop replies and works the CRM.
 */
export function SimulatorChat({ height = "h-[28rem]" }: { height?: string }) {
  const [contact, setContact] = useState<ContactDetail | null>(null);
  const [draft, setDraft] = useState("");
  const [waiting, setWaiting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(() => {
    api
      .simulator()
      .then((r) => {
        setContact(r.contact);
        if (r.contact?.messages.at(-1)?.direction === "out") setWaiting(false);
      })
      .catch(() => {});
  }, []);

  useEffect(() => refresh(), [refresh]);
  useLive(
    useCallback(
      (event) => {
        if (!contact || event.contactId === contact.id) refresh();
      },
      [contact, refresh],
    ),
  );

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [contact?.messages.length, waiting]);

  const send = async () => {
    if (!draft.trim()) return;
    const text = draft.trim();
    setDraft("");
    setWaiting(true);
    try {
      await api.simulatorSend(text);
      refresh();
    } catch {
      setWaiting(false);
    }
  };

  const reset = async () => {
    await api.simulatorReset().catch(() => {});
    setContact(null);
    setWaiting(false);
  };

  return (
    <div
      className={`flex ${height} flex-col overflow-hidden rounded-card border border-line bg-surface shadow-card`}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div>
          <span className="text-sm font-semibold">Test conversation</span>
          <span className="ml-2 text-xs text-muted">you are the customer</span>
        </div>
        <div className="flex items-center gap-3">
          {contact && <Badge tone="neutral">Stage: {contact.stage}</Badge>}
          <button
            onClick={() => void reset()}
            className="inline-flex items-center gap-1 text-xs font-medium text-muted hover:text-ink"
          >
            <RotateCcw className="size-3.5" /> Reset
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1.5 overflow-y-auto bg-canvas px-4 py-4">
        {!contact?.messages.length && !waiting && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Say hi 👋 — message your business the way a customer would on WhatsApp.
          </p>
        )}
        {contact?.messages.map((m) =>
          m.kind === "event" ? (
            <div key={m.id} className="my-1.5 flex justify-center">
              <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-3 py-1 text-[11px] font-medium text-primary-700">
                <Zap className="size-3" /> {m.text}
              </span>
            </div>
          ) : (
            <div
              key={m.id}
              className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] whitespace-pre-wrap px-3.5 py-2 text-sm shadow-card ${
                  m.direction === "in"
                    ? "rounded-2xl rounded-br-md bg-primary-700 text-white"
                    : "rounded-2xl rounded-bl-md bg-surface text-ink"
                }`}
              >
                {m.text}
              </div>
            </div>
          ),
        )}
        {waiting && (
          <div className="flex justify-start">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-surface px-3.5 py-3 shadow-card">
              <Dot /> <Dot delay="150ms" /> <Dot delay="300ms" />
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line bg-surface p-2.5">
        <div className="flex flex-1 items-end gap-2 rounded-xl border border-line bg-surface p-1.5 focus-within:border-primary">
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
            placeholder="Type as a customer…"
            className="max-h-24 flex-1 resize-none bg-transparent px-2.5 py-1.5 text-sm outline-none placeholder:text-muted/70"
          />
          <button
            onClick={() => void send()}
            disabled={!draft.trim()}
            aria-label="Send"
            className="grid size-9 shrink-0 place-items-center rounded-lg bg-primary-700 text-white transition-colors hover:bg-primary-800 disabled:opacity-40"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function Dot({ delay = "0ms" }: { delay?: string }) {
  return (
    <span
      className="size-1.5 animate-bounce rounded-full bg-muted/60"
      style={{ animationDelay: delay }}
    />
  );
}
