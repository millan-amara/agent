"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, type ContactDetail } from "@/lib/api";
import { useLive } from "@/lib/useLive";

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
    <div className={`flex ${height} flex-col overflow-hidden rounded-card border border-line bg-white`}>
      <div className="flex items-center justify-between border-b border-line px-3 py-2">
        <div>
          <span className="text-sm font-medium">Test conversation</span>
          <span className="ml-2 text-xs text-muted">you are the customer</span>
        </div>
        <div className="flex items-center gap-3">
          {contact && (
            <span className="rounded-full bg-canvas px-2 py-0.5 text-[10px] text-muted">
              Lead stage: {contact.stage}
            </span>
          )}
          <button onClick={() => void reset()} className="text-xs font-medium text-muted hover:text-ink">
            Reset
          </button>
        </div>
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto bg-canvas px-3 py-3">
        {!contact?.messages.length && !waiting && (
          <p className="px-4 py-8 text-center text-sm text-muted">
            Say hi 👋 — message your business the way a customer would on WhatsApp.
          </p>
        )}
        {contact?.messages.map((m) =>
          m.kind === "event" ? (
            <div key={m.id} className="flex justify-center">
              <span className="rounded-full bg-white px-3 py-1 text-[11px] text-muted">⚡ {m.text}</span>
            </div>
          ) : (
            <div key={m.id} className={`flex ${m.direction === "in" ? "justify-end" : "justify-start"}`}>
              <div
                className={`max-w-[80%] whitespace-pre-wrap rounded-card border px-3 py-2 text-sm ${
                  m.direction === "in"
                    ? "border-primary/20 bg-primary-soft"
                    : "border-line bg-white"
                }`}
              >
                {m.text}
              </div>
            </div>
          ),
        )}
        {waiting && (
          <div className="flex justify-start">
            <div className="rounded-card border border-line bg-white px-3 py-2 text-sm text-muted">
              typing…
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="flex items-end gap-2 border-t border-line p-2">
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
          className="max-h-24 flex-1 resize-none rounded-card border border-line px-3 py-2 text-sm outline-none focus:border-primary"
        />
        <button
          onClick={() => void send()}
          disabled={!draft.trim()}
          className="rounded-card bg-primary-dark px-4 py-2 text-sm font-semibold text-white disabled:opacity-40"
        >
          Send
        </button>
      </div>
    </div>
  );
}
