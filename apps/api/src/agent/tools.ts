import Anthropic from "@anthropic-ai/sdk";
import type { Contact, Tenant } from "@prisma/client";
import { db } from "../db.js";

export interface ToolContext {
  tenant: Tenant;
  contact: Contact;
  stages: string[];
}

export function buildTools(stages: string[]): Anthropic.Tool[] {
  return [
    {
      name: "update_lead",
      description:
        "Record or update what you have learned about this customer in the CRM. " +
        "Call this whenever you learn their name or a qualification detail " +
        "(interest, budget, area, timeline, condition, party size, etc.). " +
        "Only include fields you actually learned; existing data is merged, not replaced.",
      input_schema: {
        type: "object",
        properties: {
          name: { type: "string", description: "The customer's name, if learned" },
          fields: {
            type: "object",
            description:
              'Qualification details as key-value pairs, e.g. {"interest": "back pain treatment", "duration": "3 months"}',
          },
        },
      },
    },
    {
      name: "set_stage",
      description:
        "Move this lead to a different pipeline stage as the conversation progresses. " +
        "Call this when the customer's position in the sales process clearly changes " +
        "(e.g. they answered qualification questions, asked to book, or declined).",
      input_schema: {
        type: "object",
        properties: {
          stage: { type: "string", enum: stages, description: "The new pipeline stage" },
        },
        required: ["stage"],
      },
    },
    {
      name: "schedule_followup",
      description:
        "Schedule an automatic follow-up check-in with this customer. Call this when they show " +
        "interest but do not commit (e.g. 'I'll think about it', or they go quiet after hearing prices). " +
        "Do not tell the customer you scheduled it.",
      input_schema: {
        type: "object",
        properties: {
          due_in_hours: {
            type: "integer",
            description: "How many hours from now to follow up (e.g. 72 for 3 days)",
          },
          note: {
            type: "string",
            description:
              "Context for the future follow-up message, e.g. 'Interested in physio assessment for back pain, hesitant about price'",
          },
        },
        required: ["due_in_hours", "note"],
      },
    },
    {
      name: "escalate_to_human",
      description:
        "Flag this conversation for a human team member and pause your own replies. Call this when: " +
        "the customer explicitly asks for a person, they are upset, the request needs information or " +
        "authority you do not have, or you are not confident your answer is correct.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Why a human is needed, for the team's inbox" },
        },
        required: ["reason"],
      },
    },
    {
      name: "stop_messaging",
      description:
        "Mark this customer as opted out of all future messages. Call this when they ask to stop " +
        "receiving messages, say 'STOP', or clearly want no further contact.",
      input_schema: {
        type: "object",
        properties: {
          reason: { type: "string", description: "Brief note on the opt-out" },
        },
      },
    },
  ];
}

/** Writes a neutral timeline entry so the inbox shows what the AI did. */
async function logEvent(ctx: ToolContext, text: string): Promise<void> {
  await db.message.create({
    data: {
      tenantId: ctx.tenant.id,
      contactId: ctx.contact.id,
      direction: "out",
      author: "system",
      kind: "event",
      text,
    },
  });
}

export async function executeTool(
  ctx: ToolContext,
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  switch (name) {
    case "update_lead": {
      const data: { name?: string; fields?: string } = {};
      if (typeof input.name === "string" && input.name.trim()) data.name = input.name.trim();
      if (input.fields && typeof input.fields === "object") {
        const existing = JSON.parse(ctx.contact.fields) as Record<string, unknown>;
        data.fields = JSON.stringify({ ...existing, ...(input.fields as object) });
      }
      const updated = await db.contact.update({ where: { id: ctx.contact.id }, data });
      ctx.contact = updated;
      await logEvent(ctx, `AI updated lead${data.name ? ` (name: ${data.name})` : ""}`);
      return "Lead updated.";
    }
    case "set_stage": {
      const stage = String(input.stage ?? "");
      if (!ctx.stages.includes(stage)) {
        return `Error: "${stage}" is not a valid stage. Valid stages: ${ctx.stages.join(", ")}`;
      }
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { stage },
      });
      await logEvent(ctx, `AI moved lead to "${stage}"`);
      return `Stage set to ${stage}.`;
    }
    case "schedule_followup": {
      const hours = Number(input.due_in_hours);
      if (!Number.isFinite(hours) || hours <= 0) {
        return "Error: due_in_hours must be a positive number.";
      }
      const dueAt = new Date(Date.now() + hours * 3600_000);
      await db.followUp.create({
        data: {
          tenantId: ctx.tenant.id,
          contactId: ctx.contact.id,
          dueAt,
          note: String(input.note ?? ""),
        },
      });
      await logEvent(ctx, `Follow-up scheduled for ${dueAt.toLocaleString()}`);
      return `Follow-up scheduled in ${hours} hours.`;
    }
    case "escalate_to_human": {
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { needsHuman: true, aiPaused: true },
      });
      await logEvent(ctx, `Escalated to human: ${String(input.reason ?? "")}`);
      // Slice 2: push a real-time inbox notification here.
      console.log(
        `[escalation] tenant=${ctx.tenant.name} contact=${ctx.contact.phone}: ${String(input.reason ?? "")}`,
      );
      return "Escalated. A human has been notified and will take over after your reply.";
    }
    case "stop_messaging": {
      ctx.contact = await db.contact.update({
        where: { id: ctx.contact.id },
        data: { optedOut: true },
      });
      await db.followUp.updateMany({
        where: { contactId: ctx.contact.id, status: "scheduled" },
        data: { status: "canceled" },
      });
      await logEvent(ctx, "Customer opted out — all messaging stopped");
      return "Customer opted out. Send one final brief confirmation, nothing more.";
    }
    default:
      return `Error: unknown tool "${name}"`;
  }
}
