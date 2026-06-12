import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { Tenant, User } from "@prisma/client";
import { db } from "../db.js";

const scrypt = promisify(scryptCb) as (pw: string, salt: string, len: number) => Promise<Buffer>;

const SESSION_COOKIE = "azayon_session";
const SESSION_TTL_MS = 30 * 24 * 3600_000;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("hex");
  const hash = await scrypt(password, salt, 64);
  return `${salt}:${hash.toString("hex")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [salt, hex] = stored.split(":");
  if (!salt || !hex) return false;
  const hash = await scrypt(password, salt, 64);
  const expected = Buffer.from(hex, "hex");
  return hash.length === expected.length && timingSafeEqual(hash, expected);
}

export async function createSession(reply: FastifyReply, userId: string): Promise<void> {
  const token = randomBytes(32).toString("hex");
  await db.session.create({
    data: { token, userId, expiresAt: new Date(Date.now() + SESSION_TTL_MS) },
  });
  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    maxAge: SESSION_TTL_MS / 1000,
  });
}

export async function destroySession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const token = req.cookies[SESSION_COOKIE];
  if (token) await db.session.deleteMany({ where: { token } });
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
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
