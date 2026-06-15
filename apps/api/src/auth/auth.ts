import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import bcrypt from "bcryptjs";
import type { CookieSerializeOptions } from "@fastify/cookie";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Tenant, User } from "@prisma/client";
import { db } from "../db.js";
import { isProd } from "../config.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

const SESSION_COOKIE = "azayon_session";
const SESSION_TTL_MS = 30 * 24 * 3600_000;

// In production the web app and API are served from different origins (separate
// Railway services), so the session cookie is cross-site: browsers only send a
// cross-site cookie when it is `SameSite=None; Secure`. In dev (same-ish origin,
// plain http) use Lax + insecure so the cookie still works without TLS.
const COOKIE_OPTS: CookieSerializeOptions = {
  path: "/",
  httpOnly: true,
  sameSite: isProd ? "none" : "lax",
  secure: isProd,
};

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

// Legacy users migrated from the old CRM carry bcrypt hashes ($2a/$2b/$2y$...).
// New hashes are scrypt ("salt:hex"). Detect the scheme so both verify, and so
// a migrated user can be transparently upgraded to scrypt on next login.
export function isBcryptHash(stored: string): boolean {
  return /^\$2[aby]\$/.test(stored);
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  if (isBcryptHash(stored)) {
    return bcrypt.compare(password, stored);
  }
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

// A valid scrypt hash of a throwaway secret. Verifying against it on the
// "user not found" path makes login pay the same scrypt cost whether or not the
// email exists, so response timing can't be used to enumerate registered emails.
let dummyHash: string | null = null;

/**
 * Like verifyPassword, but tolerates a missing stored hash (unknown email):
 * it still runs scrypt against a dummy hash and returns false, keeping the
 * timing of known-vs-unknown emails indistinguishable.
 */
export async function verifyLogin(password: string, stored: string | null): Promise<boolean> {
  if (!dummyHash) dummyHash = await hashPassword(randomBytes(16).toString("hex"));
  const ok = await verifyPassword(password, stored ?? dummyHash);
  return stored ? ok : false;
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  reply.setCookie(SESSION_COOKIE, token, { ...COOKIE_OPTS, maxAge: SESSION_TTL_MS / 1000 });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.session.deleteMany({ where: { token } });
  // Clear with the same attributes the cookie was set with, or the browser
  // won't match and remove it.
  reply.clearCookie(SESSION_COOKIE, COOKIE_OPTS);
}

/** Issues a single-use, time-limited token for an email flow (reset/verify). */
export async function createAuthToken(
  userId: string,
  purpose: "reset" | "verify",
  ttlMs: number,
): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await db.authToken.create({
    data: { token, userId, purpose, expiresAt: new Date(Date.now() + ttlMs) },
  });
  return token;
}

/** Validates and burns a token; returns the userId or null if invalid/expired/used. */
export async function consumeAuthToken(
  token: string,
  purpose: "reset" | "verify",
): Promise<string | null> {
  const row = await db.authToken.findUnique({ where: { token } });
  if (!row || row.purpose !== purpose || row.usedAt || row.expiresAt < new Date()) {
    return null;
  }
  await db.authToken.update({ where: { token }, data: { usedAt: new Date() } });
  return row.userId;
}

export interface AuthContext {
  user: User;
  tenant: Tenant;
}

/** Resolves the session cookie to user + tenant, or replies 401 and returns null. */
export async function requireAuth(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) {
    const session = await db.session.findUnique({
      where: { token },
      include: { user: { include: { tenant: true } } },
    });
    if (session && session.expiresAt > new Date()) {
      return { user: session.user, tenant: session.user.tenant };
    }
  }
  reply.code(401).send({ error: "not authenticated" });
  return null;
}

/** Like requireAuth but 403s non-owners. For billing, team, and connection routes. */
export async function requireOwner(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthContext | null> {
  const auth = await requireAuth(req, reply);
  if (!auth) return null;
  if (auth.user.role !== "owner") {
    reply.code(403).send({ error: "Only the account owner can do this." });
    return null;
  }
  return auth;
}
