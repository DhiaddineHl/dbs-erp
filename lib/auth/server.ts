import "server-only";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import type { AppRole } from "@/lib/auth/permissions";
import { getLandingPath, getRoleModules } from "@/lib/services/permissions";
import { libelleModule, unModuleOuvert } from "@/lib/auth/acces";

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

/** Page guard: must be admin, else bounce to the first page their role has. */
export async function requireAdmin() {
  const user = await requireUser();
  const role = userRole(user);
  if (role !== "admin") redirect(await getLandingPath(role));
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

/** Page guard : connecté ET au moins un des modules ouvert à son rôle (la
 * matrice de Paramètres → Rôles). Sinon : page « accès refusé », jamais le
 * contenu. À appeler en tête de CHAQUE page et de chaque export (route) —
 * un test vérifie qu'aucune n'est oubliée. Renvoie l'utilisateur. */
export async function exigerModule(...ids: [string, ...string[]]) {
  const user = await requireUser();
  const role = userRole(user);
  if (role === "admin") return user;
  if (!unModuleOuvert(ids, await getRoleModules(role), role)) redirect(`/sans-acces?module=${encodeURIComponent(ids[0])}`);
  return user;
}

/** Action guard : comme assertUser, plus le module. Une action du serveur
 * peut être appelée depuis n'importe quelle page : le menu ne la protège
 * pas, cette vérification si. */
export async function assertModule(...ids: [string, ...string[]]) {
  const user = await assertUser();
  const role = userRole(user);
  if (role === "admin") return user;
  if (!unModuleOuvert(ids, await getRoleModules(role), role)) throw new Error(`Accès refusé : « ${libelleModule(ids[0])} » n'est pas ouvert à votre rôle.`);
  return user;
}

/** Variante sans exception, pour une route (export, fichier) : null = refusé. */
export async function utilisateurAvecModule(...ids: [string, ...string[]]) {
  const user = await getUser();
  if (!user) return null;
  const role = userRole(user);
  if (role === "admin") return user;
  return unModuleOuvert(ids, await getRoleModules(role), role) ? user : null;
}
