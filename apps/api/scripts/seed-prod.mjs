/**
 * Runs seed-azayon-tenant.ts against the PRODUCTION Postgres database.
 *
 * The committed schema is `provider = "sqlite"` (dev runs with no local services) and
 * Prisma bakes the provider in at generate time — so a locally-generated client cannot
 * talk to Postgres. This flips the schema, regenerates, seeds, then ALWAYS restores the
 * sqlite schema and regenerates again, so an interrupted run can't strand your dev setup.
 *
 *   SEED_DATABASE_URL="postgresql://..." node scripts/seed-prod.mjs --email you@x.com
 *   SEED_DATABASE_URL="postgresql://..." node scripts/seed-prod.mjs --email you@x.com --yes
 *
 * Previews unless --yes is passed (the seed script enforces that, not this wrapper).
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");

const url = process.env.SEED_DATABASE_URL;
if (!url) {
  console.error("SEED_DATABASE_URL is not set. Pass the Railway Postgres connection string.");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//.test(url)) {
  console.error(`SEED_DATABASE_URL must be a postgres:// URL — got "${url.slice(0, 24)}...".`);
  console.error("A file: URL here would rewrite your DEV database while claiming to be prod.");
  process.exit(1);
}

const run = (cmd, args) =>
  execFileSync(cmd, args, { cwd: join(here, ".."), stdio: "inherit", shell: process.platform === "win32" });

const original = readFileSync(schemaPath, "utf8");
let restored = false;
const restore = () => {
  if (restored) return;
  restored = true;
  writeFileSync(schemaPath, original);
  console.log("\n[seed-prod] schema restored to sqlite; regenerating dev client...");
  try {
    run("npx", ["prisma", "generate"]);
  } catch {
    console.error("[seed-prod] WARNING: dev client regen failed. Run `npx prisma generate` in apps/api.");
  }
};
process.on("SIGINT", () => {
  restore();
  process.exit(130);
});

try {
  console.log("[seed-prod] switching datasource provider -> postgresql");
  writeFileSync(schemaPath, original.replace(/provider\s*=\s*"sqlite"/, 'provider = "postgresql"'));
  run("npx", ["prisma", "generate"]);

  console.log("[seed-prod] running seed against production\n");
  run("npx", ["tsx", "scripts/seed-azayon-tenant.ts", ...process.argv.slice(2)]);
} finally {
  restore();
}
