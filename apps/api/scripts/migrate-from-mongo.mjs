/*
 * One-time migration: legacy CRM (MongoDB) -> Azayon (Postgres via Prisma).
 *
 * Source: the JSON snapshot produced by _dump-mongo.cjs in ./migration-data.
 * Target: whatever DATABASE_URL points at (run against prod Postgres at deploy;
 *         dev SQLite for a rehearsal). Idempotent — re-runnable. Records keep a
 *         deterministic id derived from the old Mongo _id, so a second run
 *         updates the same rows instead of duplicating.
 *
 * Mapping (decisions captured with the user):
 *   Org      -> Tenant   (plan=trial, trialEndsAt=null so nobody is locked out;
 *                         stages from the org's default pipeline)
 *   User     -> User     (admin->owner, else agent; bcrypt hash preserved and
 *                         transparently upgraded to scrypt on first login)
 *   Contact  -> Contact  (firstName+lastName->name; status->stage; company/
 *                         tags/notes/etc folded into the fields JSON)
 *   Deal     -> folded onto its Contact (stage + open value in valueCents)
 *
 * Not carried (no home in the new product): contact timelines, attachments,
 * tasks, automations, documents, deal comments/history.
 *
 *   node apps/api/scripts/migrate-from-mongo.mjs --dry-run   # transform + report, no writes
 *   node apps/api/scripts/migrate-from-mongo.mjs             # write to DATABASE_URL
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const DATA = join(HERE, "migration-data");
const DRY_RUN = process.argv.includes("--dry-run");

const load = (name) => JSON.parse(readFileSync(join(DATA, `${name}.json`), "utf8"));
const orgs = load("orgs");
const users = load("users");
const contacts = load("contacts");
const deals = load("deals");
const pipelines = load("pipelines");

// Deterministic target ids from the legacy _id → idempotent re-runs + trivial
// relinking of references (assignedTo, contact, orgId).
const tid = (oldId) => `mig_t_${oldId}`;
const uid = (oldId) => `mig_u_${oldId}`;
const cid = (oldId) => `mig_c_${oldId}`;

const STANDARD_STAGES = ["New Lead", "Contacted", "Qualified", "Proposal Sent", "Negotiation", "Won", "Lost"];
// Legacy Contact.status (lifecycle) -> a pipeline stage in the new single-stage model.
const STATUS_TO_STAGE = { lead: "New Lead", prospect: "Qualified", customer: "Won", churned: "Lost", other: "New Lead" };

const report = { tenants: 0, users: { owner: 0, agent: 0 }, contacts: 0, phonePlaceholders: 0, valueCentsTotal: 0, dealsFolded: 0, multiDeal: [], skipped: [] };

// --- Pipelines: choose each org's stage list (default pipeline, else first, else standard) ---
const pipesByOrg = new Map();
for (const p of pipelines) {
  if (!pipesByOrg.has(p.orgId)) pipesByOrg.set(p.orgId, []);
  pipesByOrg.get(p.orgId).push(p);
}
function stagesForOrg(orgId) {
  const ps = pipesByOrg.get(orgId) ?? [];
  const chosen = ps.find((p) => p.isDefault) ?? ps[0];
  const names = (chosen?.stages ?? [])
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((s) => String(s.name).trim())
    .filter(Boolean);
  const deduped = [...new Set(names)];
  return deduped.length ? deduped : STANDARD_STAGES.slice();
}

// --- Deals grouped by contact ---
const dealsByContact = new Map();
for (const d of deals) {
  if (!dealsByContact.has(d.contact)) dealsByContact.set(d.contact, []);
  dealsByContact.get(d.contact).push(d);
}

// Pick the stage + open value a contact inherits from its deal(s).
function foldDeals(contactDeals, stageOrder) {
  const open = contactDeals.filter((d) => d.status === "open");
  const valueCents = open.reduce((s, d) => s + Math.round((Number(d.value) || 0) * 100), 0);
  const rank = (name) => {
    const i = stageOrder.indexOf(name);
    return i === -1 ? -1 : i;
  };
  let stage;
  if (open.length) {
    // most-advanced open deal by the tenant's stage order
    stage = open.slice().sort((a, b) => rank(b.stageName) - rank(a.stageName))[0]?.stageName;
  } else {
    // all closed: won -> "Won", else leave undefined (fall back to status)
    stage = contactDeals.some((d) => d.status === "won") ? "Won" : undefined;
  }
  return { stage, valueCents };
}

// --- Build tenant records ---
const tenantRecords = orgs.map((o) => {
  const stages = stagesForOrg(o._id);
  report.tenants++;
  return {
    id: tid(o._id),
    name: o.name?.trim() || "Untitled",
    vertical: "general",
    onboarded: false, // push migrated orgs through onboarding to connect WhatsApp
    businessProfile: JSON.stringify({ businessName: o.name?.trim() || "", currency: o.settings?.currency ?? "KES", timezone: o.settings?.timezone ?? "Africa/Nairobi" }),
    stages: JSON.stringify(stages),
    plan: "trial",
    trialEndsAt: null, // legacy convention: null = trial, no expiry → never locked out
    createdAt: o.createdAt ? new Date(o.createdAt) : undefined,
    _stageOrder: stages, // transient, used below
  };
});
// Recover orphaned orgs: some contacts/pipelines reference an orgId that has no
// Org document (deleted org, leftover rows). Rather than drop those contacts,
// synthesize a tenant so nothing is lost. These have no users (login continuity
// isn't a concern) — they just preserve the contact data.
const orgIdsInDump = new Set(orgs.map((o) => o._id));
const referencedOrgIds = new Set(contacts.map((c) => c.orgId));
for (const orgId of referencedOrgIds) {
  if (orgIdsInDump.has(orgId)) continue;
  const stages = stagesForOrg(orgId);
  const pipeName = (pipesByOrg.get(orgId) ?? [])[0]?.name;
  report.tenants++;
  report.recovered = (report.recovered ?? 0) + 1;
  tenantRecords.push({
    id: tid(orgId),
    name: pipeName ? `${pipeName} (recovered)` : `Recovered org ${String(orgId).slice(-6)}`,
    vertical: "general",
    onboarded: false,
    businessProfile: JSON.stringify({ businessName: "", currency: "KES", timezone: "Africa/Nairobi" }),
    stages: JSON.stringify(stages),
    plan: "trial",
    trialEndsAt: null,
    createdAt: undefined,
    _stageOrder: stages,
  });
}

const stageOrderByTenant = new Map(tenantRecords.map((t) => [t.id, t._stageOrder]));
const validStagesByTenant = new Map(tenantRecords.map((t) => [t.id, new Set(t._stageOrder)]));

// --- Build user records ---
const userRecords = [];
for (const u of users) {
  const tenantId = tid(u.orgId);
  if (!stageOrderByTenant.has(tenantId)) { report.skipped.push(`user ${u.email}: org ${u.orgId} not found`); continue; }
  const role = u.role === "admin" ? "owner" : "agent";
  report.users[role]++;
  userRecords.push({
    id: uid(u._id),
    email: String(u.email).toLowerCase().trim(),
    passwordHash: u.password, // bcrypt; verified + upgraded on first login
    name: u.name ?? null,
    phone: u.phone ?? null,
    emailVerified: Boolean(u.emailVerified),
    role,
    tenantId,
    createdAt: u.createdAt ? new Date(u.createdAt) : undefined,
  });
}
const knownUserIds = new Set(userRecords.map((u) => u.id));

// --- Build contact records ---
const contactRecords = [];
for (const c of contacts) {
  const tenantId = tid(c.orgId);
  if (!stageOrderByTenant.has(tenantId)) { report.skipped.push(`contact ${c._id}: org ${c.orgId} not found`); continue; }
  const stageOrder = stageOrderByTenant.get(tenantId);
  const validStages = validStagesByTenant.get(tenantId);

  // Base stage from lifecycle status; fall back to the tenant's first stage.
  let stage = STATUS_TO_STAGE[c.status] ?? stageOrder[0];
  let valueCents = 0;

  const cDeals = dealsByContact.get(c._id) ?? [];
  if (cDeals.length) {
    const folded = foldDeals(cDeals, stageOrder);
    if (folded.stage) stage = folded.stage;
    valueCents = folded.valueCents;
    report.dealsFolded += cDeals.length;
    if (cDeals.length > 1) {
      report.multiDeal.push({ contact: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim(), deals: cDeals.length, stage, valueKes: valueCents / 100 });
    }
  }
  // Guarantee the chosen stage exists in the tenant's stage list.
  if (!validStages.has(stage)) stage = stageOrder[0];
  report.valueCentsTotal += valueCents;

  const phoneRaw = (c.phone ?? "").trim();
  const phone = phoneRaw || `legacy:${String(c._id).slice(-8)}`;
  if (!phoneRaw) report.phonePlaceholders++;

  const assignedUserId = c.assignedTo && knownUserIds.has(uid(c.assignedTo)) ? uid(c.assignedTo) : null;

  report.contacts++;
  contactRecords.push({
    id: cid(c._id),
    tenantId,
    name: `${c.firstName ?? ""} ${c.lastName ?? ""}`.trim() || "Unknown",
    phone,
    stage,
    valueCents,
    source: c.source ?? "import",
    assignedUserId,
    fields: JSON.stringify({
      legacyStatus: c.status ?? null,
      company: c.company ?? null,
      email: c.email ?? null,
      jobTitle: c.jobTitle ?? null,
      city: c.city ?? null,
      country: c.country ?? null,
      tags: Array.isArray(c.tags) ? c.tags : [],
      notes: c.notes ?? null,
    }),
    createdAt: c.createdAt ? new Date(c.createdAt) : undefined,
  });
}

// --- Report ---
function printReport() {
  console.log(`\n=== Migration ${DRY_RUN ? "DRY-RUN (no writes)" : "RUN"} ===`);
  console.log(`Tenants:  ${report.tenants}` + (report.recovered ? `  (${report.recovered} recovered from orphaned contacts)` : ""));
  console.log(`Users:    ${report.users.owner} owner + ${report.users.agent} agent = ${report.users.owner + report.users.agent}`);
  console.log(`Contacts: ${report.contacts}  (${report.phonePlaceholders} without a phone → placeholder)`);
  console.log(`Deals folded into contacts: ${report.dealsFolded}; total open value migrated: KES ${(report.valueCentsTotal / 100).toLocaleString()}`);
  if (report.multiDeal.length) {
    console.log(`\nContacts with >1 deal (merged — eyeball these):`);
    for (const m of report.multiDeal) console.log(`  • ${m.contact}: ${m.deals} deals → stage "${m.stage}", value KES ${m.valueKes.toLocaleString()}`);
  }
  if (report.skipped.length) {
    console.log(`\nSkipped (${report.skipped.length}):`);
    for (const s of report.skipped) console.log(`  • ${s}`);
  }
  // Stage distribution sanity-check
  const dist = contactRecords.reduce((m, c) => ((m[c.stage] = (m[c.stage] || 0) + 1), m), {});
  console.log(`\nContact stage distribution:`, JSON.stringify(dist));
}

async function write() {
  const { PrismaClient } = await import("@prisma/client");
  const db = new PrismaClient();
  try {
    // Tenants first (FK parent), then users, then contacts.
    for (const t of tenantRecords) {
      const { _stageOrder, ...data } = t;
      await db.tenant.upsert({
        where: { id: t.id },
        create: data,
        update: { name: data.name, stages: data.stages }, // safe re-run refresh
      });
    }
    for (const u of userRecords) {
      await db.user.upsert({ where: { id: u.id }, create: u, update: { name: u.name, phone: u.phone, role: u.role } }).catch((e) => {
        report.skipped.push(`user ${u.email}: ${e.code ?? e.message}`);
      });
    }
    for (const c of contactRecords) {
      await db.contact.upsert({ where: { id: c.id }, create: c, update: { name: c.name, stage: c.stage, valueCents: c.valueCents, assignedUserId: c.assignedUserId } });
    }
    console.log(`\n✓ Wrote ${tenantRecords.length} tenants, ${userRecords.length} users, ${contactRecords.length} contacts to the database.`);
  } finally {
    await db.$disconnect();
  }
}

printReport();
if (!DRY_RUN) {
  await write();
  printReport(); // re-print so any write-time skips show
} else {
  console.log(`\n(dry-run — no database writes. Re-run without --dry-run against the target DATABASE_URL to apply.)`);
}
