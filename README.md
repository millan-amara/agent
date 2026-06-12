# Azayon

WhatsApp-first AI lead system for SMEs. Businesses connect their WhatsApp number; the AI auto-replies in their brand voice, qualifies leads, updates the CRM, schedules follow-ups, and hands off to humans.

Full product/architecture spec: [PLAN.md](PLAN.md). This repo currently implements **Slice 1**: the message loop — webhook → queue (per-contact ordering + debounce) → Claude agent with CRM tools → window-aware sender — plus a CLI simulator.

## Layout

```
apps/api          Fastify backend (TypeScript, ESM)
  prisma/         Schema — SQLite in dev, Postgres in production
  src/
    agent/        System-prompt builder, CRM tools, the agent loop
    whatsapp/     Cloud API webhook (verify + HMAC) and senders
    queue/        Debounced per-contact FIFO (in-memory dev driver)
    followups.ts  Due-follow-up worker (window-aware)
    simulator.ts  CLI chat against the real agent loop
```

## Setup

```sh
npm install
cp apps/api/.env.example apps/api/.env   # then set ANTHROPIC_API_KEY
npm run db:push -w apps/api              # creates apps/api/prisma/dev.db
```

## Run

**Simulator (no Meta credentials needed):**

```sh
npm run simulator
```

Chat as a customer of the seeded dev tenant (a Nairobi physio clinic). `/lead` shows the CRM record the AI builds as you talk; `/reset` starts a new customer.

**Server (webhook mode):**

```sh
npm run dev
```

Requires `WA_ACCESS_TOKEN`, `WA_PHONE_NUMBER_ID`, `WA_APP_SECRET` in `.env`, and the webhook URL (`/webhooks/whatsapp`) registered in the Meta app dashboard (use a tunnel like cloudflared/ngrok locally).

## Dev vs production

| Concern | Dev (this machine) | Production |
|---|---|---|
| DB | SQLite (`file:./dev.db`) | Postgres + tenant RLS |
| Queue | In-process debounced FIFO | BullMQ + Redis (same interface) |
| Outbound | Console / Cloud API | Cloud API + template messages |
| Tenancy | Hardcoded dev tenant | Embedded Signup onboarding |
