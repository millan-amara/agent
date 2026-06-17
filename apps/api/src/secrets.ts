import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { config, isProd } from "./config.js";

/**
 * Application-layer encryption for per-tenant secrets at rest (WhatsApp Cloud
 * API tokens, Paystack secret keys, Google refresh tokens). A database dump
 * alone must not yield live third-party credentials.
 *
 * AES-256-GCM (authenticated) with a fresh random IV per value. The stored form
 * is `enc:v1:<iv>:<tag>:<ciphertext>` (base64 parts). `decryptSecret` returns
 * any non-prefixed value unchanged so legacy plaintext rows keep working and are
 * transparently upgraded the next time they are re-saved (re-encrypted on write).
 *
 * The key comes from SECRETS_ENCRYPTION_KEY (required in production — see
 * config.ts). It may be any sufficiently random string; we SHA-256 it to a fixed
 * 32-byte key so operators don't have to produce exact-length material. In dev,
 * absent a key, a fixed insecure key is used so round-trips work locally.
 */

const PREFIX = "enc:v1:";
const DEV_FALLBACK_KEY = "azayon-dev-insecure-secrets-key";

let keyCache: Buffer | null = null;

function key(): Buffer {
  if (keyCache) return keyCache;
  const raw = config.SECRETS_ENCRYPTION_KEY ?? (isProd ? null : DEV_FALLBACK_KEY);
  if (!raw) {
    // Should be unreachable: config.ts fails fast in prod when this is unset.
    throw new Error("SECRETS_ENCRYPTION_KEY is required to encrypt/decrypt tenant secrets.");
  }
  keyCache = createHash("sha256").update(raw).digest();
  return keyCache;
}

export function isEncrypted(stored: string): boolean {
  return stored.startsWith(PREFIX);
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ct = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return PREFIX + [iv, tag, ct].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(stored: string): string {
  if (!isEncrypted(stored)) return stored; // legacy plaintext — upgraded on next write
  const [, , ivB64, tagB64, ctB64] = stored.split(":");
  if (!ivB64 || !tagB64 || !ctB64) {
    throw new Error("Malformed encrypted secret.");
  }
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(ctB64, "base64")), decipher.final()]).toString(
    "utf8",
  );
}

/** Decrypts a nullable column; passes null/empty through untouched. */
export function decryptNullable(stored: string | null | undefined): string | null {
  return stored ? decryptSecret(stored) : null;
}
