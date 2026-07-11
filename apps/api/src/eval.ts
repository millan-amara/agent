/**
 * Agent eval harness: runs scripted customer conversations against the real
 * agent loop and scores the behaviours the product is sold on, alongside the
 * measured LLM cost per conversation.
 *
 * This exists because prompt and model changes cannot be reviewed by reading
 * them. A prompt edit that looks harmless can silently stop the AI advancing
 * the pipeline, and a model swap can look free until you count the leads it
 * quietly failed to capture. Run this before and after any change to
 * REPLY_MODEL, FAST_MODEL, the system prompt, or the tool definitions.
 *
 * Usage:
 *   npm run eval                                  # all scenarios, 5 runs each
 *   K=10 npm run eval                             # 10 runs each
 *   REPLY_MODEL=claude-opus-4-8 npm run eval      # score a different model
 *   SCENARIO=booking-lead npm run eval            # one scenario
 *
 * Each run costs real tokens on ANTHROPIC_API_KEY. A full pass is cents, not
 * shillings, but it is not free — K defaults to 5 for that reason.
 */
import type { Contact, Tenant } from "@prisma/client";
import { config } from "./config.js";
import { db } from "./db.js";
import { usdFor, usdToKes } from "./costs.js";
import { ensureDevTenant } from "./devTenant.js";
import { handleInboundText } from "./inbound.js";
import { runAgentTurn } from "./agent/agent.js";
import { InMemoryDebouncedQueue, parseContactKey } from "./queue/queue.js";
import type { MessageSender } from "./whatsapp/sender.js";
import type { BusinessProfile } from "./agent/prompt.js";

/**
 * Swallows the outbound reply so the scoreboard stays readable. The agent
 * persists every reply to the DB before handing it to the sender, so the checks
 * still see exactly what the customer would have received.
 */
class SilentSender implements MessageSender {
  async sendText(): Promise<string | null> {
    return null;
  }
}

/** Everything a check can look at after a scenario has run. */
interface Outcome {
  contact: Contact;
  /** Every field on the lead record, as the CRM would show it. */
  fields: Record<string, unknown>;
  /** All AI replies concatenated, lowercased. */
  replies: string;
  /** Money figures the AI uttered, normalised ("KES 3,500" → "3500"). */
  quotedFigures: string[];
  stages: string[];
  /**
   * The agent loop threw on at least one turn — an API outage, an expired key,
   * an exhausted credit balance. runAgentTurn swallows these (it flags the
   * contact for review rather than ghosting the customer), so without this the
   * eval happily scores a dead API as a pass on any check that doesn't strictly
   * require a reply. A green eval during an outage is worse than no eval.
   */
  agentFailed: boolean;
}

interface Check {
  name: string;
  pass: (o: Outcome) => boolean;
}

interface Scenario {
  id: string;
  /** What a real customer sends, in order. */
  turns: string[];
  checks: Check[];
}

/**
 * A price the AI states that is neither one of the tenant's listed prices nor a
 * number the customer themselves said is, by definition, invented — the single
 * worst thing this agent can do to a business (see `neverSay` in the profile).
 */
const noInventedPrice = (allowed: Set<string>): Check => ({
  name: "never invented a price",
  pass: (o) => o.quotedFigures.every((f) => allowed.has(f)),
});

/**
 * The clinic's calendar has no Thursday availability in these scenarios, so any
 * Thursday time the AI offers was hallucinated. Guards the "never invent
 * availability" rule that booking tools exist to enforce.
 */
const noInventedAvailability: Check = {
  name: "never invented availability",
  pass: (o) => !/thursday[^.!?\n]{0,40}(\d{1,2}\s*(am|pm|:))/i.test(o.replies),
};

const SCENARIOS = (profile: BusinessProfile): Scenario[] => {
  // Listed prices are quotable; 8000 is the customer's own budget echoed back.
  const listed = new Set(
    (profile.services ?? []).flatMap((s) =>
      [...(s.price ?? "").matchAll(/[\d,]+/g)].map((m) => m[0].replace(/,/g, "")),
    ),
  );

  return [
    {
      // The core money path: a lead arrives, qualifies, and asks to book. The
      // business is paying us to have this end with a named, staged lead.
      id: "booking-lead",
      turns: [
        "Hi, what time do you close today?",
        "Great. I'd like to book an appointment for Thursday afternoon if you have space.",
        "My name is Wanjiru and my budget is around 8000. Can you sort that out for me?",
      ],
      checks: [
        {
          name: "captured the name",
          // Must land in the contact's NAME column — a name buried in a custom
          // field leaves the lead anonymous everywhere the owner actually looks.
          pass: (o) => (o.contact.name ?? "").toLowerCase().includes("wanjiru"),
        },
        {
          name: "captured the budget",
          // Models write "8000", "8,000", "~KES 8,000" — strip separators first.
          pass: (o) => JSON.stringify(o.fields).replace(/[,\s]/g, "").includes("8000"),
        },
        {
          name: "advanced the pipeline",
          // A customer who has asked to book is not a "New Lead" any more.
          // Leaving them there is what empties the kanban and the funnel.
          pass: (o) => o.contact.stage !== o.stages[0],
        },
        noInventedPrice(new Set([...listed, "8000"])),
        noInventedAvailability,
      ],
    },
    {
      // Price accuracy on a listed service. Getting this wrong costs the tenant
      // money directly, and it is the failure they will never forgive.
      id: "price-accuracy",
      turns: ["How much is a sports massage?"],
      checks: [
        {
          name: "quoted the correct price (4000)",
          pass: (o) => o.quotedFigures.includes("4000"),
        },
        noInventedPrice(listed),
      ],
    },
    {
      // Compliance. An opt-out that doesn't take is a regulatory problem and a
      // fast route to Meta restricting the tenant's number.
      id: "opt-out",
      turns: ["Hi, do you treat back pain?", "STOP"],
      checks: [
        { name: "honoured the opt-out", pass: (o) => o.contact.optedOut },
      ],
    },
  ];
};

/** Total USD spent by this tenant today, across every model. */
async function usdSpentToday(tenantId: string): Promise<number> {
  const day = new Date().toISOString().slice(0, 10);
  const rows = await db.usage.findMany({ where: { tenantId, day } });
  return rows.reduce((sum, r) => sum + usdFor(r.model, r), 0);
}

async function runOnce(
  tenant: Tenant,
  stages: string[],
  queue: InMemoryDebouncedQueue,
  scenario: Scenario,
  i: number,
): Promise<Outcome> {
  const phone = `sim-eval-${scenario.id}-${i}-${Math.floor(Math.random() * 1e6)}`;

  // Pre-create the contact as SIMULATED. handleInboundText does not set the flag,
  // and without it every eval conversation counts as a real billable one against
  // the tenant's plan cap — past which the agent silently stops replying and the
  // whole eval scores zero for reasons that have nothing to do with the change.
  await db.contact.create({
    data: { tenantId: tenant.id, phone, stage: stages[0]!, isSimulated: true, source: "eval" },
  });

  for (const text of scenario.turns) {
    await handleInboundText(queue, { tenantId: tenant.id, phone, text, source: "simulator" });
    await queue.idle();
  }

  const contact = await db.contact.findUniqueOrThrow({
    where: { tenantId_phone: { tenantId: tenant.id, phone } },
  });
  const msgs = await db.message.findMany({
    where: { tenantId: tenant.id, contactId: contact.id, direction: "out" },
    orderBy: { createdAt: "asc" },
  });
  const replies = msgs
    .filter((m) => m.author === "ai" && m.kind === "text")
    .map((m) => m.text)
    .join("\n")
    .toLowerCase();

  return {
    contact,
    fields: JSON.parse(contact.fields || "{}") as Record<string, unknown>,
    replies,
    quotedFigures: [...replies.matchAll(/(?:kes|ksh|sh)\s*([\d,]+)/gi)].map((m) =>
      m[1]!.replace(/,/g, ""),
    ),
    stages,
    // markTurnFailed() writes exactly this event when a turn throws.
    agentFailed: msgs.some((m) => m.text.startsWith("AI couldn't process this message")),
  };
}

async function main(): Promise<void> {
  if (!config.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set — nothing to evaluate.");
    process.exit(1);
  }

  const K = Number(process.env.K ?? 5);
  const only = process.env.SCENARIO;

  const tenant = await ensureDevTenant();
  const stages = JSON.parse(tenant.stages) as string[];
  const profile = JSON.parse(tenant.businessProfile) as BusinessProfile;
  const scenarios = SCENARIOS(profile).filter((s) => !only || s.id === only);

  if (scenarios.length === 0) {
    console.error(`No scenario matches SCENARIO=${only}`);
    process.exit(1);
  }

  const sender = new SilentSender();
  const queue = new InMemoryDebouncedQueue(async (key) => {
    const { tenantId, contactId } = parseContactKey(key);
    await runAgentTurn(tenantId, contactId, sender);
  }, 300);

  console.log(`\nEval — reply model: ${config.REPLY_MODEL}, ${K} run(s) each\n`);

  let failures = 0;

  for (const scenario of scenarios) {
    const before = await usdSpentToday(tenant.id);
    const outcomes: Outcome[] = [];

    for (let i = 0; i < K; i++) {
      const outcome = await runOnce(tenant, stages, queue, scenario, i);
      // Stop dead rather than score a broken agent. Whatever the checks would
      // say next is meaningless — and a passing scoreboard would be a lie.
      if (outcome.agentFailed) {
        console.error(
          `\n\n\x1b[31mAgent turn failed during "${scenario.id}" — the model call threw.\x1b[0m\n` +
            "Scroll up for the API error (an expired key, an exhausted credit balance,\n" +
            "or an outage will all land here). Eval aborted: these results mean nothing.\n",
        );
        await db.$disconnect();
        process.exit(1);
      }
      outcomes.push(outcome);
      process.stdout.write(".");
    }

    const spent = (await usdSpentToday(tenant.id)) - before;
    const kesPerConv = usdToKes(spent) / K;

    console.log(`\r\x1b[1m${scenario.id}\x1b[0m`);
    for (const check of scenario.checks) {
      const passed = outcomes.filter((o) => check.pass(o)).length;
      const ok = passed === K;
      if (!ok) failures++;
      console.log(
        `  ${ok ? "\x1b[32m✓\x1b[0m" : "\x1b[31m✗\x1b[0m"} ${check.name.padEnd(32)} ${passed}/${K}`,
      );
    }
    console.log(`    cost/conversation                KES ${kesPerConv.toFixed(2)}\n`);
  }

  console.log(
    failures === 0
      ? "\x1b[32mAll checks passed.\x1b[0m\n"
      : `\x1b[31m${failures} check(s) did not pass on every run.\x1b[0m\n`,
  );

  await db.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}

main().catch(async (err) => {
  console.error(err);
  await db.$disconnect();
  process.exit(1);
});
