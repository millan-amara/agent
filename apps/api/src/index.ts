import Fastify from "fastify";
import cookie from "@fastify/cookie";
import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { config, whatsappConfigured } from "./config.js";
import { runAgentTurn } from "./agent/agent.js";
import { registerApiRoutes } from "./api/routes.js";
import { registerAuthRoutes } from "./auth/routes.js";
import { ensureDevTenant } from "./devTenant.js";
import { startFollowUpWorker } from "./followups.js";
import { InMemoryDebouncedQueue, parseContactKey } from "./queue/queue.js";
import { registerWebhookRoutes } from "./whatsapp/webhook.js";
import { ConsoleSender, WhatsAppCloudSender } from "./whatsapp/sender.js";

async function main() {
  const sender = whatsappConfigured ? new WhatsAppCloudSender() : new ConsoleSender();
  if (!whatsappConfigured) {
    console.warn(
      "[boot] WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID not set — outbound messages print to console.",
    );
  }
  if (!config.ANTHROPIC_API_KEY) {
    console.warn("[boot] ANTHROPIC_API_KEY not set — agent turns will fail until it is.");
  }

  const queue = new InMemoryDebouncedQueue(async (key) => {
    const { tenantId, contactId } = parseContactKey(key);
    await runAgentTurn(tenantId, contactId, sender);
  }, config.DEBOUNCE_SECONDS * 1000);

  // Simulator traffic should feel instant; webhook traffic batches.
  const simQueue = new InMemoryDebouncedQueue(async (key) => {
    const { tenantId, contactId } = parseContactKey(key);
    await runAgentTurn(tenantId, contactId, sender);
  }, 1200);

  const tenant = await ensureDevTenant();
  console.log(`[boot] dev tenant ready: ${tenant.name} (${tenant.id})`);

  const app = Fastify({ logger: true });

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
    origin: true,
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(websocket);

  registerWebhookRoutes(app, queue);
  registerAuthRoutes(app);
  registerApiRoutes(app, sender, simQueue);
  app.get("/health", async () => ({ ok: true }));

  startFollowUpWorker(sender);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
