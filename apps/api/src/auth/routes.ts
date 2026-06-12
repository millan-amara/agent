import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { getTemplate, TEMPLATES } from "../templates.js";
import { createSession, destroySession, hashPassword, requireAuth, verifyPassword } from "./auth.js";

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get("/api/templates", async () =>
    TEMPLATES.map((t) => ({ id: t.id, label: t.label, emoji: t.emoji, stages: t.stages })),
  );

  app.post("/api/auth/signup", async (req, reply) => {
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
    return { ok: true };
  });

  app.post("/api/auth/login", async (req, reply) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const user = email
      ? await db.user.findUnique({ where: { email: email.toLowerCase() } })
      : null;
    if (!user || !password || !(await verifyPassword(password, user.passwordHash))) {
      return reply.code(401).send({ error: "Wrong email or password." });
    }
    await createSession(reply, user.id);
    return { ok: true };
  });

  app.post("/api/auth/logout", async (req, reply) => {
    await destroySession(req, reply);
    return { ok: true };
  });

  app.get("/api/auth/me", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return {
      email: auth.user.email,
      tenant: {
        id: auth.tenant.id,
        name: auth.tenant.name,
        vertical: auth.tenant.vertical,
        onboarded: auth.tenant.onboarded,
        waConnected: Boolean(auth.tenant.waPhoneNumberId),
        stages: JSON.parse(auth.tenant.stages) as string[],
      },
    };
  });
}
