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

export const FAMILLES_DEFAUT = [
  "Coutures",
  "Aspect / Matière",
  "Mesures",
  "Accessoires",
  "Repassage",
  "Étiquetage",
  "Emballage",
] as const;

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
