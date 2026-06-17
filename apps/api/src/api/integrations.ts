import { randomBytes, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { config, isProd } from "../config.js";
import { requireAuth, requireOwner } from "../auth/auth.js";
import { audit } from "../audit.js";
import { exchangeCode, googleAuthUrl, googleConfigured, disconnectGoogle } from "../google.js";
import { encryptSecret } from "../secrets.js";

// Single-use CSRF nonce for the Google OAuth round-trip. Set on /auth, checked
// on /callback. The session check below is the primary binding; this is the
// genuine CSRF/replay defense (random, per-request, scoped to this path).
const OAUTH_STATE_COOKIE = "g_oauth_state";
const oauthCookieOpts = {
  path: "/api/integrations/google",
  httpOnly: true,
  sameSite: (isProd ? "none" : "lax") as "none" | "lax",
  secure: isProd,
  maxAge: 600, // 10 minutes
};

function stateMatches(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Per-tenant third-party integrations (Google Calendar). Owner-gated. */
export function registerIntegrationRoutes(app: FastifyInstance): void {
  // Kick off Google OAuth. A random nonce rides in `state` and a matching
  // httpOnly cookie; the callback requires both to agree.
  app.get("/api/integrations/google/auth", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    if (!googleConfigured) {
      return reply.code(400).send({ error: "Google Calendar is not configured." });
    }
    const nonce = randomBytes(16).toString("hex");
    reply.setCookie(OAUTH_STATE_COOKIE, nonce, oauthCookieOpts);
    return reply.redirect(googleAuthUrl(nonce));
  });

  // OAuth callback (top-level redirect from Google — session cookie travels).
  app.get("/api/integrations/google/callback", async (req, reply) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    const done = (status: string) => {
      reply.clearCookie(OAUTH_STATE_COOKIE, { path: oauthCookieOpts.path });
      return reply.redirect(`${config.APP_BASE_URL}/settings?google=${status}`);
    };
    if (error || !code) return done("error");

    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const expected = req.cookies[OAUTH_STATE_COOKIE];
    if (!state || !expected || !stateMatches(state, expected)) return done("error"); // CSRF

    try {
      const refreshToken = await exchangeCode(code);
      if (!refreshToken) return done("noret"); // no refresh token (already granted)
      await db.tenant.update({
        where: { id: auth.tenant.id },
        data: { googleRefreshToken: encryptSecret(refreshToken) },
      });
      await audit(auth.tenant.id, auth.user.id, "google.connect", "calendar");
      return done("connected");
    } catch (err) {
      console.error("[google] callback failed:", err);
      return done("error");
    }
  });

  app.delete("/api/integrations/google", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    await disconnectGoogle(auth.tenant.id);
    await audit(auth.tenant.id, auth.user.id, "google.disconnect", "calendar");
    return { ok: true };
  });
}
