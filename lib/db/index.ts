import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

// Reuse a single pool across hot-reloads in development.
const globalForDb = globalThis as unknown as { __pgPool?: Pool };
const pool = globalForDb.__pgPool ?? new Pool({ connectionString: process.env.DATABASE_URL });
if (process.env.NODE_ENV !== "production") globalForDb.__pgPool = pool;

export const db = drizzle(pool, { schema, casing: "snake_case" });
export { schema };
