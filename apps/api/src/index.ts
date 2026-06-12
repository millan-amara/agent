import Fastify from "fastify";
import { config, whatsappConfigured } from "./config.js";
import { runAgentTurn } from "./agent/agent.js";
import { ensureDevTenant } from "./devTenant.js";
import { startFollowUpWorker } from "./followups.js";
import { InMemoryDebouncedQueue, parseContactKey } from "./queue/queue.js";
import { registerWebhookRoutes } from "./whatsapp/webhook.js";
import { ConsoleSender, WhatsAppCloudSender } from "./whatsapp/sender.js";

async function main() {
  const sender = whatsappConfigured ? new WhatsAppCloudSender() : new ConsoleSender();
  if (!whatsappConfigured) {
    console.warn(
      "[boot] WA_ACCESS_TOKEN / WA_PHONE_NUMBER_ID not set — outbound messages print to console. " +
        "Use `npm run simulator` for interactive testing.",
    );
  }
  if (!config.ANTHROPIC_API_KEY) {
    console.warn("[boot] ANTHROPIC_API_KEY not set — agent turns will fail until it is.");
  }

  const queue = new InMemoryDebouncedQueue(async (key) => {
    const { tenantId, contactId } = parseContactKey(key);
    await runAgentTurn(tenantId, contactId, sender);
  }, config.DEBOUNCE_SECONDS * 1000);

  const tenant = await ensureDevTenant();
  console.log(`[boot] dev tenant ready: ${tenant.name} (${tenant.id})`);

  const app = Fastify({ logger: true });
  // Keep the raw body for webhook signature verification.
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (_req, body, done) => {
    done(null, body);
  });

  registerWebhookRoutes(app, queue);
  app.get("/health", async () => ({ ok: true }));

  startFollowUpWorker(sender);

  await app.listen({ port: config.PORT, host: "0.0.0.0" });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
