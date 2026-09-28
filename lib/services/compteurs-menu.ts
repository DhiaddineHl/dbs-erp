import "server-only";
import { listCommandes } from "@/lib/services/commandes";
import { listEncaissements } from "@/lib/services/finance";
import { compterActionsOuvertes } from "@/lib/services/qc";
import { NAV_STRUCTURE, entreeAutorisee } from "@/lib/nav";

/* Pastilles du menu — calculées sur les vraies données.
 *
 * Avant, « Alertes 3 », « Commandes 2 », « Factures 1 » et « Plans d'actions 2 »
 * étaient écrits en dur : ils affichaient les mêmes chiffres que la base soit
 * vide ou pleine, et on apprenait à ne plus les regarder. Une pastille ne
 * s'affiche plus que quand il y a quelque chose à faire :
 *   - Commandes : commandes en retard de livraison (même règle que le cockpit) ;
 *   - Factures  : factures dont l'échéance de paiement est dépassée ;
 *   - Qualité   : actions qualité encore ouvertes.
 * Seuls les modules visibles par le rôle sont calculés. */
export async function compteursMenu(modules: Record<string, boolean>): Promise<Record<string, number>> {
  const entrees = new Map(NAV_STRUCTURE.flatMap((g) => g.items).map((i) => [i.id, i]));
  const voit = (id: string) => {
    const it = entrees.get(id);
    return !!it && entreeAutorisee(it, modules);
  };
  const sur = async (id: string, calcul: () => Promise<number>) => {
    if (!voit(id)) return [id, 0] as const;
    try {
      return [id, await calcul()] as const;
    } catch {
      return [id, 0] as const; // une pastille ne doit jamais empêcher l'écran de s'ouvrir
    }
  };

  const valeurs = await Promise.all([
    sur("commandes", async () => (await listCommandes()).filter((c) => c.statutKey === "retard").length),
    sur("factures", async () => (await listEncaissements()).filter((f) => f.statut === "retard").length),
    sur("qc", compterActionsOuvertes),
  ]);
  return Object.fromEntries(valeurs.filter(([, n]) => n > 0));
}
