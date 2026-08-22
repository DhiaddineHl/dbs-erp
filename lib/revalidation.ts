import { revalidatePath } from "next/cache";

/* Les deux écrans du carnet de commandes.
 *
 * `/planning` est le même carnet, vu par le planning : mêmes lignes, mêmes
 * enregistrements, colonnes d'argent en moins. Une commande n'a donc jamais
 * deux versions — mais elle a deux écrans, et Next met chacun en cache de son
 * côté. Toute écriture sur une commande doit rafraîchir les deux, sinon celui
 * d'en face garde l'ancienne valeur jusqu'au prochain rechargement complet :
 * le planning déplacerait une date que les commandes continueraient d'afficher
 * à l'ancienne, et inversement. */
export const ECRANS_CARNET = ["/commandes", "/planning"] as const;

/** Rafraîchit les deux vues du carnet. À appeler partout où l'on écrivait
 * `revalidatePath("/commandes")`. */
export function revaliderCarnet() {
  for (const p of ECRANS_CARNET) revalidatePath(p);
}
