// Runtime migration runner — applies the committed SQL in ./drizzle using only
// production deps (drizzle-orm + pg), so it works on Railway without drizzle-kit.
import { existsSync, readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import pg from "pg";

/** Load a local .env if present, without overriding already-set env vars
 * (so injected Railway/CI env always wins). No dotenv dependency needed. */
function loadEnv(file = ".env") {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!m || m[1].startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = (m[2] ?? "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, "").trim();
    process.env[m[1]] = val;
  }
}

loadEnv();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("✗ DATABASE_URL is not set — cannot run migrations.");
  process.exit(1);
}

const pool = new pg.Pool({ connectionString: url });
const db = drizzle(pool);

try {
  console.log("→ Applying database migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  console.log("✓ Migrations up to date.");
} catch (err) {
  console.error("✗ Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
