import { Redis } from "ioredis";
import { config } from "./config.js";

/**
 * Shared Redis access. Production sets REDIS_URL (Railway add-on); without it
 * the app runs fully in-process (single-node dev) and these helpers return null
 * so callers fall back to their in-memory path.
 *
 * BullMQ requires `maxRetriesPerRequest: null` on its connections.
 */
export const redisEnabled = Boolean(config.REDIS_URL);

let shared: Redis | null = null;

/** Lazily-created shared connection for general commands (locks, rate limits). */
export function getRedis(): Redis | null {
  if (!config.REDIS_URL) return null;
  if (!shared) {
    const conn = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
    conn.on("error", (err: Error) => console.error("[redis] connection error:", err.message));
    shared = conn;
  }
  return shared;
}

/** A fresh connection — BullMQ and pub/sub subscribers each need their own. */
export function newRedis(): Redis {
  if (!config.REDIS_URL) throw new Error("REDIS_URL is not set");
  const conn = new Redis(config.REDIS_URL, { maxRetriesPerRequest: null });
  conn.on("error", (err: Error) => console.error("[redis] connection error:", err.message));
  return conn;
}
