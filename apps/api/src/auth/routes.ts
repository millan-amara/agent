import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { config } from "../config.js";
import { sendEmail } from "../email.js";
import { billingStatus } from "../billing.js";
import { getTemplate, TEMPLATES } from "../templates.js";
import {
  createAuthToken,
  consumeAuthToken,
  createSession,
  destroySession,
  hashPassword,
  isBcryptHash,
  requireAuth,
  verifyLogin,
  verifyPassword,
} from "./auth.js";

const RESET_TTL_MS = 60 * 60 * 1000; // 1h
const VERIFY_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7d

async function sendVerificationEmail(userId: string, email: string): Promise<void> {
  const token = await createAuthToken(userId, "verify", VERIFY_TTL_MS);
  const link = `${config.APP_BASE_URL}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Verify your Azayon email",
    html: `<p>Welcome to Azayon! Confirm your email to secure your account:</p><p><a href="${link}">Verify my email</a></p><p>This link expires in 7 days.</p>`,
    text: `Welcome to Azayon! Verify your email: ${link}`,
  }).catch((err) => console.error("[auth] verification email failed:", err));
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/templates", async () =>
    TEMPLATES.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, stages: t.stages })),
  );

  // Tight per-IP limits on the unauthenticated credential endpoints to blunt
  // brute-force / enumeration / email-bombing. Generous enough for real users.
  const authLimit = (max: number) => ({ config: { rateLimit: { max, timeWindow: "1 minute" } } });

  app.post("/api/auth/signup", authLimit(5), async (req, reply) => {
    const { email, password, businessName, vertical } = req.body as {
      email?: string;
      password?: string;
      businessName?: string;
      vertical?: string;
    };
    if (!email?.includes("@") || !password || password.length < 8 || !businessName?.trim()) {
      return reply.code(400).send({
        error: "Valid email, a password of at least 8 characters, and a business name are required.",
      });
    }
    const existing = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (existing) return reply.code(409).send({ error: "An account with this email already exists." });

    const template = getTemplate(vertical ?? "general");
    const tenant = await db.tenant.create({
      data: {
        name: businessName.trim(),
        vertical: template.id,
        businessProfile: JSON.stringify(template.profile),
        stages: JSON.stringify(template.stages),
        trialEndsAt: new Date(Date.now() + 14 * 86_400_000),
      },
    });
    const user = await db.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash: await hashPassword(password),
        tenantId: tenant.id,
      },
    });
    await createSession(reply, user.id);
    await sendVerificationEmail(user.id, user.email);
    return { ok: true };
  });

  // Forgot password: always returns ok (don't leak which emails exist).
  app.post("/api/auth/forgot", authLimit(5), async (req, reply) => {
    const { email } = req.body as { email?: string };
    if (!email?.includes("@")) return reply.code(400).send({ error: "A valid email is required." });
    const user = await db.user.findUnique({ where: { email: email.toLowerCase() } });
    if (user) {
      const token = await createAuthToken(user.id, "reset", RESET_TTL_MS);
      const link = `${config.APP_BASE_URL}/reset-password?token=${token}`;
      await sendEmail({
        to: user.email,
        subject: "Reset your Azayon password",
        html: `<p>We received a request to reset your password.</p><p><a href="${link}">Reset my password</a></p><p>This link expires in 1 hour. If you didn't ask for this, ignore this email.</p>`,
        text: `Reset your Azayon password: ${link} (expires in 1 hour)`,
      }).catch((err) => console.error("[auth] reset email failed:", err));
    }
    return { ok: true };
  });

  // Reset password using a token from the email link.
  app.post("/api/auth/reset", authLimit(10), async (req, reply) => {
    const { token, password } = req.body as { token?: string; password?: string };
    if (!token || !password || password.length < 8) {
      return reply.code(400).send({ error: "A valid token and an 8+ character password are required." });
    }
    const userId = await consumeAuthToken(token, "reset");
    if (!userId) return reply.code(400).send({ error: "This reset link is invalid or has expired." });
    await db.user.update({
      where: { id: userId },
      data: { passwordHash: await hashPassword(password) },
    });
    // Reset proves email control — mark verified and invalidate other sessions.
    await db.user.update({ where: { id: userId }, data: { emailVerified: true } });
    await db.session.deleteMany({ where: { userId } });
    return { ok: true };
  });

  // Confirm email ownership from the verification link.
  app.post("/api/auth/verify-email", authLimit(10), async (req, reply) => {
    const { token } = req.body as { token?: string };
    if (!token) return reply.code(400).send({ error: "A token is required." });
    const userId = await consumeAuthToken(token, "verify");
    if (!userId) return reply.code(400).send({ error: "This verification link is invalid or has expired." });
    await db.user.update({ where: { id: userId }, data: { emailVerified: true } });
    return { ok: true };
  });

  // Resend the verification email to the logged-in user.
  app.post("/api/auth/resend-verification", authLimit(5), async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    if (auth.user.emailVerified) return { ok: true };
    await sendVerificationEmail(auth.user.id, auth.user.email);
    return { ok: true };
  });

  app.post("/api/auth/login", authLimit(10), async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const user = email
      ? await db.user.findUnique({ where: { email: email.toLowerCase() } })
      : null;
    // verifyLogin runs scrypt even when the email is unknown, so timing doesn't
    // reveal whether an account exists.
    const ok = await verifyLogin(password ?? "", user?.passwordHash ?? null);
    if (!user || !password || !ok) {
      return reply.code(401).send({ error: "Wrong email or password." });
    }
    // Migrated legacy account still on bcrypt — upgrade to scrypt now that we
    // have the plaintext. One-time, transparent; subsequent logins are scrypt.
    if (isBcryptHash(user.passwordHash)) {
      await db.user.update({
        where: { id: user.id },
        data: { passwordHash: await hashPassword(password) },
      });
    }
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.post("/api/auth/password", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { current, next } = req.body as { current?: string; next?: string };
    if (!next || next.length < 8) {
      return reply.code(400).send({ error: "New password must be at least 8 characters." });
    }
    if (!current || !(await verifyPassword(current, auth.user.passwordHash))) {
      return reply.code(401).send({ error: "Current password is wrong." });
    }
    await db.user.update({
      where: { id: auth.user.id },
      data: { passwordHash: await hashPassword(next) },
    });
    return { ok: true };
  });

  app.put("/api/auth/locale", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const { locale } = req.body as { locale?: string };
    const next = locale === "sw" ? "sw" : "en";
    await db.user.update({ where: { id: auth.user.id }, data: { locale: next } });
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return {
      email: auth.user.email,
      emailVerified: auth.user.emailVerified,
      role: auth.user.role,
      locale: auth.user.locale,
      tenant: {
        id: auth.tenant.id,
        name: auth.tenant.name,
        vertical: auth.tenant.vertical,
        onboarded: auth.tenant.onboarded,
        waConnected: Boolean(auth.tenant.waPhoneNumberId),
        stages: JSON.parse(auth.tenant.stages) as string[],
        billing: await billingStatus(auth.tenant),
      },
    };
  });
}
