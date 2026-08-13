import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { existsSync, readFileSync } from "node:fs";
import * as schema from "@/lib/db/schema";

/* Connexion propre à l'import : lib/db est marqué "server-only" et ne peut pas
 * être chargé hors de Next. Même parti pris que scripts/seed.ts. */

export function chargerEnv(fichier = ".env") {
  if (!existsSync(fichier)) return;
  for (const ligne of readFileSync(fichier, "utf8").split("\n")) {
    const m = ligne.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!m || m[1].startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    let v = (m[2] ?? "").trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, "").trim();
    process.env[m[1]] = v;
  }
}

chargerEnv();

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });
export const db = drizzle(pool, { schema, casing: "snake_case" });
export { schema };
export type Db = typeof db;
