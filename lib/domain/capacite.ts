/* CAPACITÉ — calculée par le SAM, jamais codée en dur (cahier des charges §29).
 *
 * L'écran Capacité affichait des KPI en littéral (« 121 pcs », « 1 259 € »,
 * « 2 904 pcs »). Ce module donne les formules qui les remplacent, à partir des
 * chaînes, des effectifs, du SAM et des heures — les données déjà en base.
 *
 * Pur : pas de DB, pas de React. SAM en secondes/pièce. */

/** Une chaîne réduite à ce qu'il faut pour sa capacité. */
export type ChaineCapacite = {
  nom: string;
  /** Effectif de référence (ou nombre d'ouvrières). */
  effectif: number;
  /** Heures travaillées par jour (décimales). */
  nbHeures: number;
  /** SAM du modèle actuellement monté sur la chaîne (sec/pièce). 0 = inconnu. */
  samSec: number;
  /** Coût horaire main-d'œuvre par personne (optionnel, pour le coût MO). */
  coutHoraire?: number;
};

/** Pièces/jour qu'une chaîne peut sortir à rendement 100 % (capacité théorique). */
export function capaciteChaineJour(c: ChaineCapacite): number {
  if (!c.samSec || c.samSec <= 0) return 0;
  const secondesDispo = (c.effectif || 0) * (c.nbHeures || 0) * 3600;
  return Math.floor(secondesDispo / c.samSec);
}

/** Pièces/jour attendues à un rendement donné (0–100). */
export function capaciteChaineRendement(c: ChaineCapacite, rendementPct: number): number {
  return Math.floor((capaciteChaineJour(c) * Math.max(0, rendementPct)) / 100);
}

/** Coût main-d'œuvre d'une chaîne pour une journée. */
export function coutMoChaineJour(c: ChaineCapacite): number {
  return Math.round((c.effectif || 0) * (c.nbHeures || 0) * (c.coutHoraire || 0));
}

export type BilanCapacite = {
  capaciteTheoriqueJour: number;
  /** Capacité à un rendement de référence (par défaut 100). */
  capaciteAttendueJour: number;
  coutMoJour: number;
  chaines: number;
};

/** Agrège la capacité de tout l'atelier. `rendementReference` permet une vue
 * réaliste (ex. 75 %) plutôt que la seule capacité théorique. */
export function bilanCapacite(
  chaines: readonly ChaineCapacite[],
  rendementReference = 100,
): BilanCapacite {
  let theorique = 0;
  let attendue = 0;
  let coutMo = 0;
  for (const c of chaines) {
    theorique += capaciteChaineJour(c);
    attendue += capaciteChaineRendement(c, rendementReference);
    coutMo += coutMoChaineJour(c);
  }
  return {
    capaciteTheoriqueJour: theorique,
    capaciteAttendueJour: attendue,
    coutMoJour: coutMo,
    chaines: chaines.length,
  };
}
