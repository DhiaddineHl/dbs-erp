import "server-only";
import { redirect } from "next/navigation";
import { assertUser, getUser, userRole } from "@/lib/auth/server";
import { getRoleModules } from "@/lib/services/permissions";

/* Droit de saisir la production GPAO : le module « GPAO Production » ouvert au
 * rôle (réglage Paramètres → rôles), l'administrateur toujours. Une seule
 * règle, pour l'écran du bureau comme pour la tablette de l'agent de méthode. */

async function autorise(role: string) {
  if (role === "admin") return true;
  return (await getRoleModules(role)).gpao_prod === true;
}

export async function auteurGpao() {
  const user = await assertUser();
  const role = userRole(user);
  if (!(await autorise(role))) throw new Error("Réservé aux comptes ayant le module GPAO Production");
  return { id: user.id, name: user.name as string, role };
}

/** Pages tablette : connexion obligatoire (retour ici après login) + droit. */
export async function accesGpaoPage(suite: string) {
  const user = await getUser();
  if (!user) redirect(`/login?suite=${encodeURIComponent(suite)}`);
  return { user, peutSaisir: await autorise(userRole(user)) };
}
