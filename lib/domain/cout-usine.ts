/* Coût de l'heure à l'usine — calcul pur, sans base ni écran.
 *
 * Principe retenu avec la direction : ce sont les ouvrières DIRECTES (celles
 * qui produisent en chaîne, suivies dans la GPAO) qui paient toute l'usine —
 * leurs propres salaires, mais aussi les indirectes (chefs, coupe, contrôle,
 * finition, magasins, bureau) et la structure (loyer, énergie, machines…).
 * Le coût complet d'une heure est donc :
 *
 *     charges mensuelles totales ÷ (ouvrières directes × heures par mois)
 *
 * Ex. DBS : 44 000 € ÷ (45 × 195 h) = 44 000 ÷ 8 775 h ≈ 5,01 €/h.
 *
 * C'est le coût STANDARD : celui d'une heure payée. Mais la GPAO n'enregistre
 * que les heures réellement saisies (hors absences, RI, arrêts, oublis de
 * saisie). Les charges, elles, tombent quoi qu'il arrive. Sur une période, on
 * répartit donc les charges au prorata du calendrier, puis on les divise par
 * les heures RÉELLEMENT saisies : c'est le coût horaire RÉEL de la période, et
 * c'est lui qui donne une marge honnête (les 44 000 € sont toujours couverts,
 * quelle que soit la qualité de saisie). */

export type ParamsUsine = {
  /** Charges mensuelles totales de l'usine (€) : salaires directs + indirects + structure. */
  chargesMensuelles: number;
  /** Nombre moyen d'ouvrières directes (en chaîne, suivies en GPAO). */
  effectifDirect: number;
  /** Heures travaillées par ouvrière et par mois. */
  heuresMois: number;
  /* ── objectifs de rentabilité (écran Rentabilité, prix plancher) ── */
  /** Rendement visé en % (sert au prix plancher et au chiffrage du sous-rendement). */
  rendementCible: number;
  /** Marge visée en % du prix de vente (prix plancher). */
  margeCible: number;
  /** Minutes pour reprendre une pièce en retouche — 0 = retouches non chiffrées. */
  minutesRetouche: number;
};

/** Valeurs par défaut des objectifs, tant que la direction ne les a pas réglés. */
export const OBJECTIFS_DEFAUT = { rendementCible: 80, margeCible: 15, minutesRetouche: 0 } as const;

export const PARAMS_USINE_VIDES: ParamsUsine = {
  chargesMensuelles: 0,
  effectifDirect: 0,
  heuresMois: 0,
  ...OBJECTIFS_DEFAUT,
};

/** Longueur moyenne d'un mois en jours (365,25 / 12). */
export const JOURS_PAR_MOIS = 365.25 / 12;

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** Nombre de jours calendaires d'une période, bornes incluses (0 si invalide). */
export function joursPeriode(from: string, to: string): number {
  if (!ISO.test(from) || !ISO.test(to)) return 0;
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  if (b < a) return 0;
  return Math.round((b - a) / 86_400_000) + 1;
}

/** Durée de la période exprimée en mois (au prorata du calendrier). */
export const moisPeriode = (from: string, to: string) => joursPeriode(from, to) / JOURS_PAR_MOIS;

export const paramsComplets = (p: ParamsUsine) => p.chargesMensuelles > 0 && p.effectifDirect > 0 && p.heuresMois > 0;

/** Heures payées par mois pour tout l'effectif direct (45 × 195 = 8 775 h). */
export const heuresMensuellesUsine = (p: ParamsUsine) => p.effectifDirect * p.heuresMois;

/** Coût standard d'une heure d'ouvrière directe (charges ÷ heures payées). */
export function coutHoraireStandard(p: ParamsUsine): number | null {
  const h = heuresMensuellesUsine(p);
  return p.chargesMensuelles > 0 && h > 0 ? p.chargesMensuelles / h : null;
}

export type BilanCoutUsine = {
  jours: number;
  mois: number;
  /** Charges de l'usine imputables à la période (prorata calendrier). */
  chargesPeriode: number;
  /** Heures payées attendues sur la période (effectif × heures/mois × mois). */
  heuresTheoriques: number;
  /** Heures réellement saisies en GPAO. */
  heuresSaisies: number;
  /** Part des heures payées effectivement saisies en GPAO (0–1), null si inconnue. */
  tauxSaisie: number | null;
  coutHoraireStandard: number | null;
  /** Charges de la période ÷ heures saisies — le vrai coût d'une heure enregistrée. */
  coutHoraireReel: number | null;
  ca: number;
  pieces: number;
  /** CA − charges de la période. */
  marge: number;
  /** Marge rapportée au CA (0–1), null sans CA. */
  tauxMarge: number | null;
  /** Charges de la période ÷ pièces produites. */
  coutPiece: number | null;
  /** CA qu'il faut produire sur la période pour couvrir les charges. */
  caPointMort: number;
};

export function bilanCoutUsine(
  p: ParamsUsine,
  periode: { from: string; to: string; heuresSaisies: number; ca: number; pieces: number },
): BilanCoutUsine {
  const jours = joursPeriode(periode.from, periode.to);
  const mois = jours / JOURS_PAR_MOIS;
  const chargesPeriode = p.chargesMensuelles * mois;
  const heuresTheoriques = heuresMensuellesUsine(p) * mois;
  const hs = Math.max(0, periode.heuresSaisies);
  const marge = periode.ca - chargesPeriode;
  return {
    jours,
    mois,
    chargesPeriode,
    heuresTheoriques,
    heuresSaisies: hs,
    tauxSaisie: heuresTheoriques > 0 ? hs / heuresTheoriques : null,
    coutHoraireStandard: coutHoraireStandard(p),
    coutHoraireReel: chargesPeriode > 0 && hs > 0 ? chargesPeriode / hs : null,
    ca: periode.ca,
    pieces: periode.pieces,
    marge,
    tauxMarge: periode.ca > 0 ? marge / periode.ca : null,
    coutPiece: chargesPeriode > 0 && periode.pieces > 0 ? chargesPeriode / periode.pieces : null,
    caPointMort: chargesPeriode,
  };
}

/** Nettoie une saisie : nombres finis positifs, sinon 0. */
export function normaliserParams(v: unknown): ParamsUsine {
  const o = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const lire = (x: unknown) => (typeof x === "string" ? Number(x.replace(",", ".")) : Number(x));
  const n = (x: unknown) => {
    const k = lire(x);
    return Number.isFinite(k) && k > 0 ? k : 0;
  };
  /** Objectif borné ; absent ou invalide → valeur par défaut. */
  const obj = (x: unknown, defaut: number, min: number, max: number) => {
    if (x === undefined || x === null || x === "") return defaut;
    const k = lire(x);
    return Number.isFinite(k) ? Math.min(max, Math.max(min, k)) : defaut;
  };
  return {
    chargesMensuelles: n(o.chargesMensuelles),
    effectifDirect: n(o.effectifDirect),
    heuresMois: n(o.heuresMois),
    rendementCible: obj(o.rendementCible, OBJECTIFS_DEFAUT.rendementCible, 1, 150),
    margeCible: obj(o.margeCible, OBJECTIFS_DEFAUT.margeCible, 0, 90),
    minutesRetouche: obj(o.minutesRetouche, OBJECTIFS_DEFAUT.minutesRetouche, 0, 600),
  };
}
