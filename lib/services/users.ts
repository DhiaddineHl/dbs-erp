import "server-only";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import type { AppRole } from "@/lib/auth/permissions";

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

export async function createUser(input: { email: string; password: string; name: string; role: AppRole }) {
  return auth.api.createUser({
    headers: await headers(),
    body: { email: input.email, password: input.password, name: input.name, role: input.role },
  });
}

export async function setUserRole(userId: string, role: AppRole) {
  return auth.api.setRole({ headers: await headers(), body: { userId, role } });
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
