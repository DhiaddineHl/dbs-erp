/* Vue devise des écrans de chiffre d'affaires de la facturation.
 *
 * Par défaut chaque devise est présentée à part : un groupe par devise, avec
 * ses propres KPI, graphiques et rapports. Sur demande, tout est converti dans
 * une devise de référence — chaque facture au taux en vigueur à SA date — et
 * les écrans n'affichent plus qu'un groupe. Les analyses (CA, PMP, marges)
 * s'appliquent ensuite telles quelles : elles ne voient jamais qu'une devise. */
import {
  type Devise,
  LISTE_DEVISES,
  type TauxChange,
  type VueDevise,
  arrondir,
  convertir,
  deviseOu,
} from "@/lib/domain/montants";
import { type Couts, type Facture, fkey } from "./store";

export type GroupeDevise = {
  devise: Devise;
  factures: Facture[];
  couts: Couts;
};

export type VueFactures = {
  groupes: GroupeDevise[];
  /** Factures qu'aucun taux ne permettait de convertir (exclues). */
  nonConverties: Facture[];
  converti: boolean;
};

/** Copie d'une facture dont chaque montant est multiplié par `k`. */
function convertirFacture(f: Facture, vers: Devise, k: number): Facture {
  const c = (n: number) => n * k;
  return {
    ...f,
    devise: vers,
    total: arrondir(c(f.total), vers),
    montantTva: arrondir(c(f.montantTva), vers),
    totalTtc: arrondir(c(f.totalTtc), vers),
    fournitures: c(f.fournitures || 0),
    extras: f.extras.map((e) => ({ ...e, mt: c(e.mt) })),
    lignes: f.lignes.map((l) => ({ ...l, pu: c(l.pu), mt: c(l.mt) })),
  };
}

/** Les coûts de production saisis sont dans la devise de leur facture : ils
 * suivent la même conversion, sans quoi la marge mélangerait deux devises. */
function convertirCouts(entree: Couts[string] | undefined, k: number): Couts[string] | undefined {
  if (!entree) return entree;
  const lines: Couts[string]["lines"] = {};
  for (const [i, l] of Object.entries(entree.lines)) {
    const v = l.cout !== "" ? parseFloat(l.cout.replace(",", ".")) : NaN;
    lines[Number(i)] = { ...l, cout: Number.isFinite(v) ? String(v * k) : l.cout };
  }
  return { lines };
}

export function vueFactures(all: Facture[], couts: Couts, vue: VueDevise, taux: TauxChange[]): VueFactures {
  if (vue === "par-devise") {
    const groupes = LISTE_DEVISES.map((devise) => ({
      devise,
      factures: all.filter((f) => deviseOu(f.devise) === devise),
      couts,
    })).filter((g) => g.factures.length > 0);
    return { groupes, nonConverties: [], converti: false };
  }

  const factures: Facture[] = [];
  const coutsConv: Couts = {};
  const nonConverties: Facture[] = [];
  for (const f of all) {
    const de = deviseOu(f.devise);
    const k = convertir(1, de, vue, f.date, taux);
    if (k === null) {
      nonConverties.push(f);
      continue;
    }
    factures.push(k === 1 ? { ...f, devise: vue } : convertirFacture(f, vue, k));
    const cle = fkey(f);
    const cc = k === 1 ? couts[cle] : convertirCouts(couts[cle], k);
    if (cc) coutsConv[cle] = cc;
  }
  return { groupes: [{ devise: vue, factures, couts: coutsConv }], nonConverties, converti: true };
}
