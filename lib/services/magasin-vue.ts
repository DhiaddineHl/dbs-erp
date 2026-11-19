import "server-only";
import * as av from "@/lib/domain/aval";
import type { StockTaille } from "@/lib/domain/stock-taille";
import { listBr, listCommandesAval, listMouvements, type BrRow, type CommandeAval, type MouvementRow } from "@/lib/services/aval";
import { livraisonsAnnoncees } from "@/lib/services/suivi-soustraitants";
import { stocksParTaille, taillesRapides } from "@/lib/services/stock-taille";

/* MAGASIN PRODUITS FINIS — tout ce que l'écran affiche, en une lecture.
 * Les chiffres viennent des fonctions existantes (listCommandesAval, listBr,
 * listMouvements) ; on y ajoute seulement le stock PAR TAILLE, les tailles à
 * proposer à la saisie et la date de départ prévue. */

export type CommandeMagasin = CommandeAval & {
  /** Tailles proposées à la saisie (grille commandée, puis tailles coupées). */
  tailles: string[];
  stockTaille: StockTaille;
  /** Départ prévu (prévision export, sinon date contractuelle). */
  datePlan: string;
};

export type VueMagasin = {
  commandes: CommandeMagasin[];
  brs: BrRow[];
  mouvements: MouvementRow[];
  annoncees: Awaited<ReturnType<typeof livraisonsAnnoncees>>;
};

export async function vueMagasin(): Promise<VueMagasin> {
  const [commandes, brs, mouvements, annoncees] = await Promise.all([listCommandesAval({ archived: false }), listBr(), listMouvements(), livraisonsAnnoncees()]);
  const ids = commandes.map((c) => c.id);
  const tailles = await taillesRapides(ids);
  const stocks = await stocksParTaille(ids, undefined, tailles);
  return {
    commandes: commandes.map((c) => ({
      ...c,
      tailles: tailles.get(c.id) ?? [],
      stockTaille: stocks.get(c.id) ?? { parTaille: {}, nonVentile: c.stockQte, total: c.stockQte },
      datePlan: av.dateExportPlanifiee(c),
    })),
    brs,
    mouvements,
    annoncees,
  };
}
