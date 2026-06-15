// Flips the Prisma datasource provider sqlite -> postgresql for production
// builds. Local dev keeps `provider = "sqlite"` in the committed schema (no
// Docker required); the Dockerfile runs this before `prisma db push`/generate
// so there is a single source of truth for the models.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const schemaPath = join(here, "..", "prisma", "schema.prisma");

const original = readFileSync(schemaPath, "utf8");
const swapped = original.replace(
  /provider\s*=\s*"sqlite"/,
  'provider = "postgresql"',
);

if (swapped === original && !/provider\s*=\s*"postgresql"/.test(original)) {
  console.error("[use-postgres] could not find a sqlite provider to swap");
  process.exit(1);
}

writeFileSync(schemaPath, swapped);
console.log("[use-postgres] datasource provider set to postgresql");
