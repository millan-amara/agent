import type { FastifyInstance } from "fastify";
import { db } from "../db.js";
import { requireAuth, requireOwner } from "../auth/auth.js";
import { audit } from "../audit.js";
import { resolveRecipients, runBroadcast, qualityBlocksBroadcast, type Segment } from "../broadcasts.js";

/** Template campaigns to segments. Creating a broadcast is owner-only. */
export function registerBroadcastRoutes(app: FastifyInstance): void {
  app.get("/api/broadcasts", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    return db.broadcast.findMany({
      where: { tenantId: auth.tenant.id },
      orderBy: { createdAt: "desc" },
      take: 50,
    });
  });

  app.post("/api/broadcasts/preview", async (req, reply) => {
    const auth = await requireAuth(req, reply);
    if (!auth) return;
    const segment = (req.body as { segment?: Segment }).segment ?? {};
    const recipients = await resolveRecipients(auth.tenant.id, segment);
    return { count: recipients.length };
  });

  // Fan-out send — rate-limit to bound abuse / accidental campaign storms.
  app.post(
    "/api/broadcasts",
    { config: { rateLimit: { max: 5, timeWindow: "1 minute" } } },
    async (req, reply) => {
    const auth = await requireOwner(req, reply);
    if (!auth) return;
    const { templateId, segment } = req.body as { templateId?: string; segment?: Segment };
    if (!templateId) return reply.code(400).send({ error: "Pick an approved template." });
    if (qualityBlocksBroadcast(auth.tenant)) {
      return reply.code(409).send({
        error: "Your WhatsApp quality rating is RED — broadcasting is paused to protect your number.",
      });
    }
    const template = await db.template.findFirst({
      where: { id: templateId, tenantId: auth.tenant.id, status: "approved" },
    });
    if (!template) return reply.code(400).send({ error: "That template isn't approved yet." });

    const recipients = await resolveRecipients(auth.tenant.id, segment ?? {});
    if (recipients.length === 0) {
      return reply.code(400).send({ error: "No recipients match that segment." });
    }
    const broadcast = await db.broadcast.create({
      data: {
        tenantId: auth.tenant.id,
        templateId,
        segment: JSON.stringify(segment ?? {}),
        status: "sending",
        total: recipients.length,
      },
    });
    await audit(
      auth.tenant.id,
      auth.user.id,
      "broadcast.start",
      `${template.name} → ${recipients.length} recipients`,
    );
    // Fire-and-forget; progress is polled via GET /api/broadcasts.
    void runBroadcast(broadcast.id).catch((err) => console.error("[broadcast] run failed:", err));
    return broadcast;
  });
}
