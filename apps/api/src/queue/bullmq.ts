import { Queue, Worker, type ConnectionOptions } from "bullmq";
import { newRedis, getRedis } from "../redis.js";
import type { QueueDriver } from "./queue.js";

/**
 * Production queue driver — same contract as InMemoryDebouncedQueue, backed by
 * Redis so work survives restarts and scales past one node.
 *
 * Debounce: each enqueue replaces the contact's pending delayed job (jobId =
 * the contact key), so a burst of messages collapses into one turn after the
 * silence window — mirroring the in-memory per-key timer reset.
 *
 * Per-contact ordering: a Redis advisory lock per contact key serializes a
 * contact's turns. If a turn is already running for that contact, the job
 * re-delays itself instead of running concurrently (replies out of order
 * destroy trust — PLAN §3).
 */
// Long enough to outlast a worst-case multi-tool turn (each external call is now
// individually timeout-bounded) without pinning a contact's lock for minutes if
// a worker dies mid-turn.
const LOCK_TTL_MS = 180_000;
const RETRY_DELAY_MS = 1_000;

export class BullMqQueue implements QueueDriver {
  private queue: Queue;
  private worker: Worker;
  private debounceMs: number;
  private name: string;

  constructor(
    handler: (key: string) => Promise<void>,
    debounceMs: number,
    name = "agent-turns",
  ) {
    this.debounceMs = debounceMs;
    this.name = name;
    // BullMQ bundles its own ioredis copy; an instance from our ioredis works
    // at runtime but its types differ, so cast through unknown.
    const connection = newRedis() as unknown as ConnectionOptions;
    // Retry transient failures (a DB blip, a provider error that escapes the
    // turn's own catch) with exponential backoff instead of dropping the turn.
    // attempts is bounded so a genuine poison message can't retry forever.
    this.queue = new Queue(name, {
      connection,
      defaultJobOptions: {
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: true,
        removeOnFail: 100,
      },
    });

    this.worker = new Worker(
      name,
      async (job) => {
        const key = job.data.key as string;
        const redis = getRedis();
        const lockKey = `lock:turn:${key}`;
        // SET NX PX — only one worker holds a contact's lock at a time.
        const acquired = redis
          ? await redis.set(lockKey, job.id ?? "1", "PX", LOCK_TTL_MS, "NX")
          : "OK";
        if (acquired !== "OK") {
          // Someone is mid-turn for this contact — try again shortly.
          await this.queue.add(name, { key }, { delay: RETRY_DELAY_MS, removeOnComplete: true });
          return;
        }
        try {
          await handler(key);
        } finally {
          if (redis) await redis.del(lockKey).catch(() => {});
        }
      },
      { connection: newRedis() as unknown as ConnectionOptions, concurrency: 10 },
    );

    this.worker.on("failed", (job, err) => {
      console.error(`[bullmq] job ${job?.id} failed:`, err);
    });
  }

  enqueue(key: string): void {
    // Fire-and-forget to match the synchronous interface. Replace any pending
    // delayed job for this key so the debounce window resets.
    const jobId = `c:${key}`;
    void (async () => {
      try {
        await this.queue.remove(jobId).catch(() => {}); // ignore if active/locked
        await this.queue.add(
          this.name,
          { key },
          { jobId, delay: this.debounceMs, removeOnComplete: true, removeOnFail: 100 },
        );
      } catch (err) {
        console.error(`[bullmq] enqueue failed for ${key}:`, err);
      }
    })();
  }

  async idle(): Promise<void> {
    // Resolve once nothing is waiting/delayed/active. Polled — used by tests.
    for (;;) {
      const counts = await this.queue.getJobCounts("waiting", "delayed", "active", "paused");
      const pending =
        (counts.waiting ?? 0) + (counts.delayed ?? 0) + (counts.active ?? 0) + (counts.paused ?? 0);
      if (pending === 0) return;
      await new Promise((r) => setTimeout(r, 200));
    }
  }
}
