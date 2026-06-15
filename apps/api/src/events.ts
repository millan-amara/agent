import { EventEmitter } from "node:events";
import { config } from "./config.js";
import { getRedis, newRedis } from "./redis.js";

/**
 * Event bus feeding the realtime inbox. Single-node dev uses an in-process
 * EventEmitter. When REDIS_URL is set (multi-node prod), events are published
 * to a Redis channel and fanned back through the same local emitter — so
 * subscribers (the WebSocket handler) are identical in both modes.
 */
export type LiveEvent =
  | { type: "message"; tenantId: string; contactId: string }
  | { type: "contact_updated"; tenantId: string; contactId: string };

const CHANNEL = "azayon:live";
const bus = new EventEmitter();
bus.setMaxListeners(1000);

// In prod, one shared subscriber connection relays Redis → local emitter.
if (config.REDIS_URL) {
  const sub = newRedis();
  void sub.subscribe(CHANNEL).catch((err) => console.error("[events] subscribe failed:", err));
  sub.on("message", (_channel, payload) => {
    try {
      bus.emit("live", JSON.parse(payload) as LiveEvent);
    } catch {
      // malformed payload — ignore
    }
  });
}

export function publish(event: LiveEvent): void {
  const redis = getRedis();
  if (redis) {
    // Cross-node fan-out; the local subscriber re-emits to this node's listeners.
    void redis.publish(CHANNEL, JSON.stringify(event)).catch((err) =>
      console.error("[events] publish failed:", err),
    );
  } else {
    bus.emit("live", event);
  }
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  bus.on("live", listener);
  return () => bus.off("live", listener);
}
