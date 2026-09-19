/* MÉMOIRE DU SAM — trois notions distinctes, jamais confondues.
 *
 * Le cahier des charges (§8, §39) distingue :
 *   1. SAM THÉORIQUE / MÉTHODE  — déterminé par le bureau des méthodes (saisi).
 *   2. SAM CONSTATÉ             — observé en production, DÉDUCTION FAITE des
 *                                 temps non productifs (panne, attente matière,
 *                                 attente qualité, changement de modèle…). Sans
 *                                 cette déduction, une panne deviendrait une
 *                                 « difficulté du modèle ».
 *   3. SAM DBS DE RÉFÉRENCE     — valeur historique validée À LA MAIN, proposée
 *                                 à partir des séries passées. Elle n'écrase
 *                                 JAMAIS le SAM théorique : la décision reste
 *                                 humaine.
 *
 * Tout est pur : pas de DB, pas de React. Le SAM est en SECONDES par pièce. */

/** Une journée réduite à ce qu'il faut pour en tirer un SAM constaté. */
export type JourneeSam = {
  /** Pièces sorties dans la journée (total chaîne). */
  pieces: number;
  effectif: number;
  /** Heures de présence de la journée (décimales : 8,5). */
  nbHeures: number;
  /** Minutes NON PRODUCTIVES de la journée (somme des arrêts), à déduire. */
  minutesArret?: number;
};

/** Secondes de travail réellement productives d'une journée. */
export function secondesProductives(j: JourneeSam): number {
  const brut = (j.effectif || 0) * (j.nbHeures || 0) * 3600;
  const arret = Math.max(0, (j.minutesArret || 0) * 60);
  return Math.max(0, brut - arret);
}

/** SAM constaté d'UNE journée (sec/pièce), ou null si rien produit. */
export function samConstateJournee(j: JourneeSam): number | null {
  const pieces = j.pieces || 0;
  if (pieces <= 0) return null;
  return secondesProductives(j) / pieces;
}

/**
 * SAM constaté d'une SÉRIE de journées, agrégé CORRECTEMENT.
 *
 * On ne fait pas la moyenne des SAM journaliers (une journée de 10 pièces
 * pèserait autant qu'une de 500, cf. audit §21) : on somme les secondes
 * productives et on divise par le total des pièces. C'est la seule agrégation
 * qui a un sens physique. Null si la série n'a rien produit.
 */
export function samConstateSerie(journees: readonly JourneeSam[]): number | null {
  let sec = 0;
  let pieces = 0;
  for (const j of journees) {
    sec += secondesProductives(j);
    pieces += j.pieces || 0;
  }
  if (pieces <= 0) return null;
  return sec / pieces;
}

/** Écart en % entre SAM constaté et SAM théorique (positif = plus lent que prévu). */
export function ecartSamPct(theorique: number | null | undefined, constate: number | null | undefined): number | null {
  const t = theorique ?? 0;
  const c = constate ?? 0;
  if (t <= 0 || c <= 0) return null;
  return ((c - t) / t) * 100;
}

/** Une série passée de la référence, telle que l'historique la porte. */
export type SerieHistorique = {
  /** Étiquette : n° OF ou identifiant de série. */
  ref: string;
  samConstate: number | null;
  pieces: number;
  rendementMoyen?: number | null;
  date?: string;
};

export type PropositionSamDbs = {
  /** Valeur proposée (sec/pièce), pondérée par les pièces. Null si pas d'historique. */
  propose: number | null;
  /** Nombre de séries prises en compte. */
  series: number;
  /** Total des pièces de l'historique retenu. */
  pieces: number;
  /** Étendue observée [min, max] des SAM constatés, pour juger la dispersion. */
  etendue: [number, number] | null;
};

/**
 * Propose une valeur de SAM DBS de référence à partir de l'historique.
 *
 * C'est une PROPOSITION, jamais une décision : on retourne la valeur pondérée
 * par les pièces (une grosse série pèse plus qu'un essai de 10 pièces) et
 * l'étendue observée, pour que l'humain juge. On n'écrit rien, on ne remplace
 * aucun SAM théorique.
 */
export function proposerSamDbs(historique: readonly SerieHistorique[]): PropositionSamDbs {
  const valides = historique.filter((s) => (s.samConstate ?? 0) > 0 && (s.pieces ?? 0) > 0);
  if (!valides.length) return { propose: null, series: 0, pieces: 0, etendue: null };

  let sommePonderee = 0;
  let pieces = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const s of valides) {
    const sam = s.samConstate as number;
    sommePonderee += sam * s.pieces;
    pieces += s.pieces;
    if (sam < min) min = sam;
    if (sam > max) max = sam;
  }
  return {
    propose: Math.round(sommePonderee / pieces),
    series: valides.length,
    pieces,
    etendue: [Math.round(min), Math.round(max)],
  };
}
