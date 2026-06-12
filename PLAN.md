# Azayon — WhatsApp-First AI Lead System (SaaS)

**One-liner:** Businesses connect their WhatsApp number, give the AI instructions in their brand voice, and it auto-replies to customers — qualifying leads, updating the CRM, scheduling follow-ups, and handing off to humans when needed.

**Market:** Kenya first. Multi-vertical (clinics, real estate, restaurants, schools, gyms, service businesses) via a vertical-agnostic core + per-vertical templates.

**Model:** SaaS. Self-serve onboarding. No agency work.

---

## 1. Core product principles

1. **WhatsApp is the center.** Everything else (CRM, pipeline, automations) exists to support the conversation. The CRM is almost invisible — the owner's home screen is conversations, needs-follow-up, today's appointments, potential revenue.
2. **Templates, not a blank canvas.** The engine is vertical-agnostic. Verticals are pre-built templates: agent instructions, qualification questions, pipeline stages, follow-up sequences, suggested WhatsApp message templates. A new tenant picks "Clinic" or "Real Estate" (or "General") and is 80% configured.
3. **Time-to-value under 15 minutes.** A tenant must see the AI answering on their own number (or in a test simulator) in their first session, or they churn before paying.
4. **The human can always take over.** Per-conversation AI pause/resume. This is the #1 trust feature — businesses will not hand their customers to an AI they can't override.
5. **Compliance is product, not an afterthought.** The 24-hour window, template approvals, opt-outs, and quality-rating protection are built into the messaging layer so tenants can't accidentally get their number restricted.

---

## 2. MVP scope (Phase 1)

### In scope

| Area | What it does |
|---|---|
| **Onboarding** | Sign up → pick vertical template → connect WhatsApp via Meta **Embedded Signup** (Cloud API, tenant's own WABA) → customize AI instructions → test in simulator → go live |
| **AI agent** | Per-tenant system prompt (built from a guided form: business info, tone/brand voice, services, prices, FAQs) + knowledge base (uploaded docs/FAQ → RAG). Auto-reply toggle (global, per-hours, per-conversation). Tool use: `update_lead`, `set_stage`, `schedule_followup`, `escalate_to_human`, `stop_messaging` |
| **Inbox** | Real-time shared team inbox. Conversation timeline (messages, notes, AI actions). Takeover button (pauses AI). Assign to teammate |
| **CRM-lite** | Contacts auto-created from inbound messages. Standard fields + per-tenant custom fields (the AI fills them during qualification). Kanban pipeline with per-tenant stages; AI moves leads automatically, humans drag-and-drop |
| **Follow-ups** | Scheduled sequences (e.g., no reply after 1/3/7 days). **Window-aware:** inside 24h window → free-form AI message; outside → approved template message. Auto-stop on reply or opt-out |
| **Lead source tracking** | Click-to-WhatsApp ad referral data (`ctwa_clid`, ad headline) captured from the webhook → lead source attribution for free. Per-source conversion stats |
| **Dashboard** | Conversations, 🔥 needs follow-up, today's appointments, potential revenue, leads-by-source funnel |
| **Automations (simple)** | Trigger → action: "lead enters stage X → send template Y / notify owner / create task." A fixed menu, not a node builder |
| **Scheduling** | Internal booking calendar (per-tenant availability slots) + Google Calendar sync. AI offers slots in-chat, books, sends reminders (window-aware). `book_appointment` agent tool |
| **Payments (in-chat)** | Invoices + payment collection inside the conversation via **Paystack** (M-Pesa STK push + card). AI generates invoice → sends pay link/STK push → webhook marks Paid → pipeline stage updates. `create_invoice` agent tool |
| **Billing** | Paystack (M-Pesa + card) for Azayon subscriptions. Tiered plans by active conversations/month. Usage metering per tenant |
| **Template manager** | Create WhatsApp template messages, submit to Meta for approval, track status — surfaced in-product because follow-ups depend on it |

### Explicitly out of MVP (later phases)

- **Phase 2 — Channels:** email sequences, SMS fallback (Africa's Talking), Meta Ads management integration, Outlook Calendar.
- **Phase 3 — AI workforce:** voice agents, AI sales reps, AI receptionists, multi-number support.

---

## 3. Architecture

### Stack (recommended)

- **Backend:** TypeScript + NestJS (or Fastify). One codebase, modular monolith — do NOT start with microservices.
- **Frontend:** Next.js + Tailwind. Mobile-first responsive — Kenyan SME owners will run this from their phones.
- **DB:** Postgres (single DB, `tenant_id` on every row + row-level security). `pgvector` for the knowledge-base RAG.
- **Queue:** Redis + BullMQ. All webhook processing, AI calls, and outbound sends go through queues.
- **Real-time:** WebSockets (inbox updates).
- **LLM:** provider-agnostic adapter. Tiered: small/cheap model for routing & classification (is this a new lead? FAQ? opt-out?), stronger model for customer-facing replies and tool use. Per-tenant token metering from day one.
- **Hosting:** anything with EU/closest-region + low ops burden (Railway/Render/Fly to start; don't burn weeks on Kubernetes).

### The message loop (the heart of the product)

```
WhatsApp webhook (must 200 in <~5s)
  → enqueue raw event (idempotent: dedupe on wamid)
  → per-conversation FIFO worker:
      load tenant config + conversation history + lead record + KB chunks
      → router model: opt-out? handoff requested? AI paused? human assigned?
      → reply model with tools:
          send reply (respecting 24h window)
          update_lead / set_stage / schedule_followup / escalate_to_human
      → persist everything, emit inbox event
```

Non-negotiables in this loop:
- **Idempotency** (Meta redelivers webhooks) — dedupe on message ID.
- **Per-conversation ordering** — replies out of order destroy trust.
- **Debounce/batching** — humans send 3 short messages in a row; wait ~5–10s of silence before the AI responds to the batch, not to each fragment.
- **Hard guardrails:** never invent prices or availability (answer only from tenant KB), escalate on low confidence, honor "STOP"/opt-out instantly, configurable max messages per lead per day.

### Multi-tenancy & WhatsApp connection

- Azayon registers as a **Meta Tech Provider** → tenants connect their own WhatsApp Business Account via **Embedded Signup** (OAuth-style popup). Their number, our platform. This is the critical-path integration — start Meta business verification **immediately**; it can take weeks.
- One WABA per tenant. Store and monitor each tenant's **quality rating** and messaging limits; throttle and alert before Meta does.

---

## 4. Key design factors

1. **24-hour window drives everything outbound.** Free-form AI messages only inside the window. All follow-up sequences outside it must use approved utility templates (utility templates ≈ cheaper and easier to approve than marketing ones — design the default sequences as utility-style "about your inquiry" messages). The product must make it impossible for a tenant to schedule a non-compliant send.
2. **Brand voice = structured prompt, not free text.** Guided fields (tone slider, language(s) — English/Swahili/Sheng mix matters in Kenya, greeting style, emoji usage, things never to say) compiled into the system prompt. Free-text "custom instructions" box as an advanced option, sandboxed under the guardrails.
3. **Test simulator before go-live.** In-app chat that runs the exact agent loop without touching WhatsApp. Tenants iterate on instructions safely; this is also your demo/sales tool.
4. **Handoff states per conversation:** `ai_active` → `human_active` (AI paused) → `ai_active` again. Plus business-hours awareness ("a human will reply in the morning" vs. silently failing at night).
5. **Economics metering from day one.** Track per tenant: Meta conversation fees incurred, LLM tokens, messages sent. Price plans so worst-case usage still has margin; surface usage to the tenant (also builds trust).
6. **Kenya Data Protection Act (2019):** register with ODPC as data processor/controller, per-tenant data export & deletion, retention policy, PII encryption at rest. Health-adjacent verticals (clinics) make this real, not theoretical.
7. **Churn defense = ROI visibility.** The dashboard must answer "what did this make me this month?" — leads captured, leads recovered by follow-ups, booked appointments, attributed revenue. A tenant who sees "KES 300,000 potential revenue from 12 recovered leads" does not cancel.
8. **Swahili/English code-switching** in both the AI and the UI copy. The models handle it; make sure prompts and templates do too.

---

## 5. UI / design direction

**Identity: "WhatsApp-native business cockpit."** Calm, high-trust operations dashboard — not a flashy AI SaaS. Inbox first, CRM second. The owner should instantly see: who needs a reply, which leads are hot, what the AI did, whether compliance is safe, how much business was generated.

### Design system

- **Font:** Inter (weights: titles/headings/buttons 600, labels 500, body 400). Tabular numerals (`tnum`) for KES amounts, phone numbers, stats.
- **Palette:** teal primary shifted a step off WhatsApp's exact hue (avoid Meta trade-dress lookalike); dark teal `#075E54`-range for text/buttons on white (contrast AA). Amber accent **reserved exclusively for "needs your attention now"** (follow-ups due, escalations). Window status / template state = neutral gray pills. Revenue = strong dark text, no color. Mostly white surfaces, soft gray background `#F7F9F8`, thin borders (`#DDE5E1`) over shadows, 6–8px radii. Success `#22A06B`, warning `#D97706`, danger `#DC2626`. No dark mode in MVP.
- **Copy:** plain, confident, non-technical. "Tell Azayon how to reply," not "Configure autonomous agent behavior." "Use an approved template to message this customer," not "compliance window expired." UI strings externalized (i18n-ready) from day one; English default, Swahili later.

### Layout — mobile is the primary product

Design mobile first (mid-range Android, 4G): bottom nav **Inbox / Pipeline / Contacts / More**; lead details = slide-up sheet over the chat. Desktop expands to three columns (conversations | chat timeline | lead panel: AI state, stage, next follow-up, appointment/payment). Performance budget: light JS, skeleton states, lists fast at thousands of conversations.

Three modes:
1. **Inbox** (the heart) — chat UI familiar but not a WhatsApp clone; subtle green outgoing, white incoming; **AI actions as visually distinct neutral timeline entries** ("AI moved lead to Interested", "Follow-up scheduled tomorrow 9:00").
2. **Pipeline** — kanban, compact cards: name, source, last message, value, next action.
3. **Dashboard** — few numbers, no chart clutter: new conversations, leads qualified, appointments booked, follow-ups recovered, potential revenue, WhatsApp health.

### Trust & activation details

- **AI state glanceable everywhere:** per-conversation pill (AI / Paused / Human) on every inbox row + one-tap takeover in the chat header. Takeover must feel like a light switch.
- **Onboarding = guided checklist**, not a form: business type → details → AI tone → connect WhatsApp → simulator → go live. Each step 2–3 min; simulator is the aha moment.
- **Empty states teach:** new tenants have zero data — every empty screen points to the next activation step ("No conversations yet — try the simulator").

## 6. Build order (suggested)

1. **Week 0:** Start Meta business verification + Tech Provider application (longest external dependency). Set up repo, CI, Postgres, queue skeleton.
2. **Slice 1 — the loop on one number:** Cloud API on a test number → webhook → queue → agent loop with tools → reply. Hardcoded single tenant. *This proves the product.*
3. **Slice 2 — inbox + CRM-lite:** real-time inbox, contacts, pipeline, AI tool calls visibly updating both.
4. **Slice 3 — multi-tenancy + onboarding:** auth, tenant isolation, embedded signup, vertical templates, prompt builder, simulator.
5. **Slice 4 — follow-ups + templates:** scheduler, window-aware sending, template manager + Meta approval flow, opt-outs.
6. **Slice 5 — scheduling + payments:** booking calendar + Google Calendar sync, `book_appointment` tool, reminders; Paystack integration (STK push + cards), `create_invoice` tool, payment webhooks → pipeline updates.
7. **Slice 6 — billing + dashboard:** Paystack subscriptions, usage metering, ROI dashboard.
8. **Pilot:** 3–5 hand-picked businesses (different verticals) free/discounted. Their confusion = your backlog. Then public launch.

---

## 7. Roadmap beyond MVP

### v1.5 — Pilot-ready hardening (before charging anyone)

- **Production deployment:** real hosting + domain (stable webhook URL replaces dev tunnel), Postgres migration, BullMQ/Redis queue driver, process supervision, backups, error monitoring.
- **Live payment verification:** end-to-end Paystack test (test key → real KES transaction), Paystack webhook registered on a stable URL.
- **Media messages:** inbound images and voice notes (transcribe voice → agent loop) — Kenyan customers send voice notes constantly; today they're silently ignored.
- **Knowledge base:** doc/FAQ upload → RAG (pgvector) so the AI answers from more than the profile form.
- **Password reset via email** + email verification on signup.
- **Compliance ops:** per-tenant quality-rating monitoring, outbound rate limiting, message delivery status (sent/delivered/read), ODPC registration + tenant data export/delete.
- **Cost tiering:** cheap router model in front of the reply model (deferred from Slice 1); per-tenant cost dashboards internally.

### v2 — Growth (the moat)

- **Embedded Signup** (Meta Tech Provider approval): one-click WhatsApp connection — kills the biggest onboarding friction.
- **Azayon billing enforcement:** Paystack subscriptions, plan tiers by conversation volume, trial expiry gating.
- **Team features:** multiple users per tenant, conversation assignment, roles (owner/agent), activity audit.
- **Google Calendar sync** (then Outlook): two-way sync with the internal booking calendar.
- **Deeper ad attribution:** per-ad/per-source funnel and revenue (CTWA click IDs are already captured), "which ad made you money" reporting.
- **Broadcasts:** opt-in template campaigns to segments (pipeline stage, source, custom fields).
- **Email channel** + **SMS fallback** (Africa's Talking) for missed WhatsApp reminders.
- **Swahili UI** (strings are externalization-ready) + richer vertical template library grown from pilot learnings.

### v3 — AI workforce

- **AI voice agents:** inbound call answering and outbound lead calls (form fill → AI calls back in 30 seconds), CRM-integrated like the chat agent.
- **Multi-number / multi-location** tenants (branches, departments).
- **Deep workflow automations:** trigger → multi-step action builder (the "simple automations" menu grows up).
- **AI insights:** weekly owner digest ("you lost 6 leads to pricing objections this week"), conversation quality scoring, suggested FAQ/profile improvements mined from real chats.
- **Marketplace/API:** webhooks + REST API for tenants' own systems; integrations (Sheets export, accounting).

## 8. Top risks

| Risk | Mitigation |
|---|---|
| Meta verification / Tech Provider approval delays | Start now; build slices 1–2 on a test number meanwhile |
| Tenant numbers flagged for spammy follow-ups | Window-aware sender, utility-style templates, per-tenant rate limits, quality-rating monitoring |
| LLM + Meta fees eat margin | Tiered models, metering, conversation-based pricing |
| Multi-vertical confusion (the "hard part") | Vertical templates + simulator + opinionated defaults |
| AI says something wrong to a customer | KB-grounded answers only, escalation on uncertainty, human takeover, per-tenant "never say" list |
| Churn after month 2 | ROI dashboard, follow-up recovery stats front and center |
