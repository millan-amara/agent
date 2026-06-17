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
  // Production infra (all optional — absence selects the in-process dev path).
  REDIS_URL: z.string().optional(),
  SENTRY_DSN: z.string().optional(),
  // CORS allow-list for the web app in production (defaults to permissive in dev).
  WEB_ORIGIN: z.string().optional(),
  // Public base URL of the web app — used to build email links (reset/verify).
  APP_BASE_URL: z.string().default("http://localhost:3000"),
  // External AI / email providers (features degrade gracefully when unset).
  GROQ_API_KEY: z.string().optional(),
  VOYAGE_API_KEY: z.string().optional(),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().default("Azayon <onboarding@azayon.app>"),
  // Internal cost dashboard. Set to enable /api/admin/costs (x-admin-token).
  ADMIN_TOKEN: z.string().optional(),
  // Key for at-rest encryption of per-tenant secrets (WhatsApp/Paystack/Google
  // creds). Any high-entropy string; SHA-256'd to a 32-byte AES key. Required in
  // production — see the fail-fast block below.
  SECRETS_ENCRYPTION_KEY: z.string().optional(),
  // USD→KES for internal cost reporting (rough; update as the rate moves).
  USD_TO_KES: z.coerce.number().default(130),

  // --- v2 billing: Azayon's OWN Paystack account (subscriptions), distinct
  // from each tenant's paystackSecretKey used to collect from THEIR customers.
  PAYSTACK_PLATFORM_SECRET: z.string().optional(),
  PAYSTACK_PLAN_STARTER: z.string().optional(), // Paystack plan code per tier
  PAYSTACK_PLAN_GROWTH: z.string().optional(),
  PAYSTACK_PLAN_PRO: z.string().optional(),

  // --- v2 Embedded Signup (Meta Tech Provider). Frontend needs the public ids.
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_CONFIG_ID: z.string().optional(),

  // --- v2 Google Calendar sync (per-tenant OAuth).
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().default("http://localhost:3001/api/integrations/google/callback"),
});

export const config = schema.parse(process.env);

export const isProd = process.env.NODE_ENV === "production";

// Fail fast in production rather than booting silently misconfigured (a missing
// key would otherwise surface as every agent turn failing, or — worse — a
// missing WEB_ORIGIN leaving CORS wide open, or a missing DATABASE_URL falling
// back to an ephemeral local SQLite file that vanishes on redeploy).
if (isProd) {
  const missing: string[] = [];
  if (!config.ANTHROPIC_API_KEY) missing.push("ANTHROPIC_API_KEY");
  if (!config.WEB_ORIGIN) missing.push("WEB_ORIGIN (CORS would otherwise be open to any origin)");
  if (!config.DATABASE_URL.startsWith("postgres")) {
    missing.push("DATABASE_URL (must be a postgresql:// URL in production)");
  }
  if (!config.SECRETS_ENCRYPTION_KEY) {
    missing.push("SECRETS_ENCRYPTION_KEY (tenant credentials would otherwise be stored unencrypted)");
  }
  // The verify token is the only thing guarding the public webhook-subscription
  // handshake; the in-repo default must never reach production.
  if (config.WA_VERIFY_TOKEN === "azayon-dev-verify") {
    missing.push("WA_VERIFY_TOKEN (must be changed from the public default)");
  }
  // WA_APP_SECRET is NOT required at boot — you may deploy before connecting
  // WhatsApp. It's enforced at the webhook layer instead: in prod, inbound
  // webhooks are rejected until the secret is set (see whatsapp/webhook.ts).
  if (missing.length) {
    throw new Error(
      `[config] Missing/invalid required production env vars:\n  - ${missing.join("\n  - ")}`,
    );
  }
}

export const whatsappConfigured = Boolean(
  config.WA_ACCESS_TOKEN && config.WA_PHONE_NUMBER_ID,
);
