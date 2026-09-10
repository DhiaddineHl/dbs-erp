import "server-only";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, schema } from "@/lib/db";
import { estRoleBuiltin, type AppRole } from "@/lib/auth/permissions";

/** Admin user-management, delegated to Better Auth's admin plugin endpoints.
 * The admin plugin authorizes each call against the current session, so we
 * always forward the incoming request headers. */

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  banned: boolean;
  createdAt: Date;
};

export async function listUsers(): Promise<ManagedUser[]> {
  const res = await auth.api.listUsers({
    headers: await headers(),
    query: { limit: 200, sortBy: "createdAt", sortDirection: "asc" },
  });
  const users = "users" in res ? res.users : [];
  return users.map((u) => ({
    id: u.id,
    name: u.name ?? "",
    email: u.email ?? "",
    role: u.role ?? "analyst",
    banned: Boolean(u.banned),
    createdAt: new Date(u.createdAt),
  }));
}

/* Better Auth fige la liste de ses rôles au moment de la compilation. Les rôles
 * créés en production sont pourtant des valeurs légitimes de la colonne `role` :
 * on force le type au passage de frontière, et la validation métier (existence
 * du rôle) est faite en amont, dans l'action. */
const commeRole = (r: AppRole) => r as "admin";

export async function createUser(input: { email: string; password: string; name: string; role: AppRole }) {
  // Better Auth only knows about builtin roles. For custom roles, create the
  // user with the default role then patch the column directly.
  if (estRoleBuiltin(input.role)) {
    return auth.api.createUser({
      headers: await headers(),
      body: { email: input.email, password: input.password, name: input.name, role: commeRole(input.role) },
    });
  }
  const res = await auth.api.createUser({
    headers: await headers(),
    body: { email: input.email, password: input.password, name: input.name },
  });
  await db.update(schema.user).set({ role: input.role }).where(eq(schema.user.id, res.user.id));
  return res;
}

export async function setUserRole(userId: string, role: AppRole) {
  // Better Auth rejects roles it doesn't know about at compile time.
  // For custom (non-builtin) roles, update the column directly.
  if (estRoleBuiltin(role)) {
    return auth.api.setRole({ headers: await headers(), body: { userId, role: commeRole(role) } });
  }
  await db.update(schema.user).set({ role }).where(eq(schema.user.id, userId));
}

export async function setUserPassword(userId: string, newPassword: string) {
  return auth.api.setUserPassword({ headers: await headers(), body: { userId, newPassword } });
}

export async function updateUserInfo(userId: string, data: { name?: string; email?: string }) {
  return auth.api.adminUpdateUser({ headers: await headers(), body: { userId, data } });
}

export async function removeUser(userId: string) {
  return auth.api.removeUser({ headers: await headers(), body: { userId } });
}
