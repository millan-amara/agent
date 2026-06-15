/*
 * One-time, READ-ONLY dump of the legacy CRM's MongoDB into local JSON files,
 * so the migration can transform from a stable on-disk snapshot (and you keep a
 * backup). Reuses the old app's already-installed mongodb driver by absolute
 * path so nothing new is installed. Temporary helper — safe to delete after.
 *
 *   MONGO_URI="mongodb+srv://..." node apps/api/scripts/_dump-mongo.cjs
 */
const fs = require("node:fs");
const path = require("node:path");

// The legacy app's installed mongodb driver (this repo has none).
const DRIVER = "C:/Users/LISA/Desktop/folder/dev/african/node_modules/mongodb";
const { MongoClient } = require(DRIVER);

const COLLECTIONS = ["orgs", "users", "contacts", "deals", "pipelines"];
const OUT_DIR = path.join(__dirname, "migration-data");

// Convert BSON types to plain JSON-friendly values (ObjectId -> hex string,
// Date -> ISO, Map/Buffer handled), recursively, without pulling in EJSON.
function normalize(value) {
  if (value == null) return value;
  if (Array.isArray(value)) return value.map(normalize);
  if (typeof value === "object") {
    const t = value._bsontype;
    if (t === "ObjectId" || t === "ObjectID") return value.toString();
    if (t === "Decimal128" || t === "Long") return value.toString();
    if (t === "Binary") return value.toString("base64");
    if (value instanceof Date) return value.toISOString();
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = normalize(v);
    return out;
  }
  return value;
}

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error("Set MONGO_URI");
  fs.mkdirSync(OUT_DIR, { recursive: true });

  const client = new MongoClient(uri, { serverSelectionTimeoutMS: 15_000 });
  await client.connect();
  const dbName = new URL(uri).pathname.replace(/^\//, "") || "african";
  const db = client.db(dbName);
  console.log(`connected to db "${dbName}"`);

  const summary = {};
  for (const name of COLLECTIONS) {
    const docs = await db.collection(name).find({}).toArray();
    const clean = docs.map(normalize);
    fs.writeFileSync(path.join(OUT_DIR, `${name}.json`), JSON.stringify(clean, null, 2));
    summary[name] = clean.length;
    console.log(`  ${name}: ${clean.length} docs -> migration-data/${name}.json`);
  }
  await client.close();
  console.log("done:", JSON.stringify(summary));
}

main().catch((err) => {
  console.error("dump failed:", err.message);
  process.exit(1);
});
