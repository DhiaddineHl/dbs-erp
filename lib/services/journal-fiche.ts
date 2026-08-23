import "server-only";
import { db } from "@/lib/db";
import { commandeJournal } from "@/lib/db/schema";
import type { DomainePrepa } from "@/lib/domain/feux";

/* Le journal de la fiche commande : une ligne par modification, avec la valeur
 * avant et après. C'est la mémoire de la commande — une modification sans
 * trace n'existe pas.
 *
 * Module à part, et non un export de `preparation.ts`, parce que le plan de
 * coupe écrit dans le même journal depuis son propre service : le partager
 * depuis l'un des deux services créerait un cycle d'imports entre eux. */

export type Auteur = { id: string; name: string; role: string };

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** Écrit la ligne de journal dans la transaction qui l'a produite. */
export async function journaliserFiche(
  tx: Tx,
  commandeId: number,
  auteur: Auteur,
  domaine: DomainePrepa,
  action: string,
  opts: { detail?: string; avant?: string | number | null; apres?: string | number | null } = {},
) {
  await tx.insert(commandeJournal).values({
    commandeId,
    par: auteur.name,
    role: auteur.role,
    domaine,
    action,
    detail: opts.detail ?? "",
    avant: opts.avant == null ? "" : String(opts.avant),
    apres: opts.apres == null ? "" : String(opts.apres),
  });
}
