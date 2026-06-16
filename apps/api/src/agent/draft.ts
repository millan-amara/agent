import Anthropic from "@anthropic-ai/sdk";
import { config } from "../config.js";
import { recordUsage } from "./usage.js";

const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 });

const SYSTEM = `You help a small business owner in Kenya describe their business for an AI WhatsApp assistant that will answer their customers. Write a clear, warm 2-3 sentence description in the first person plural ("We…"). Say what they do, who they serve, and where if it's known. No marketing fluff, no emojis, no headings, no quotes — return only the description text the owner can edit.`;

/** Draft (or polish) a business description for the guided profile form. */
export async function draftBusinessDescription(opts: {
  tenantId: string;
  businessName: string;
  seed?: string;
}): Promise<string> {
  if (!config.ANTHROPIC_API_KEY) {
    throw new Error("AI drafting isn't configured on this server.");
  }
  const seed = (opts.seed ?? "").trim();
  const user = seed
    ? `Business name: ${opts.businessName}\nRough notes from the owner: ${seed.slice(0, 1500)}\n\nWrite the polished description.`
    : `Business name: ${opts.businessName}\n\nWrite a first-draft description they can edit.`;

  const res = await client.messages.create({
    model: config.REPLY_MODEL,
    max_tokens: 300,
    system: SYSTEM,
    messages: [{ role: "user", content: user }],
  });
  await recordUsage(opts.tenantId, config.REPLY_MODEL, res.usage);

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();
}
