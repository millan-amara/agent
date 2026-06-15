import type { FastifyInstance } from "fastify";
import { randomBytes } from "node:crypto";
import { db } from "../db.js";
import { config } from "../config.js";
import { sendEmail } from "../email.js";
import { audit } from "../audit.js";
import { createAuthToken, hashPassword, requireAuth, requireOwner } from "../auth/auth.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Team management: list (any member), invite/remove (owner-only), audit log. */
export function registerTeamRoutes(app: FastifyInstance): void {
  // Visible to all members so assignment dropdowns can name teammates.
  app.get("/api/team", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const users = await db.user.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { createdAt: "asc" },
      select: { id: true, email: true, name: true, role: true, emailVerified: true, createdAt: true },
    });
    return users;
  });

  app.post("/api/team/invite", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { email, role } = req.body as { email?: string; role?: string };
    if (!email?.includes("@")) return reply.code(400).send({ error: "A valid email is required." });
    const normalized = email.toLowerCase();
    const existing = await db.user.findUnique({ where: { email: normalized } });
    if (existing) return reply.code(409).send({ error: "That email already has an account." });

    // Unusable random password until they set one via the invite link.
    const user = await db.user.create({
      data: {
        email: normalized,
        passwordHash: await hashPassword(randomBytes(24).toString("hex")),
        role: role === "owner" ? "owner" : "agent",
        tenantId: auth.tenant.id,
      },
    });
    const token = await createAuthToken(user.id, "reset", INVITE_TTL_MS);
    const link = `${config.APP_BASE_URL}/reset-password?token=${token}`;
    await sendEmail({
      to: normalized,
      subject: `You've been invited to ${auth.tenant.name} on Azayon`,
      html: `<p>${auth.user.email} invited you to help run <strong>${auth.tenant.name}</strong> on Azayon.</p><p><a href="${link}">Set your password to join</a></p><p>This link expires in 7 days.</p>`,
      text: `${auth.user.email} invited you to ${auth.tenant.name} on Azayon. Set your password: ${link}`,
    }).catch((err) => console.error("[team] invite email failed:", err));
    await audit(auth.tenant.id, auth.user.id, "team.invite", `${normalized} (${user.role})`);
    return { ok: true };
  });

  app.delete("/api/team/:userId", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { userId } = req.params as { userId: string };
    if (userId === auth.user.id) {
      return reply.code(400).send({ error: "You can't remove yourself." });
    }
    const target = await db.user.findFirst({ where: { id: userId, tenantId: auth.tenant.id } });
    if (!target) return reply.code(404).send({ error: "not found" });
    if (target.role === "owner") {
      const owners = await db.user.count({ where: { tenantId: auth.tenant.id, role: "owner" } });
      if (owners <= 1) return reply.code(400).send({ error: "Can't remove the last owner." });
    }
    // Unassign their conversations, then delete sessions + user.
    await db.contact.updateMany({
      where: { tenantId: auth.tenant.id, assignedUserId: userId },
      data: { assignedUserId: null },
    });
    await db.session.deleteMany({ where: { userId } });
    await db.authToken.deleteMany({ where: { userId } });
    await db.user.delete({ where: { id: userId } });
    await audit(auth.tenant.id, auth.user.id, "team.remove", target.email);
    return { ok: true };
  });

  app.get("/api/audit", async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const logs = await db.auditLog.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { createdAt: "desc" },
      take: 200,
    });
    const userIds = [...new Set(logs.map((l) => l.userId).filter(Boolean))] as string[];
    const users = await db.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, email: true },
    });
    const emailById = new Map(users.map((u) => [u.id, u.email]));
    return logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      actor: l.userId ? emailById.get(l.userId) ?? "removed user" : "system",
      createdAt: l.createdAt,
    }));
  });
}
