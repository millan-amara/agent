import "dotenv/config";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().default("file:./dev.db"),
  ANTHROPIC_API_KEY: z.string().optional(),
  WA_ACCESS_TOKEN: z.string().optional(),
  WA_PHONE_NUMBER_ID: z.string().optional(),
  WA_VERIFY_TOKEN: z.string().default("azayon-dev-verify"),
  WA_APP_SECRET: z.string().optional(),
  WA_WABA_ID: z.string().optional(),
  REPLY_MODEL: z.string().default("claude-opus-4-8"),
  ROUTER_MODEL: z.string().default("claude-haiku-4-5"),
  PORT: z.coerce.number().default(3001),
  DEBOUNCE_SECONDS: z.coerce.number().default(5),
});

export const config = schema.parse(process.env);

export const whatsappConfigured = Boolean(
  config.WA_ACCESS_TOKEN && config.WA_PHONE_NUMBER_ID,
);
