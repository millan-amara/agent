/**
 * `fetch` with a hard timeout. Node's global fetch has NO default timeout — a
 * provider that accepts the connection but never responds leaves the awaiting
 * promise hung forever. On the message loop that wedges a queue worker, and at
 * BullMQ concurrency a handful of stalled calls drain the whole pool so no
 * replies go out. Every outbound call to a third-party API must go through this
 * so a slow provider fails fast (and is caught) instead of hanging.
 *
 * Callers keep their existing `res.ok`/`res.json()`/`arrayBuffer()` handling;
 * this only injects an AbortSignal. An honoured timeout rejects with a
 * TimeoutError, which the surrounding try/catch treats like any other failure.
 */
const DEFAULT_TIMEOUT_MS = 15_000;

export function fetchWithTimeout(
  input: string | URL,
  init: RequestInit = {},
  timeoutMs = DEFAULT_TIMEOUT_MS,
): Promise<Response> {
  // Respect a caller-supplied signal if present; otherwise enforce the timeout.
  return fetch(input, { ...init, signal: init.signal ?? AbortSignal.timeout(timeoutMs) });
}
