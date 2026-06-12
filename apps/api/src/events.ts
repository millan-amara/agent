import { EventEmitter } from "node:events";

/**
 * In-process event bus feeding the realtime inbox. Production swaps this for
 * Redis pub/sub when the API runs on more than one node — same publish shape.
 */
export type LiveEvent =
  | { type: "message"; tenantId: string; contactId: string }
  | { type: "contact_updated"; tenantId: string; contactId: string };

const bus = new EventEmitter();
bus.setMaxListeners(100);

export function publish(event: LiveEvent): void {
  bus.emit("live", event);
}

export function subscribe(listener: (event: LiveEvent) => void): () => void {
  bus.on("live", listener);
  return () => bus.off("live", listener);
}
