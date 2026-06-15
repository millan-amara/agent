/** Smoke test: full pipeline minus the model call (opt-out keyword path). Run: npx tsx src/smoke.ts */
import assert from "node:assert";
import { db } from "./db.js";
import { ensureDevTenant } from "./devTenant.js";
import { handleInboundText } from "./inbound.js";
import { runAgentTurn } from "./agent/agent.js";
import { InMemoryDebouncedQueue, parseContactKey } from "./queue/queue.js";
import { ConsoleSender } from "./whatsapp/sender.js";

const tenant = await ensureDevTenant();
const sender = new ConsoleSender();
const queue = new InMemoryDebouncedQueue(async (key) => {
  const { tenantId, contactId } = parseContactKey(key);
  await runAgentTurn(tenantId, contactId, sender);
}, 100);

const run = Date.now();
const phone = "smoke-" + run;
// wamids are globally unique — derive per-run so the test is repeatable.
const wamid1 = `wamid.smoke1.${run}`;
const wamid2 = `wamid.smoke2.${run}`;

// 1. Webhook redelivery is idempotent
await handleInboundText(queue, { tenantId: tenant.id, phone, text: "STOP", waMessageId: wamid1 });
await handleInboundText(queue, { tenantId: tenant.id, phone, text: "STOP", waMessageId: wamid1 });
await queue.idle();

const contact = await db.contact.findUniqueOrThrow({
  where: { tenantId_phone: { tenantId: tenant.id, phone } },
  include: { messages: true },
});

const inbound = contact.messages.filter((m) => m.direction === "in");
assert.equal(inbound.length, 1, "duplicate wamid must be stored once");

// 2. Opt-out keyword flows through agent turn → tool → DB
assert.equal(contact.optedOut, true, "contact must be opted out");
assert.ok(
  contact.messages.some((m) => m.author === "ai" && m.direction === "out"),
  "confirmation reply must be persisted",
);
assert.ok(
  contact.messages.some((m) => m.kind === "event"),
  "opt-out timeline event must be persisted",
);

// 3. Opted-out contacts never trigger another agent turn
await handleInboundText(queue, { tenantId: tenant.id, phone, text: "hello again", waMessageId: wamid2 });
await queue.idle();
const after = await db.message.count({
  where: { contactId: contact.id, direction: "out", author: "ai" },
});
assert.equal(after, 1, "no new AI reply after opt-out");

console.log("SMOKE OK");
await db.$disconnect();
