"use client";

import { useEffect, useRef } from "react";
import { API_URL } from "./api";

/**
 * Subscribes to the inbox websocket and invokes the callback on every event.
 * Reconnects with backoff; callers refetch whatever they display.
 */
export function useLive(onEvent: (event: { type: string; contactId: string }) => void): void {
  const handler = useRef(onEvent);
  handler.current = onEvent;

  useEffect(() => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retryMs = 1000;

    const connect = () => {
      const url = API_URL.replace(/^http/, "ws") + "/api/ws";
      ws = new WebSocket(url);
      ws.onopen = () => {
        retryMs = 1000;
      };
      ws.onmessage = (msg) => {
        try {
          handler.current(JSON.parse(msg.data as string));
        } catch {
          // ignore malformed frames
        }
      };
      ws.onclose = () => {
        if (closed) return;
        setTimeout(connect, retryMs);
        retryMs = Math.min(retryMs * 2, 15000);
      };
    };

    connect();
    return () => {
      closed = true;
      ws?.close();
    };
  }, []);
}
