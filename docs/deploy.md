# Deployment (Railway)

Production runs two services from this monorepo on **Railway**, backed by a
managed **Postgres** and **Redis** plugin. Local dev stays on SQLite + the
in-process queue (no Docker needed); production swaps both via env vars.

## Services

| Service | Build | Notes |
|---|---|---|
| `api` | `Dockerfile` (root) | Fastify API. Runs `prisma db push` on boot, then starts. Healthcheck `/health`. |
| `web` | `Dockerfile.web` (root) | Next.js standalone. Needs build arg `NEXT_PUBLIC_API_URL` = the api service URL. |
| Postgres | Railway plugin | Provides `DATABASE_URL`. |
| Redis | Railway plugin | Provides `REDIS_URL` → enables BullMQ queue + Redis pub/sub. |

## One-time setup

1. Create a Railway project; add **Postgres** and **Redis** plugins.
2. Create the **api** service from this repo. Railway reads `railway.json`
   (Dockerfile build, `/health` check). Set variables:
   - **Required at boot** (the API refuses to start in prod without these — see
     `config.ts`): `DATABASE_URL` (must be `postgres…`), `ANTHROPIC_API_KEY`,
     `WEB_ORIGIN` (the web service's public URL — locks CORS), and
     `NODE_ENV=production`.
   - `REDIS_URL` → reference the Redis plugin variable (enables BullMQ + pub/sub).
   - `APP_BASE_URL` → the web service's public URL (email links).
   - Connect-WhatsApp-time: `WA_*` (notably `WA_APP_SECRET` — until it's set,
     prod **rejects** inbound webhooks rather than trusting unsigned ones).
   - Optional providers: `GROQ_API_KEY`, `VOYAGE_API_KEY`, `RESEND_API_KEY`,
     `EMAIL_FROM`, `SENTRY_DSN`, Paystack/Meta/Google keys.
3. Create the **web** service: build with `Dockerfile.web`, set the build arg
   `NEXT_PUBLIC_API_URL` to the api service's public URL.
4. Generate a public domain for both services (Railway → Settings → Networking),
   or attach a custom domain.

## Webhooks (point at the stable api domain)

- **WhatsApp**: in the Meta app, set the callback to
  `https://<api-domain>/webhooks/whatsapp`, verify token = `WA_VERIFY_TOKEN`.
  Subscribe to fields: `messages` (covers inbound + delivery `statuses`),
  `message_template_status_update`, and `phone_number_quality_update`.
- **Paystack**: dashboard → Settings → Webhooks →
  `https://<api-domain>/webhooks/paystack`.

## Backups & monitoring

- Enable Railway Postgres automated backups (plugin settings).
- Set `SENTRY_DSN` to capture API errors and queue failures.

## Legacy-CRM data migration (one-time)

After the Postgres plugin exists and the api has booted once (so the schema is
applied), import the old MongoDB CRM's data:

1. Snapshot the source (read-only): `MONGO_URI=… node apps/api/scripts/_dump-mongo.cjs`
   → writes `apps/api/scripts/migration-data/*.json` (gitignored; real PII).
2. Dry-run the transform: `node apps/api/scripts/migrate-from-mongo.mjs --dry-run`.
3. Apply it against prod: `DATABASE_URL=<railway-postgres-public-url> node apps/api/scripts/migrate-from-mongo.mjs`.

The script is idempotent (deterministic `mig_*` ids), preserves bcrypt passwords
(verified + upgraded to scrypt on first login), and folds legacy deals onto
their contacts. See the `azayon-legacy-crm-migration` note for mapping details.

## Database

Pilot deploys apply the schema with `prisma db push` on boot (see the api
`Dockerfile` CMD). The committed `schema.prisma` uses `provider = "sqlite"` for
local dev; `apps/api/scripts/use-postgres.mjs` flips it to `postgresql` during
the Docker build. When the schema stabilises, generate a Postgres migration
baseline and switch the boot command to `prisma migrate deploy`.
