import Anthropic from "@anthropic-ai/sdk";
import { config } from "./config.js";

/**
 * Describes an inbound image so the text-only agent loop can react to it.
 * Customers send photos of injuries, properties, products, receipts — a short
 * factual caption lets the AI acknowledge and qualify. Uses the cheap router
 * model; returns null when no key is set.
 */
const client = new Anthropic({ apiKey: config.ANTHROPIC_API_KEY, timeout: 30_000, maxRetries: 2 });

const SUPPORTED = new Set(["image/jpeg", "image/png", "image/gif", "image/webp"]);

export async function describeImage(bytes: Buffer, mimeType: string): Promise<string | null> {
  if (!config.ANTHROPIC_API_KEY) return null;
  if (!SUPPORTED.has(mimeType)) return null;

  const response = await client.messages.create({
    model: config.FAST_MODEL,
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mimeType as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
              data: bytes.toString("base64"),
            },
          },
          {
            type: "text",
            text: "Describe what this image shows in one short factual sentence, as context for a customer-service assistant. Do not greet or add commentary.",
          },
        ],
      },
    ],
  });

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join(" ")
    .trim();
  return text || null;
}
