/**
 * Dev simulator: chat with the agent in your terminal.
 * Runs the exact production path — inbound handler → debounced queue →
 * agent loop → tools → sender — only the WhatsApp transport is swapped
 * for stdout. Usage: npm run simulator
 *
 * Commands:  /lead   show the CRM record the AI has built
 *            /reset  start over with a fresh contact
 *            /quit   exit
 */
import readline from "node:readline";
import { config } from "./config.js";
import { db } from "./db.js";
import { ensureDevTenant } from "./devTenant.js";
import { handleInboundText } from "./inbound.js";
import { runAgentTurn } from "./agent/agent.js";
import { InMemoryDebouncedQueue, parseContactKey } from "./queue/queue.js";
import { ConsoleSender } from "./whatsapp/sender.js";

const SIM_PHONE_PREFIX = "sim-";

async function main() {
  if (!config.ANTHROPIC_API_KEY) {
    console.error(
      "ANTHROPIC_API_KEY is not set. Copy apps/api/.env.example to apps/api/.env and fill it in.",
    );
    process.exit(1);
  }

  const tenant = await ensureDevTenant();
  const sender = new ConsoleSender();
  // Short debounce so the chat feels responsive; send multiple lines quickly
  // to see message batching in action.
  const queue = new InMemoryDebouncedQueue(async (key) => {
    const { tenantId, contactId } = parseContactKey(key);
    await runAgentTurn(tenantId, contactId, sender);
  }, 1500);

  let phone = newSimPhone();
  console.log(`\nAzayon simulator — tenant: ${tenant.name}`);
  console.log(`You are customer ${phone}. Type a WhatsApp message. (/lead /reset /quit)\n`);

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.setPrompt("> ");
  rl.prompt();

  rl.on("line", async (line) => {
    const text = line.trim();
    if (!text) return rl.prompt();

    if (text === "/quit") {
      rl.close();
      return;
    }
    if (text === "/reset") {
      phone = newSimPhone();
      console.log(`New conversation as ${phone}.\n`);
      return rl.prompt();
    }
    if (text === "/lead") {
      const contact = await db.contact.findUnique({
        where: { tenantId_phone: { tenantId: tenant.id, phone } },
        include: { followUps: { where: { status: "scheduled" } } },
      });
      if (!contact) {
        console.log("(no lead record yet — send a message first)\n");
      } else {
        console.log(
          JSON.stringify(
            {
              name: contact.name,
              stage: contact.stage,
              source: contact.source,
              fields: JSON.parse(contact.fields),
              needsHuman: contact.needsHuman,
              optedOut: contact.optedOut,
              scheduledFollowUps: contact.followUps.map((f) => ({
                dueAt: f.dueAt,
                note: f.note,
              })),
            },
            null,
            2,
          ) + "\n",
        );
      }
      return rl.prompt();
    }

    try {
      await handleInboundText(queue, {
        tenantId: tenant.id,
        phone,
        text,
        source: "simulator",
      });
    } catch (err) {
      console.error("inbound failed:", err);
    }
    rl.prompt();
  });

  rl.on("close", async () => {
    await queue.idle();
    await db.$disconnect();
    process.exit(0);
  });
}

function newSimPhone(): string {
  return SIM_PHONE_PREFIX + Math.random().toString(36).slice(2, 8);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
