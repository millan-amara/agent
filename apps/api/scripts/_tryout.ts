/**
 * Scratch harness: drive the Azayon house profile through the real production path
 * (handleInboundText → debounced queue → runAgentTurn → tools → sender) and print
 * both the replies and the CRM record the agent built. Throwaway — delete when done.
 *
 *   npx tsx scripts/_tryout.ts
 */
import type { Contact, Tenant } from "@prisma/client";
import { db } from "../src/db.js";
import { handleInboundText } from "../src/inbound.js";
import { runAgentTurn } from "../src/agent/agent.js";
import { InMemoryDebouncedQueue, parseContactKey } from "../src/queue/queue.js";
import type { MessageSender } from "../src/whatsapp/sender.js";

const TENANT_ID = process.argv[2];
if (!TENANT_ID) throw new Error("usage: npx tsx scripts/_tryout.ts <tenantId>");

class CaptureSender implements MessageSender {
  async sendText(_t: Tenant, _c: Contact, text: string): Promise<string | null> {
    console.log(`\x1b[36m  AI ▸\x1b[0m ${text.replace(/\n/g, "\n       ")}`);
    return null;
  }
}

const sender = new CaptureSender();
const queue = new InMemoryDebouncedQueue(async (key) => {
  const { tenantId, contactId } = parseContactKey(key);
  await runAgentTurn(tenantId, contactId, sender);
}, 50);

async function conversation(
  label: string,
  phone: string,
  lines: string[],
  source?: string,
  opts: { quiet?: boolean } = {},
) {
  if (!opts.quiet) console.log(`\n\x1b[1m━━━ ${label} ━━━\x1b[0m`);

  // Start cold every run. Without this, a prior run leaves the contact aiPaused
  // (from an escalation) and mid-conversation, so the agent either says nothing or
  // resumes an old thread — and the test silently measures the wrong thing.
  const prior = await db.contact.findFirst({ where: { tenantId: TENANT_ID, phone } });
  if (prior) {
    await db.followUp.deleteMany({ where: { contactId: prior.id } });
    await db.message.deleteMany({ where: { contactId: prior.id } });
    await db.contact.delete({ where: { id: prior.id } });
  }

  for (const text of lines) {
    if (!opts.quiet) console.log(`\x1b[33m  👤 ▸\x1b[0m ${text}`);
    await handleInboundText(queue, {
      tenantId: TENANT_ID,
      phone,
      text,
      profileName: "Test Customer",
      ...(source ? { source } : {}),
    });
    await queue.idle();
  }

  const contact = await db.contact.findFirst({ where: { tenantId: TENANT_ID, phone } });
  if (!contact) return null;
  if (opts.quiet) return contact;
  const followUps = await db.followUp.findMany({ where: { contactId: contact.id } });
  console.log(`\n\x1b[32m  CRM:\x1b[0m stage=\x1b[1m${contact.stage}\x1b[0m  needsHuman=${contact.needsHuman}  aiPaused=${contact.aiPaused}  source=${contact.source ?? "-"}`);
  console.log(`  fields: ${JSON.stringify(JSON.parse(contact.fields || "{}"), null, 0)}`);
  console.log(`  follow-ups: ${followUps.length ? followUps.map((f) => `${f.status} in ~${Math.round((f.dueAt.getTime() - Date.now()) / 3.6e6)}h "${f.note}"`).join("; ") : "none"}`);
  return contact;
}

/** Escalation is the one failure that silently loses a lead — measure it, don't spot-check it. */
async function reliability(label: string, lines: string[], runs: number) {
  const results: boolean[] = [];
  for (let i = 0; i < runs; i++) {
    const c = await conversation(label, `sim-rel-${label}-${i}`, lines, undefined, { quiet: true });
    results.push(Boolean(c?.needsHuman));
  }
  const hits = results.filter(Boolean).length;
  const bar = results.map((r) => (r ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m")).join(" ");
  console.log(`  ${label.padEnd(10)} escalated ${hits}/${runs}   ${bar}`);
}

await conversation(
  "A. Cold ad click — salon owner (should qualify, not pitch; then recommend ONE plan)",
  "sim-tryout-a",
  [
    "Hi",
    "I run a salon in Ngong Road",
    "Maybe 60 or 70 people message us a week. My receptionist replies but she's slow, and honestly we forget some",
    "ok how much is it?",
  ],
  "ctwa:fb-salon-test",
);

await conversation(
  "B. Website inquiry (must NOT quote a number; must escalate)",
  "sim-tryout-b",
  [
    "hi do you guys build websites?",
    "yes i need a site for my hardware shop. maybe 5 pages, and people should be able to order online. how much will it cost me?",
  ],
);

await conversation(
  "C. Bot question + discount push + Swahili (honesty, no discount, language match)",
  "sim-tryout-c",
  [
    "wewe ni robot ama binadamu?",
    "sawa. naendesha gym Kasarani. mnaweza nipe discount? 3000 ni mingi",
  ],
);

console.log(`\n\x1b[1m━━━ Escalation reliability (needsHuman must be true) ━━━\x1b[0m`);
await reliability(
  "discount",
  ["naendesha gym Kasarani", "mnaweza nipe discount? 3000 ni mingi sana"],
  5,
);
await reliability(
  "website",
  ["do you build websites?", "5 pages for my hardware shop, with online ordering. how much?"],
  5,
);

await db.$disconnect();
process.exit(0);
