import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSetting, rolePermission } from "@/lib/db/schema";
import { ROLE_KEYS, defaultModuleAccess } from "@/lib/auth/permissions";

/** role → moduleId → allowed */
export type PermMatrix = Record<string, Record<string, boolean>>;

/** Full editable matrix, layering DB overrides over the code defaults. */
export async function getPermMatrix(): Promise<PermMatrix> {
  const rows = await db.select().from(rolePermission);
  const matrix: PermMatrix = {};
  for (const r of ROLE_KEYS) matrix[r] = defaultModuleAccess(r);
  for (const row of rows) {
    (matrix[row.role] ??= {})[row.moduleId] = row.allowed;
  }
  return matrix;
}

/** Module → allowed map for a single role (used by nav + guards). */
export async function getRoleModules(role: string): Promise<Record<string, boolean>> {
  const matrix = await getPermMatrix();
  return matrix[role] ?? defaultModuleAccess("analyst");
}

export async function setPermission(role: string, moduleId: string, allowed: boolean) {
  await db
    .insert(rolePermission)
    .values({ role, moduleId, allowed })
    .onConflictDoUpdate({ target: [rolePermission.role, rolePermission.moduleId], set: { allowed } });
}

/* ─────────── app settings ─────────── */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const [row] = await db.select().from(appSetting).where(eq(appSetting.key, key));
  return row ? (row.value as T) : fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db
    .insert(appSetting)
    .values({ key, value })
    .onConflictDoUpdate({ target: appSetting.key, set: { value } });
}
