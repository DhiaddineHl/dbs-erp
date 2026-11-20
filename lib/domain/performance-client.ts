/* PERFORMANCE vue par le client — règles pures (aucun accès base).
 *
 * Ce que le client peut mettre dans SES statistiques fournisseur, calculé
 * sur ses propres commandes et sur des dates réelles :
 *  · respect des délais : date d'export contractuelle face à la date réelle ;
 *  · cycle de vie de chaque commande (commande → tissu reçu → coupe → fin de
 *    fabrication → expédition) et sa moyenne ;
 *  · nos points forts : OK de la première tête de série, contrôle final,
 *    pièces livrées.
 * Une date inconnue donne une durée inconnue (null) : rien n'est estimé. */

export type Jalons = {
  /** Commande enregistrée chez nous. */
  commande: string;
  tissu: string;
  coupeDebut: string;
  coupeFin: string;
  /** Première et dernière entrée des pièces finies (emballées). */
  finitionDebut: string;
  finitionFin: string;
  controleFinal: string;
  exportContractuel: string;
  exportReel: string;
};

const ok = (d: string) => /^\d{4}-\d{2}-\d{2}/.test(d ?? "");
export const jours = (du: string, au: string): number | null =>
  ok(du) && ok(au) ? Math.round((Date.parse(`${au.slice(0, 10)}T00:00:00Z`) - Date.parse(`${du.slice(0, 10)}T00:00:00Z`)) / 86_400_000) : null;

export type Cycle = {
  /** Commande → expédition (ou → aujourd'hui si en cours). */
  total: number | null;
  /** Commande → tissu reçu (attente de la matière). */
  attenteTissu: number | null;
  /** Tissu reçu → début de coupe. */
  avantCoupe: number | null;
  /** Début de coupe → dernières pièces finies. */
  fabrication: number | null;
  /** Dernières pièces finies → départ. */
  expedition: number | null;
  /** Tissu reçu → expédition : le temps qui dépend de nous. */
  delaiUsine: number | null;
  /** Réel − contractuel (négatif = en avance) ; null si pas encore parti. */
  ecartExport: number | null;
  enCours: boolean;
};

export function cycleCommande(j: Jalons, aujourdhui: string): Cycle {
  const fin = ok(j.exportReel) ? j.exportReel : aujourdhui;
  const neg = (n: number | null) => (n != null && n < 0 ? 0 : n);
  return {
    total: neg(jours(j.commande, fin)),
    attenteTissu: neg(jours(j.commande, j.tissu)),
    avantCoupe: neg(jours(j.tissu, j.coupeDebut)),
    fabrication: neg(jours(j.coupeDebut, j.finitionFin)),
    expedition: ok(j.exportReel) ? neg(jours(j.finitionFin, j.exportReel)) : null,
    delaiUsine: ok(j.exportReel) ? neg(jours(j.tissu, j.exportReel)) : null,
    ecartExport: ok(j.exportReel) ? jours(j.exportContractuel, j.exportReel) : null,
    enCours: !ok(j.exportReel),
  };
}

export type LigneStats = { jalons: Jalons; pieces: number; premiereTdsOk: boolean | null; controleOk: boolean | null };

export type StatsPerformance = {
  expediees: number;
  /** Parties au plus tard à la date contractuelle. */
  aLHeure: number;
  pctALHeure: number | null;
  /** Écart moyen réel − contractuel (jours, négatif = en avance). */
  ecartMoyen: number | null;
  /** Parmi les retards, le retard moyen. */
  retardMoyen: number | null;
  cycleMoyen: number | null;
  delaiUsineMoyen: number | null;
  fabricationMoyenne: number | null;
  piecesLivrees: number;
  pctTdsOk: number | null;
  pctControleOk: number | null;
};

const moyenne = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x != null);
  return v.length ? Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 : null;
};
const pct = (n: number, sur: number) => (sur > 0 ? Math.round((n / sur) * 100) : null);

/** Statistiques sur les commandes PARTIES (avec une date contractuelle pour
 * le respect des délais). */
export function statsPerformance(lignes: LigneStats[], aujourdhui: string): StatsPerformance {
  const parties = lignes.filter((l) => ok(l.jalons.exportReel));
  const cycles = parties.map((l) => cycleCommande(l.jalons, aujourdhui));
  const datees = cycles.filter((c) => c.ecartExport != null);
  const aLHeure = datees.filter((c) => c.ecartExport! <= 0).length;
  const retards = datees.filter((c) => c.ecartExport! > 0).map((c) => c.ecartExport);
  const tds = lignes.filter((l) => l.premiereTdsOk != null);
  const qc = lignes.filter((l) => l.controleOk != null);
  return {
    expediees: parties.length,
    aLHeure,
    pctALHeure: pct(aLHeure, datees.length),
    ecartMoyen: moyenne(datees.map((c) => c.ecartExport)),
    retardMoyen: moyenne(retards),
    cycleMoyen: moyenne(cycles.map((c) => c.total)),
    delaiUsineMoyen: moyenne(cycles.map((c) => c.delaiUsine)),
    fabricationMoyenne: moyenne(cycles.map((c) => c.fabrication)),
    piecesLivrees: parties.reduce((s, l) => s + l.pieces, 0),
    pctTdsOk: pct(tds.filter((l) => l.premiereTdsOk).length, tds.length),
    pctControleOk: pct(qc.filter((l) => l.controleOk).length, qc.length),
  };
}

/** Libellé du respect du délai, vu du client. */
export function libelleEcart(ecart: number | null): { texte: string; ton: "vert" | "orange" | "rouge" | "gris" } {
  if (ecart == null) return { texte: "—", ton: "gris" };
  if (ecart < 0) return { texte: `${-ecart} j d'avance`, ton: "vert" };
  if (ecart === 0) return { texte: "le jour prévu", ton: "vert" };
  if (ecart <= 3) return { texte: `+${ecart} j`, ton: "orange" };
  return { texte: `+${ecart} j de retard`, ton: "rouge" };
}

export type Evenement = { date: string; quoi: string; detail: string };
/** Trie les événements de la traçabilité (le plus ancien d'abord). */
export const trierEvenements = (e: Evenement[]) => e.filter((x) => ok(x.date)).sort((a, b) => a.date.localeCompare(b.date));
