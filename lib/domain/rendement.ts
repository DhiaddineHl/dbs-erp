/* Rendement d'une ouvrière, tel que le portail QR le présente.
 *
 * Le rendement général est la moyenne PONDÉRÉE par les heures travaillées :
 * Σ(gagné) ÷ Σ(heures × 3600). Une journée pleine pèse plus qu'une demi-journée.
 * C'est la même définition que l'écran GPAO (journées et historique) et que la
 * recherche par seuil — un seul et même chiffre pour une personne, partout. */

/* Seuils et couleurs : UNE échelle pour l'écran GPAO, la TV et le portail QR.
 *   ≥ 85 % vert (bon) · ≥ 60 % orange (moyen) · en dessous rouge (faible).
 * Le seuil d'ALERTE (« objectif non atteint ») est le réglage de l'atelier
 * (gpao.seuilAlerte, 65 % par défaut), le même qu'à la TV. */
export const SEUIL_BON = 85;
export const SEUIL_MOYEN = 60;
export const SEUIL_ALERTE_DEFAUT = 65;
export const CLE_SEUIL_ALERTE = "gpao.seuilAlerte";

export type OpDetail = { poste: string; sam: number; qte: number };

/** Ce qu'il faut d'une journée pour mesurer un rendement. Les matrices
 * secondaires sont facultatives : l'écran GPAO les omet quand elles sont vides. */
export type JourneeBrute = {
  date: string;
  cols: string[];
  ops: Record<number, Record<string, number | "RI" | "ABS">>;
  opsSam?: Record<number, Record<string, number>>;
  opsDetail?: Record<number, Record<string, OpDetail[]>>;
  ret?: Record<number, number>;
};

export type OuvriereBrute = { id: number; nom: string; poste: string; sam: number };

/** Quantité produite dans l'heure : le détail multi-postes l'emporte. */
export function qteHeure(j: JourneeBrute, ouvId: number, col: string): number {
  const d = j.opsDetail?.[ouvId]?.[col];
  if (d?.length) return d.reduce((t, x) => t + (Number(x.qte) || 0), 0);
  const v = j.ops?.[ouvId]?.[col];
  return typeof v === "number" ? v : 0;
}

/** SAM appliqué dans l'heure : surcharge horaire, sinon le SAM du poste. */
export function samHeure(j: JourneeBrute, o: OuvriereBrute, col: string): number {
  const m = j.opsSam?.[o.id]?.[col];
  return m && m > 0 ? m : o.sam;
}

/** Secondes « gagnées » dans l'heure = Σ(quantité × SAM). */
export function gagneHeure(j: JourneeBrute, o: OuvriereBrute, col: string): number {
  const d = j.opsDetail?.[o.id]?.[col];
  if (d?.length) return d.reduce((t, x) => t + (Number(x.qte) || 0) * (Number(x.sam) || 0), 0);
  const v = j.ops?.[o.id]?.[col];
  return typeof v === "number" ? v * samHeure(j, o, col) : 0;
}

/** Une heure compte comme travaillée dès qu'une saisie existe — y compris à
 * zéro. RI et ABS n'en sont pas : ce sont des marqueurs, pas des quantités. */
export function heureTravaillee(j: JourneeBrute, ouvId: number, col: string): boolean {
  const d = j.opsDetail?.[ouvId]?.[col];
  if (d?.length) return true;
  return typeof j.ops?.[ouvId]?.[col] === "number";
}

export type BarreHeure = { col: string; pct: number | null; qte: number };
export type JourRendement = {
  date: string;
  rendement: number | null;
  pieces: number;
  retouches: number;
  barres: BarreHeure[];
};

export type Rendement = {
  nom: string;
  matricule: string;
  poste: string;
  /** Aucune production enregistrée : la personne existe, la mesure non. */
  trouve: boolean;
  /** Rendement général = moyenne pondérée sur la PÉRIODE DE RÉFÉRENCE (30
   * derniers jours), la même que l'historique par défaut. */
  general: number | null;
  /** Bornes de la période de référence et nombre de journées qu'elle contient. */
  periode: { from: string; to: string; jours: number };
  /** Mois en cours, même calcul. */
  mois: { rendement: number | null; jours: number };
  /** Toutes les journées, anciennes comprises (pour l'historique du portail). */
  jours: JourRendement[];
  dernier: JourRendement | null;
  /** Totaux de la période de référence. */
  piecesTotal: number;
  retouchesTotal: number;
};

/* Le calcul d'une personne sur plusieurs journées vit dans
 * ./rendement-personne (identité + moyenne), partagé avec l'écran GPAO. */

export type NiveauRendement = "bon" | "moyen" | "faible";

export function niveau(pct: number | null): NiveauRendement | null {
  if (pct === null) return null;
  return pct >= SEUIL_BON ? "bon" : pct >= SEUIL_MOYEN ? "moyen" : "faible";
}

export const COULEUR_RENDEMENT: Record<NiveauRendement, string> = {
  bon: "#19b27b",
  moyen: "#c4861a",
  faible: "#e04545",
};

/* ─────────── vue direction ─────────── */

export type LigneChaine = {
  chaine: string;
  modele: string;
  date: string;
  effectif: number;
  objectifHeure: number;
  sortie: number;
  rendement: number;
  parHeure: { col: string; qte: number; objectif: number }[];
};

/** Rendement d'une chaîne sur une journée : production × SAM du modèle,
 * rapporté au temps de présence total. */
export function rendementChaine(input: {
  sortieTotale: number;
  samModele: number;
  effectif: number;
  nbHeures: number;
}): number {
  const dispo = input.effectif * input.nbHeures * 3600;
  if (dispo <= 0) return 0;
  return Math.round(((input.sortieTotale * input.samModele) / dispo) * 100);
}

export function objectifHeure(effectif: number, samModele: number, manuel?: number | null): number {
  if (manuel && manuel > 0) return manuel;
  if (samModele <= 0) return 0;
  return Math.round((effectif * 3600) / samModele);
}
