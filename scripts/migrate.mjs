// Runtime migration runner — applies the committed SQL in ./drizzle using only
// production deps (drizzle-orm + pg), so it works on Railway without drizzle-kit.
import { createHash } from "node:crypto";
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

/* Filet de sécurité : le migrateur de drizzle n'applique que les migrations
 * dont la date (`when` du journal) est POSTÉRIEURE à la dernière appliquée.
 * Si une migration plus récente a été appliquée avant (autre branche, autre
 * livraison, fichiers copiés dans le désordre), les plus anciennes restantes
 * sont sautées EN SILENCE — « Migrations up to date » — et l'application
 * plante ensuite sur des colonnes absentes. On les repère par leur date
 * (drizzle enregistre `created_at` = `when`) et on les applique, dans
 * l'ordre du journal. */
async function rattraperMigrationsSautees() {
  const journal = JSON.parse(readFileSync("./drizzle/meta/_journal.json", "utf8"));
  const { rows } = await pool.query('select created_at from "drizzle"."__drizzle_migrations"');
  const appliquees = new Set(rows.map((r) => String(r.created_at)));
  const manquantes = journal.entries.filter((e) => !appliquees.has(String(e.when)));
  if (!manquantes.length) return;
  console.warn(`⚠ ${manquantes.length} migration(s) sautée(s) par le migrateur — rattrapage : ${manquantes.map((e) => e.tag).join(", ")}`);
  const client = await pool.connect();
  try {
    await client.query("begin");
    for (const e of manquantes) {
      const texte = readFileSync(`./drizzle/${e.tag}.sql`, "utf8");
      for (const stmt of texte.split("--> statement-breakpoint")) {
        if (stmt.trim()) await client.query(stmt);
      }
      const hash = createHash("sha256").update(texte).digest("hex");
      await client.query('insert into "drizzle"."__drizzle_migrations" ("hash", "created_at") values ($1, $2)', [hash, e.when]);
      console.log(`  ✓ ${e.tag}`);
    }
    await client.query("commit");
  } catch (err) {
    await client.query("rollback");
    throw err;
  } finally {
    client.release();
  }
}

try {
  console.log("→ Applying database migrations…");
  await migrate(db, { migrationsFolder: "./drizzle" });
  await rattraperMigrationsSautees();
  console.log("✓ Migrations up to date.");
} catch (err) {
  console.error("✗ Migration failed:", err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
