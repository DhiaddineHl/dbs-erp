import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { AppRole } from "@/lib/auth/permissions";

export async function getSession() {
  return auth.api.getSession({ headers: await headers() });
}

export async function getUser() {
  return (await getSession())?.user ?? null;
}

export function userRole(user: { role?: string | null } | null | undefined): AppRole {
  return (user?.role as AppRole) ?? "analyst";
}

/** Page guard: redirect to /login when unauthenticated. Returns the user. */
export async function requireUser() {
  const user = await getUser();
  if (!user) redirect("/login");
  return user;
}

/** Page guard: must be admin, else bounce to the cockpit. */
export async function requireAdmin() {
  const user = await requireUser();
  if (userRole(user) !== "admin") redirect("/cockpit");
  return user;
}

/** Action guard: throw (no redirect) when the caller is not an admin. */
export async function assertAdmin() {
  const user = await getUser();
  if (!user || userRole(user) !== "admin") throw new Error("Forbidden: admin only");
  return user;
}

/** Action guard: any authenticated user; throws (no redirect) otherwise. */
export async function assertUser() {
  const user = await getUser();
  if (!user) throw new Error("Non authentifié");
  return user;
}
