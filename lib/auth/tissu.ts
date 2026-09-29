import "server-only";
import { redirect } from "next/navigation";
import { assertUser, getUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";

/** Droit d'écrire au magasin tissu (lots ET rouleaux) : les rôles de
 * préparation tissu, ou tout rôle à qui l'on a ouvert le module magtissu.
 * Une seule règle, partagée par les actions lots et rouleaux. */
export async function auteurTissu() {
  const user = await assertUser();
  const role = userRole(user);
  let autorise = peutModifier("tissu", role);
  if (!autorise) {
    const modules = await getRoleModules(role);
    if (modules.magtissu) autorise = true;
  }
  if (!autorise) throw new Error("Réservé au magasin tissu");
  return { id: user.id, name: user.name as string, role };
}

/** Pour les pages mobiles du magasin tissu : connexion obligatoire (retour à
 * la page scannée après login), et le droit d'écrire, pour afficher ou non les
 * boutons. La vraie vérification reste dans chaque action. */
export async function accesTissuPage(suite: string) {
  const user = await getUser();
  if (!user) redirect(`/login?suite=${encodeURIComponent(suite)}`);
  const role = userRole(user);
  const modules = await getRoleModules(role);
  return { user, peutSaisir: peutModifier("tissu", role) || modules.magtissu === true };
}
