/**
 * Per-key FIFO queue with debounce.
 *
 * Customers send three short messages in a row; the agent should answer the
 * batch, not each fragment. enqueue() resets a debounce timer per key
 * (key = tenantId:contactId). When the timer fires, the handler runs — and
 * runs are chained per key so a contact's jobs never overlap or reorder.
 *
 * Dev implementation is in-process. Production swaps this for a BullMQ-backed
 * driver with the same interface (Redis delayed jobs give the debounce).
 */
export interface QueueDriver {
  enqueue(key: string): void;
  /** Resolves when all currently-known work has drained (used by simulator/tests). */
  idle(): Promise<void>;
}

export class InMemoryDebouncedQueue implements QueueDriver {
  private timers = new Map<string, NodeJS.Timeout>();
  private chains = new Map<string, Promise<void>>();
  private pending = 0;
  private waiters: Array<() => void> = [];

  constructor(
    private handler: (key: string) => Promise<void>,
    private debounceMs: number,
  ) {}

  enqueue(key: string): void {
    const existing = this.timers.get(key);
    if (existing) {
      clearTimeout(existing);
    } else {
      this.pending++;
    }
    this.timers.set(
      key,
      setTimeout(() => this.fire(key), this.debounceMs),
    );
  }

  private fire(key: string): void {
    this.timers.delete(key);
    const prev = this.chains.get(key) ?? Promise.resolve();
    const run = prev
      .then(() => this.handler(key))
      .catch((err) => {
        console.error(`[queue] handler failed for ${key}:`, err);
      })
      .finally(() => {
        if (this.chains.get(key) === run) this.chains.delete(key);
        this.pending--;
        if (this.pending === 0) {
          this.waiters.forEach((w) => w());
          this.waiters = [];
        }
      });
    this.chains.set(key, run);
  }

  idle(): Promise<void> {
    if (this.pending === 0) return Promise.resolve();
    return new Promise((resolve) => this.waiters.push(resolve));
  }
}

export const contactKey = (tenantId: string, contactId: string) =>
  `${tenantId}:${contactId}`;

export const parseContactKey = (key: string) => {
  const idx = key.indexOf(":");
  return { tenantId: key.slice(0, idx), contactId: key.slice(idx + 1) };
};
