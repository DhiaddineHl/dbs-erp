import type { Tone } from "@/components/shared/status-badge";

/* Encaissements clients et comptes fournisseurs.
 *
 * Porté de l'application de facturation et du grand livre du client
 * (dueDays / dueDate / totalRegle / reste / payStatusV2 / recompute / getStatus).
 * Pur : aucun solde, aucun statut, aucune échéance n'est stocké. */

export const MODES_PAIEMENT = [
  "Virement",
  "Lettre de crédit (LC)",
  "Traite",
  "Chèque",
  "Espèces",
  "Compensation",
  "Autre",
] as const;

export const COMPTES_DEFAUT = ["BIAT - EUR", "Attijari Bank - EUR", "UIB - EUR", "Amen Bank - EUR"];

/* ─────────── échéance ─────────── */

/** Délai en jours lu dans le mode de paiement : « Virement 30j date de
 * livraison » → 30, « paiement d'avance » → 0. null si rien n'est exprimé. */
export function joursEcheance(paiement: string | null | undefined): number | null {
  const p = (paiement ?? "").toLowerCase();
  const m = p.match(/(\d+)\s*j/);
  if (m) return parseInt(m[1], 10);
  if (p.includes("avance")) return 0;
  return null;
}

/** Date d'échéance, ou null quand le mode de paiement n'en exprime aucune. */
export function dateEcheance(dateFacture: string, paiement: string | null | undefined): string | null {
  const j = joursEcheance(paiement);
  if (j === null) return null;
  const d = new Date(`${dateFacture}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setDate(d.getDate() + j);
  return d.toISOString().slice(0, 10);
}

/** Jours écoulés depuis l'échéance. Positif = en retard, négatif = à échoir. */
export function joursRetard(dateFacture: string, paiement: string | null | undefined, now = new Date()): number | null {
  const ech = dateEcheance(dateFacture, paiement);
  if (!ech) return null;
  const cible = Date.parse(`${ech}T00:00:00`);
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((base - cible) / 86_400_000);
}

/* ─────────── règlements ─────────── */

export type Reglement = { montant: number };

const centimes = (n: number) => Math.round(n * 100) / 100;

export const totalRegle = (reglements: Reglement[]) => centimes(reglements.reduce((s, r) => s + (r.montant || 0), 0));
export const resteDu = (total: number, reglements: Reglement[]) => centimes(total - totalRegle(reglements));

export type StatutPaiement = "paye" | "partiel" | "retard" | "attente";

export const STATUT_PAIEMENT: Record<StatutPaiement, { label: string; tone: Tone }> = {
  paye: { label: "✓ Payée", tone: "success" },
  partiel: { label: "◐ Acompte", tone: "warning" },
  retard: { label: "⚠ En retard", tone: "danger" },
  attente: { label: "En attente", tone: "neutral" },
};

export type FactureFacts = { type: string; date: string; total: number; paiement: string | null };

/** Le statut d'encaissement. Un reste dû nul solde la facture quelle que soit
 * l'échéance ; sinon le retard prime sur l'acompte. */
export function statutPaiement(f: FactureFacts, reglements: Reglement[], now = new Date()): StatutPaiement {
  const reste = resteDu(f.total, reglements);
  const paye = totalRegle(reglements);
  if (reste <= 0.005) return "paye";
  const jr = joursRetard(f.date, f.paiement, now);
  const enRetard = jr !== null && jr > 0;
  if (paye > 0.005) return enRetard ? "retard" : "partiel";
  return enRetard ? "retard" : "attente";
}

/* ─────────── balance âgée ─────────── */

export type BalanceAgee = { nonEchu: number; j0_30: number; j31_60: number; j61_90: number; plus90: number; total: number };

/** Ventilation du reste à encaisser par ancienneté du retard. */
export function balanceAgee(
  lignes: { facture: FactureFacts; reste: number }[],
  now = new Date(),
): BalanceAgee {
  const b: BalanceAgee = { nonEchu: 0, j0_30: 0, j31_60: 0, j61_90: 0, plus90: 0, total: 0 };
  for (const { facture, reste } of lignes) {
    if (reste <= 0.005) continue;
    const jr = joursRetard(facture.date, facture.paiement, now);
    if (jr === null || jr < 0) b.nonEchu += reste;
    else if (jr <= 30) b.j0_30 += reste;
    else if (jr <= 60) b.j31_60 += reste;
    else if (jr <= 90) b.j61_90 += reste;
    else b.plus90 += reste;
    b.total += reste;
  }
  return b;
}

/** Formule l'état d'échéance en clair, pour les e-mails de relance. */
export function libelleEcheance(jr: number): string {
  if (jr > 0) return `échue depuis ${jr} jour${jr > 1 ? "s" : ""}`;
  if (jr === 0) return "échue aujourd'hui";
  return `à échoir dans ${-jr} jour${-jr > 1 ? "s" : ""}`;
}

/* ─────────── grand livre fournisseurs ─────────── */

export type Devise = "TND" | "EUR";

export const CATEGORIES_FOURNISSEUR = [
  "Façonniers",
  "Matières / Fournitures",
  "Transport / Logistique",
  "Charges fixes",
  "Divers",
] as const;

export const toTND = (montant: number, devise: string, taux: number) =>
  devise === "EUR" ? montant * taux : montant;

export type Mouvement = { debit: number; credit: number };

export type SoldeCompte = { totalCredit: number; totalDebit: number; solde: number; soldeTND: number };

/** Crédit = ce que le fournisseur nous facture, débit = ce que nous réglons.
 * Le solde est donc ce qui lui reste dû. Arrondi au millième, comme les
 * montants en dinar. */
export function soldeCompte(transactions: Mouvement[], devise: string, taux: number): SoldeCompte {
  const millieme = (n: number) => Math.round(n * 1000) / 1000;
  const totalCredit = millieme(transactions.reduce((s, t) => s + (t.credit || 0), 0));
  const totalDebit = millieme(transactions.reduce((s, t) => s + (t.debit || 0), 0));
  const solde = millieme(totalCredit - totalDebit);
  return { totalCredit, totalDebit, solde, soldeTND: millieme(toTND(solde, devise, taux)) };
}

export type StatutSolde = "zero" | "du" | "avoir";

export const STATUT_SOLDE: Record<StatutSolde, { label: string; tone: Tone }> = {
  zero: { label: "Soldé", tone: "success" },
  du: { label: "Dû", tone: "danger" },
  avoir: { label: "Avoir", tone: "info" },
};

/** Sous un demi-dinar, le compte est considéré soldé — les arrondis de retenue
 * à la source laissent des résidus qui ne sont pas des dettes. */
export function statutSolde(soldeTND: number): StatutSolde {
  if (Math.abs(soldeTND) < 0.5) return "zero";
  return soldeTND > 0 ? "du" : "avoir";
}

/** Échéances à venir : les débits datés d'aujourd'hui ou plus tard. */
export function echeancesAVenir<T extends { date: string; debit: number }>(
  transactions: T[],
  aujourdhui: string,
): T[] {
  return transactions
    .filter((t) => t.debit > 0 && /^\d{4}-\d{2}-\d{2}$/.test(t.date) && t.date >= aujourdhui)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** Classe de proximité d'une échéance, pour la colorer. */
export function urgenceEcheance(dateEch: string, now = new Date()): { tone: Tone; jours: number } {
  const base = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const jours = Math.round((Date.parse(`${dateEch}T00:00:00`) - base) / 86_400_000);
  if (jours <= 7) return { tone: "danger", jours };
  if (jours <= 30) return { tone: "warning", jours };
  return { tone: "neutral", jours };
}

/** Clé « AAAA-MM » d'une date, pour grouper l'échéancier par mois. */
export const moisDe = (iso: string) => iso.slice(0, 7);

const MOIS_FR = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
export function libelleMois(cle: string): string {
  const [a, m] = cle.split("-");
  return `${MOIS_FR[Number(m) - 1] ?? m} ${a}`;
}
