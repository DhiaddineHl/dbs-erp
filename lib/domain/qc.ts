import type { Tone } from "@/components/shared/status-badge";
import { normaliserNom } from "./commande";

/* Contrôle qualité produit fini — plan d'échantillonnage AQL et verdict.
 *
 * Porté de PilotPro (qcAql / qcVerdictAuto / qcEcart / qcMatchBareme). Pur :
 * le verdict se recalcule à chaque lecture tant que l'inspection est ouverte,
 * et se fige à la clôture. */

/* ─────────── plan d'échantillonnage ───────────
 * [lot max, taille d'échantillon, Ac AQL 2,5 (majeurs), Ac AQL 4,0 (mineurs)]
 * Niveau de contrôle II, plan simple normal (ISO 2859-1). */
const TABLE_AQL: [number, number, number, number][] = [
  [8, 2, 0, 0],
  [15, 3, 0, 0],
  [25, 5, 0, 0],
  [50, 8, 0, 1],
  [90, 13, 1, 1],
  [150, 20, 1, 2],
  [280, 32, 2, 3],
  [500, 50, 3, 5],
  [1200, 80, 5, 7],
  [3200, 125, 7, 10],
  [10000, 200, 10, 14],
  [35000, 315, 14, 21],
];

export type PlanAql = {
  /** Nombre de pièces à contrôler. */
  n: number;
  /** Acceptation / refus en AQL 2,5 (défauts majeurs). */
  ac25: number;
  re25: number;
  /** Acceptation / refus en AQL 4,0 (défauts mineurs). */
  ac40: number;
  re40: number;
};

export function planAql(lot: number): PlanAql {
  const taille = Math.trunc(lot) || 0;
  if (taille < 2) return { n: Math.max(taille, 0), ac25: 0, re25: 1, ac40: 0, re40: 1 };
  for (const [max, n, ac25, ac40] of TABLE_AQL) {
    if (taille <= max) return { n: Math.min(n, taille), ac25, re25: ac25 + 1, ac40, re40: ac40 + 1 };
  }
  return { n: 500, ac25: 21, re25: 22, ac40: 21, re40: 22 };
}

/* ─────────── référentiels ─────────── */

/* Familles historiques (données déjà en base). On garde ces sept-là pour ne
 * pas casser les inspections existantes, et on en ajoute d'autres demandées par
 * l'atelier — l'union sert de liste de saisie ; l'affichage regroupe par
 * famille dans l'ordre ci-dessous. */
export const FAMILLES_DEFAUT = [
  "Coutures",
  "Aspect / Matière",
  "Mesures",
  "Accessoires",
  "Repassage",
  "Étiquetage",
  "Emballage",
  "Tache",
  "Coloris",
  "Montage",
  "Finition",
  "Autre",
] as const;

/** Types de contrôle qualité (étapes du process). */
export type TypeControle = "ppm" | "inline" | "prefinal" | "final";
export const TYPES_CONTROLE: { value: TypeControle; label: string; court: string }[] = [
  { value: "ppm", label: "PPM — réunion de pré-production", court: "PPM" },
  { value: "inline", label: "Inline — en cours de production", court: "INLINE" },
  { value: "prefinal", label: "Pré-final", court: "PRE-FINAL" },
  { value: "final", label: "Final", court: "FINAL" },
];
export const libelleType = (v: string) => TYPES_CONTROLE.find((t) => t.value === v)?.court ?? "FINAL";

/** Statuts d'une action corrective (workflow de suivi). */
export type StatutAction = "a_traiter" | "en_cours" | "corrige" | "verifie" | "cloture";
export const STATUTS_ACTION: { value: StatutAction; label: string; tone: Tone }[] = [
  { value: "a_traiter", label: "À traiter", tone: "danger" },
  { value: "en_cours", label: "En cours", tone: "warning" },
  { value: "corrige", label: "Corrigé", tone: "brand" },
  { value: "verifie", label: "Vérifié", tone: "success" },
  { value: "cloture", label: "Clôturé", tone: "neutral" },
];
export const statutActionLabel = (v: string) => STATUTS_ACTION.find((s) => s.value === v)?.label ?? v;
export const actionOuverte = (statut: string) => statut !== "verifie" && statut !== "cloture";

/** Réponses possibles à un point de checklist. */
export type StatutPoint = "" | "ok" | "ko" | "na";
export const STATUTS_POINT: { value: StatutPoint; label: string; court: string; tone: Tone }[] = [
  { value: "", label: "À vérifier", court: "—", tone: "neutral" },
  { value: "ok", label: "Conforme", court: "OK", tone: "success" },
  { value: "ko", label: "Non conforme", court: "KO", tone: "danger" },
  { value: "na", label: "Non applicable", court: "N/A", tone: "neutral" },
];
export const statutPointLabel = (v: string) => STATUTS_POINT.find((s) => s.value === v)?.court ?? "—";

export const POINTS_MESURE = [
  "1/2 Poitrine", "1/2 Taille", "1/2 Bas", "Longueur devant", "Longueur dos",
  "Carrure dos", "Épaules", "Longueur manche", "Tour de bras", "Encolure",
  "Longueur totale", "Entrejambe", "Montant devant", "Montant dos",
] as const;

export type Gravite = "critique" | "majeur" | "mineur";
export const GRAVITES: { value: Gravite; label: string; tone: Tone }[] = [
  { value: "critique", label: "Critique", tone: "danger" },
  { value: "majeur", label: "Majeur", tone: "warning" },
  { value: "mineur", label: "Mineur", tone: "neutral" },
];

export type Verdict = "accepte" | "reserve" | "refuse";
export const VERDICTS: Record<Verdict, { label: string; tone: Tone }> = {
  accepte: { label: "✅ ACCEPTÉ", tone: "success" },
  reserve: { label: "⚠️ ACCEPTÉ SOUS RÉSERVE", tone: "warning" },
  refuse: { label: "⛔ REFUSÉ", tone: "danger" },
};
export const estVerdict = (v: unknown): v is Verdict => v === "accepte" || v === "reserve" || v === "refuse";

/* ─────────── mesures ─────────── */

export type Mesure = {
  point: string;
  taille: string;
  spec: number | null;
  tolerance: number | null;
  mesure: number | null;
};

export type EcartMesure = { ecart: number | null; horsTolerance: boolean };

/** Écart mesuré − spec. Sans tolérance déclarée, tout écart non nul est hors
 * tolérance — c'est la règle de PilotPro, volontairement stricte. */
export function ecartMesure(m: Mesure): EcartMesure {
  if (m.spec == null || m.mesure == null) return { ecart: null, horsTolerance: false };
  const ecart = Math.round((m.mesure - m.spec) * 100) / 100;
  const tol = Math.abs(m.tolerance ?? 0);
  return { ecart, horsTolerance: tol > 0 ? Math.abs(ecart) > tol : ecart !== 0 };
}

/* ─────────── verdict ─────────── */

export type Defaut = { gravite: string; nombre: number };

export type PropositionVerdict = {
  verdict: Verdict;
  critiques: number;
  /** Défauts majeurs + mesures hors tolérance. */
  majeurs: number;
  mineurs: number;
  plan: PlanAql;
  raison: string;
};

/** La proposition AQL : un critique refuse d'office, sinon les seuils de refus
 * s'appliquent. Une mesure hors tolérance compte comme un défaut majeur. */
export function proposerVerdict(lot: number, defauts: Defaut[], mesures: Mesure[]): PropositionVerdict {
  const plan = planAql(lot);
  let critiques = 0;
  let majeurs = 0;
  let mineurs = 0;
  for (const d of defauts) {
    const n = Math.trunc(d.nombre) || 0;
    if (d.gravite === "critique") critiques += n;
    else if (d.gravite === "majeur") majeurs += n;
    else mineurs += n;
  }
  const mesuresHors = mesures.filter((m) => ecartMesure(m).horsTolerance).length;
  const majeursTotal = majeurs + mesuresHors;

  if (critiques > 0) {
    return { verdict: "refuse", critiques, majeurs: majeursTotal, mineurs, plan, raison: "Défaut(s) critique(s) détecté(s)" };
  }
  if (majeursTotal >= plan.re25) {
    return {
      verdict: "refuse", critiques, majeurs: majeursTotal, mineurs, plan,
      raison: `Majeurs ${majeursTotal} ≥ seuil de refus ${plan.re25} (AQL 2,5)`,
    };
  }
  if (mineurs >= plan.re40) {
    return {
      verdict: "refuse", critiques, majeurs: majeursTotal, mineurs, plan,
      raison: `Mineurs ${mineurs} ≥ seuil de refus ${plan.re40} (AQL 4,0)`,
    };
  }
  return {
    verdict: "accepte", critiques, majeurs: majeursTotal, mineurs, plan,
    raison: `Majeurs ${majeursTotal} ≤ ${plan.ac25} et mineurs ${mineurs} ≤ ${plan.ac40}`,
  };
}

/** Le verdict affiché : figé si l'inspection est clôturée, sinon le forçage du
 * contrôleur, sinon la proposition AQL. */
export function verdictEffectif(insp: {
  statut: string;
  verdictForce: string;
  verdictCloture: string;
}, proposition: Verdict): Verdict {
  if (insp.statut === "cloture" && estVerdict(insp.verdictCloture)) return insp.verdictCloture;
  if (estVerdict(insp.verdictForce)) return insp.verdictForce;
  return proposition;
}

/* ─────────── appariement des barèmes ─────────── */

export type BaremeCandidat = { id: number; nom: string; refs: string[] };

/** Barème dont une référence recoupe le modèle ou la référence article de
 * l'inspection, dans un sens ou dans l'autre (les codes clients sont parfois
 * un préfixe du modèle : "DEC51C" ↔ "DEC51C Chemisier"). */
export function apparierBareme<T extends BaremeCandidat>(
  baremes: T[],
  insp: { modele: string; ref: string },
): T | null {
  const M = (insp.modele || "").toUpperCase();
  const R = (insp.ref || "").toUpperCase();
  return (
    baremes.find((b) =>
      (b.refs ?? []).some((r) => {
        const ref = String(r).toUpperCase();
        if (!ref) return false;
        return (M && (M.includes(ref) || ref.includes(M))) || (R && (R.includes(ref) || ref.includes(R)));
      }),
    ) ?? null
  );
}

/** Numéro d'inspection affiché : QC-001. */
export const numeroQc = (n: number) => `QC-${String(n).padStart(3, "0")}`;

/** Les inspections d'un même modèle, pour le bilan. */
export const memeModele = (a: string, b: string) => normaliserNom(a) === normaliserNom(b);

/* ─────────── tableau de bord & historique ───────────
 *
 * Agrégats calculés à partir des inspections clôturées uniquement : un
 * brouillon n'a pas de verdict définitif et fausserait un taux de conformité.
 * Tout est dérivé — aucune donnée nouvelle à stocker. */

export type DefautStat = { famille: string; gravite: string; nombre: number };

/** Forme minimale attendue par les agrégats — un sous-ensemble d'InspectionRow,
 * pour que le calcul reste testable sans la couche service. */
export type InspectionBilan = {
  statut: string;
  verdict: Verdict;
  date: string;
  client: string;
  modele: string;
  ref: string;
  lot: number;
  totalDefauts: number;
  defauts: DefautStat[];
  actions?: { statut: string }[];
  proposition: { critiques: number; majeurs: number; mineurs: number };
};

export type ParetoLigne = { famille: string; nombre: number; pct: number };
export type RefFaible = { cle: string; modele: string; controles: number; refuses: number; defauts: number };
export type PointTemps = { periode: string; controles: number; conformes: number; taux: number | null };
export type ParClient = { client: string; controles: number; conformes: number; taux: number | null; defauts: number };

export type DashboardQualite = {
  controles: number;
  piecesControlees: number;
  acceptes: number;
  reserves: number;
  refuses: number;
  tauxConformite: number | null;
  defautsTotal: number;
  critiques: number;
  majeurs: number;
  mineurs: number;
  pareto: ParetoLigne[];
  refsFaibles: RefFaible[];
  parMois: PointTemps[];
  parClient: ParClient[];
  actionsOuvertes: number;
};

/** « Conforme » au sens du tableau de bord = accepté ou accepté sous réserve :
 * le lot est parti. Seul le refus compte comme non conforme. */
const estConforme = (v: Verdict) => v === "accepte" || v === "reserve";

export function calculerDashboard(inspections: InspectionBilan[], familles: readonly string[]): DashboardQualite {
  const clos = inspections.filter((i) => i.statut === "cloture");
  const controles = clos.length;
  const acceptes = clos.filter((i) => i.verdict === "accepte").length;
  const reserves = clos.filter((i) => i.verdict === "reserve").length;
  const refuses = clos.filter((i) => i.verdict === "refuse").length;
  const conformes = acceptes + reserves;

  let critiques = 0;
  let majeurs = 0;
  let mineurs = 0;
  const parFamille = new Map<string, number>();
  for (const i of clos) {
    critiques += i.proposition.critiques;
    majeurs += i.proposition.majeurs;
    mineurs += i.proposition.mineurs;
    for (const d of i.defauts) {
      parFamille.set(d.famille, (parFamille.get(d.famille) ?? 0) + d.nombre);
    }
  }
  const defautsTotal = [...parFamille.values()].reduce((s, n) => s + n, 0);

  /* Pareto : familles triées par fréquence décroissante, avec leur poids. */
  const pareto: ParetoLigne[] = [...parFamille.entries()]
    .map(([famille, nombre]) => ({ famille, nombre, pct: defautsTotal ? Math.round((nombre / defautsTotal) * 100) : 0 }))
    .sort((a, b) => b.nombre - a.nombre);

  /* Références les plus problématiques : par modèle normalisé. */
  const parRef = new Map<string, RefFaible>();
  for (const i of clos) {
    const cle = normaliserNom(i.modele) || normaliserNom(i.ref) || "—";
    const r = parRef.get(cle) ?? { cle, modele: i.modele || i.ref || "—", controles: 0, refuses: 0, defauts: 0 };
    r.controles += 1;
    if (i.verdict === "refuse") r.refuses += 1;
    r.defauts += i.totalDefauts;
    parRef.set(cle, r);
  }
  const refsFaibles = [...parRef.values()]
    .sort((a, b) => b.refuses - a.refuses || b.defauts - a.defauts)
    .slice(0, 10);

  /* Évolution par mois (YYYY-MM), ordre chronologique. */
  const parMoisMap = new Map<string, { controles: number; conformes: number }>();
  for (const i of clos) {
    const periode = /^\d{4}-\d{2}/.test(i.date) ? i.date.slice(0, 7) : "—";
    const m = parMoisMap.get(periode) ?? { controles: 0, conformes: 0 };
    m.controles += 1;
    if (estConforme(i.verdict)) m.conformes += 1;
    parMoisMap.set(periode, m);
  }
  const parMois: PointTemps[] = [...parMoisMap.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([periode, m]) => ({
      periode,
      controles: m.controles,
      conformes: m.conformes,
      taux: m.controles ? Math.round((m.conformes / m.controles) * 100) : null,
    }));

  /* Par client. */
  const parClientMap = new Map<string, { controles: number; conformes: number; defauts: number }>();
  for (const i of clos) {
    const cle = i.client || "—";
    const c = parClientMap.get(cle) ?? { controles: 0, conformes: 0, defauts: 0 };
    c.controles += 1;
    if (estConforme(i.verdict)) c.conformes += 1;
    c.defauts += i.totalDefauts;
    parClientMap.set(cle, c);
  }
  const parClient: ParClient[] = [...parClientMap.entries()]
    .map(([client, c]) => ({
      client,
      controles: c.controles,
      conformes: c.conformes,
      defauts: c.defauts,
      taux: c.controles ? Math.round((c.conformes / c.controles) * 100) : null,
    }))
    .sort((a, b) => b.controles - a.controles);

  // familles est passé pour garder un ordre stable si besoin d'affichage vide.
  void familles;

  /* Actions correctives encore ouvertes (toutes inspections, closes ou non :
   * une action se suit après la clôture). */
  const actionsOuvertes = inspections.reduce(
    (s, i) => s + (i.actions ?? []).filter((a) => actionOuverte(a.statut)).length,
    0,
  );

  return {
    controles,
    piecesControlees: clos.reduce((s, i) => s + i.lot, 0),
    acceptes,
    reserves,
    refuses,
    tauxConformite: controles ? Math.round((conformes / controles) * 100) : null,
    defautsTotal,
    critiques,
    majeurs,
    mineurs,
    pareto,
    refsFaibles,
    parMois,
    parClient,
    actionsOuvertes,
  };
}

/** Historique qualité d'une référence : les contrôles passés d'un même modèle,
 * pour que le contrôleur voie les défauts récurrents avant de commencer. */
export type HistoriqueRef = {
  controles: number;
  refuses: number;
  tauxConformite: number | null;
  defautsRecurrents: ParetoLigne[];
  derniers: { date: string; verdict: Verdict; totalDefauts: number; numero?: number }[];
};

export function historiqueReference(
  inspections: (InspectionBilan & { numero?: number })[],
  modele: string,
): HistoriqueRef {
  const clos = inspections.filter((i) => i.statut === "cloture" && memeModele(i.modele, modele));
  const controles = clos.length;
  const refuses = clos.filter((i) => i.verdict === "refuse").length;
  const conformes = clos.filter((i) => estConforme(i.verdict)).length;

  const parFamille = new Map<string, number>();
  for (const i of clos) for (const d of i.defauts) parFamille.set(d.famille, (parFamille.get(d.famille) ?? 0) + d.nombre);
  const total = [...parFamille.values()].reduce((s, n) => s + n, 0);
  const defautsRecurrents = [...parFamille.entries()]
    .map(([famille, nombre]) => ({ famille, nombre, pct: total ? Math.round((nombre / total) * 100) : 0 }))
    .sort((a, b) => b.nombre - a.nombre)
    .slice(0, 5);

  const derniers = [...clos]
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 5)
    .map((i) => ({ date: i.date, verdict: i.verdict, totalDefauts: i.totalDefauts, numero: i.numero }));

  return {
    controles,
    refuses,
    tauxConformite: controles ? Math.round((conformes / controles) * 100) : null,
    defautsRecurrents,
    derniers,
  };
}
