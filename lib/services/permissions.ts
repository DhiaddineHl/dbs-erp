import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { appSetting, role as roleTable, rolePermission } from "@/lib/db/schema";
import { BUILTIN_ROLES, defaultModuleAccess, estRoleBuiltin } from "@/lib/auth/permissions";
import { NAV_STRUCTURE } from "@/lib/nav";

/** Route to send a signed-in user to when no target page is specified — the
 * first menu item their role actually has (same filter as the sidebar), so
 * no one ever lands on a page their role can't see, cockpit included. */
export const SANS_ACCES_PATH = "/sans-acces";

export type RoleRow = { key: string; label: string; color: string; builtin: boolean };

/* Les rôles builtin sont garantis présents même si la table n'a pas encore été
 * seedée : sans eux, plus personne ne pourrait se connecter à l'administration. */
const BUILTIN: RoleRow[] = BUILTIN_ROLES.map((r) => ({ ...r, builtin: true }));

/** Tous les rôles, builtin d'abord, puis les rôles créés en production. */
export async function listRoles(): Promise<RoleRow[]> {
  const rows = await db.select().from(roleTable).orderBy(asc(roleTable.label));
  const parCle = new Map(rows.map((r) => [r.key, r]));
  const builtin = BUILTIN.map((b) => {
    const dbRow = parCle.get(b.key);
    return dbRow ? { key: dbRow.key, label: dbRow.label, color: dbRow.color, builtin: true } : b;
  });
  const custom = rows
    .filter((r) => !estRoleBuiltin(r.key))
    .map((r) => ({ key: r.key, label: r.label, color: r.color, builtin: false }));
  return [...builtin, ...custom];
}

export async function creerRole(v: { key: string; label: string; color: string }) {
  await db.insert(roleTable).values({ ...v, builtin: false });
  // Un rôle neuf part des accès par défaut, sinon il ne voit rien du tout.
  const acces = defaultModuleAccess(v.key);
  const lignes = Object.entries(acces).map(([moduleId, allowed]) => ({ role: v.key, moduleId, allowed }));
  if (lignes.length) {
    await db
      .insert(rolePermission)
      .values(lignes)
      .onConflictDoNothing({ target: [rolePermission.role, rolePermission.moduleId] });
  }
}

export async function majRole(key: string, v: { label: string; color: string }) {
  await db.update(roleTable).set(v).where(eq(roleTable.key, key));
}

export async function supprimerRole(key: string) {
  if (estRoleBuiltin(key)) throw new Error("Les rôles de base ne peuvent pas être supprimés");
  await db.delete(rolePermission).where(eq(rolePermission.role, key));
  await db.delete(roleTable).where(eq(roleTable.key, key));
}

/** role → moduleId → allowed */
export type PermMatrix = Record<string, Record<string, boolean>>;

/** Full editable matrix, layering DB overrides over the code defaults. */
export async function getPermMatrix(): Promise<PermMatrix> {
  const [rows, roles] = await Promise.all([db.select().from(rolePermission), listRoles()]);
  const matrix: PermMatrix = {};
  for (const r of roles) matrix[r.key] = defaultModuleAccess(r.key);
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

/** First page a role can actually land on: the same order and filter the
 * sidebar uses (menu-visible + allowed), so login and "/" never send someone
 * to a module — cockpit included — that their role doesn't have. Falls back
 * to `/sans-acces` for a role stripped of every module. */
export async function getLandingPath(role: string): Promise<string> {
  const modules = await getRoleModules(role);
  for (const group of NAV_STRUCTURE) {
    for (const item of group.items) {
      if (!item.masque && modules[item.id] !== false) return item.href;
    }
  }
  return SANS_ACCES_PATH;
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
