import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import multipart from "@fastify/multipart";
import rateLimit from "@fastify/rate-limit";
import * as Sentry from "@sentry/node";
import { config, whatsappConfigured, isProd } from "./config.js";
import { runAgentTurn } from "./agent/agent.js";
import { registerApiRoutes } from "./api/routes.js";
import { registerDashboardRoutes } from "./api/dashboard.js";
import { registerBillingRoutes } from "./api/billing.js";
import { registerTeamRoutes } from "./api/team.js";
import { registerIntegrationRoutes } from "./api/integrations.js";
import { registerBroadcastRoutes } from "./api/broadcasts.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { ensureDevTenant } from "./devTenant.js";
import { startFollowUpWorker } from "./followups.js";
import { InMemoryDebouncedQueue, parseContactKey, type QueueDriver } from "./queue/queue.js";
import { BullMqQueue } from "./queue/bullmq.js";
import { redisEnabled } from "./redis.js";
import { registerWebhookRoutes } from "./whatsapp/webhook.js";
import { ConsoleSender, WhatsAppCloudSender } from "./whatsapp/sender.js";

if (config.SENTRY_DSN) {
  Sentry.init({ dsn: config.SENTRY_DSN, tracesSampleRate: 0.1 });
}

// A stray rejection or thrown error must not silently kill the process (Node may
// exit on an unhandled rejection) or crash-loop on Railway with nothing logged.
// Capture, log, and keep serving — the per-turn try/catch already isolates the
// message loop, so these are genuinely unexpected.
process.on("unhandledRejection", (reason) => {
  console.error("[fatal] unhandledRejection:", reason);
  Sentry.captureException(reason);
});
process.on("uncaughtException", (err) => {
  console.error("[fatal] uncaughtException:", err);
  Sentry.captureException(err);
});

async function main() {
  // In production always use the real Cloud API sender: tenants carry their own
  // per-tenant token + phone number (set via Settings → connect WhatsApp), so the
  // env-level `whatsappConfigured` gate (a Slice-1 single-tenant holdover) must
  // not force the console sender and silently drop replies. The console sender is
  // only for the local CLI/dev simulator.
  const useRealSender = whatsappConfigured || isProd;
  const sender = useRealSender ? new WhatsAppCloudSender() : new ConsoleSender();
  if (!useRealSender) {
    console.warn(
      "[boot] WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID not set — outbound messages print to console.",
    );
  }
  if (!config.ANTHROPIC_API_KEY) {
    console.warn("[boot] ANTHROPIC_API_KEY not set — agent turns will fail until it is.");
  }
  console.log(
    `[boot] queue/events driver: ${redisEnabled ? "Redis (BullMQ + pub/sub)" : "in-process"}`,
  );

  // Same handler for both queues; the driver differs by environment (Redis in
  // prod, in-process in dev). Simulator traffic batches faster than webhook.
  const runTurn = (debounceMs: number, name: string): QueueDriver => {
    const handler = async (key: string) => {
      const { tenantId, contactId } = parseContactKey(key);
      await runAgentTurn(tenantId, contactId, sender);
    };
    return redisEnabled
      ? new BullMqQueue(handler, debounceMs, name)
      : new InMemoryDebouncedQueue(handler, debounceMs);
  };

  const queue = runTurn(config.DEBOUNCE_SECONDS * 1000, "agent-turns");
  const simQueue = runTurn(1200, "agent-turns-sim");

  const tenant = await ensureDevTenant();
  console.log(`[boot] dev tenant ready: ${tenant.name} (${tenant.id})`);

  // trustProxy: Railway terminates TLS at its edge proxy, so the real client IP
  // is in X-Forwarded-For. Without this, req.ip is the proxy and per-IP rate
  // limiting would bucket every visitor together.
  const app = Fastify({ logger: true, trustProxy: true });

  // Webhook signature verification needs the raw bytes; everything else wants
  // parsed JSON. Route on the URL inside the parser.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (req, body, done) => {
    if (req.url.startsWith("/webhooks/")) return done(null, body);
    try {
      done(null, body.length ? JSON.parse(body.toString("utf8")) : {});
    } catch (err) {
      done(err as Error, undefined);
    }
  });

  await app.register(cookie);
  await app.register(cors, {
    // Permissive in dev; locked to the web origin in prod when WEB_ORIGIN is set.
    origin: config.WEB_ORIGIN ? config.WEB_ORIGIN.split(",").map((o) => o.trim()) : true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(websocket);
  // Knowledge-base file uploads (.txt/.md). 2 MB ceiling.
  await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 } });
  // Opt-in rate limiting (global:false) — applied per-route on the auth
  // endpoints to blunt credential brute-force; webhooks stay unthrottled since
  // Meta/Paystack legitimately burst.
  await app.register(rateLimit, { global: false });

  // Always register an error handler so a thrown route error returns a generic
  // 500 instead of leaking a stack trace; report to Sentry when configured.
  app.setErrorHandler((err, _req, reply) => {
    const status = (err as { statusCode?: number }).statusCode ?? 500;
    if (status >= 500) {
      app.log.error(err);
      if (config.SENTRY_DSN) Sentry.captureException(err);
    }
    // Preserve client-error messages (4xx); hide internal details on 5xx.
    const message = err instanceof Error ? err.message : "Error";
    reply.code(status).send({ error: status >= 500 ? "Internal error" : message });
  });

  registerWebhookRoutes(app, queue);
  registerAuthRoutes(app);
  registerApiRoutes(app, sender, simQueue);
  registerDashboardRoutes(app);
  registerBillingRoutes(app);
  registerTeamRoutes(app);
  registerIntegrationRoutes(app);
  registerBroadcastRoutes(app);
  app.get("/health", async () => ({ ok: true }));

  startFollowUpWorker(sender);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });

  // Railway sends SIGTERM on every redeploy; drain in-flight requests instead of
  // dropping them mid-flight. (BullMQ jobs are durable in Redis and re-run.)
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`[shutdown] ${signal} received — closing server...`);
    try {
      await app.close();
    } catch (err) {
      console.error("[shutdown] error during close:", err);
    } finally {
      process.exit(0);
    }
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
