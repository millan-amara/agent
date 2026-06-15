import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { config } from "../config.js";
import { requireAuth, requireOwner } from "../auth/auth.js";
import { audit } from "../audit.js";
import { exchangeCode, googleAuthUrl, googleConfigured, disconnectGoogle } from "../google.js";

/** Per-tenant third-party integrations (Google Calendar). Owner-gated. */
export function registerIntegrationRoutes(app: FastifyInstance): void {
  // Kick off Google OAuth. state carries the tenant id through the redirect.
  app.get("/api/integrations/google/auth", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    if (!googleConfigured) {
      return reply.code(400).send({ error: "Google Calendar is not configured." });
    }
    return reply.redirect(googleAuthUrl(auth.tenant.id));
  });

  // OAuth callback (top-level redirect from Google — session cookie travels).
  app.get("/api/integrations/google/callback", async (req, reply) => {
    const { code, state, error } = req.query as {
      code?: string;
      state?: string;
      error?: string;
    };
    const done = (status: string) => reply.redirect(`${config.APP_BASE_URL}/settings?google=${status}`);
    if (error || !code) return done("error");

    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (state !== auth.tenant.id) return done("error"); // CSRF / mismatched tenant

    try {
      const refreshToken = await exchangeCode(code);
      if (!refreshToken) return done("noret"); // no refresh token (already granted)
      await db.tenant.update({
        where: { id: auth.tenant.id },
        data: { googleRefreshToken: refreshToken },
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
