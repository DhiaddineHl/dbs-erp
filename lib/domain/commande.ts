import type { Tone } from "@/components/shared/status-badge";

/* Business rules for the commande, ported from PilotPro's `biz` object and the
 * matière helpers (chutePct / consoEff / coupablePieces / _matStatut).
 *
 * Everything here is pure: no DB, no React, no formatting. The service layer
 * feeds it rows and the UI renders what comes back — which is what lets a
 * commande become late without anyone rewriting it. */

/** Minimal shape the rules need. Both DB rows and in-flight form drafts match. */
export type CommandeFacts = {
  qte: number;
  produit: number;
  factureQte: number;
  prixVente: number | null;
  prixFacon: number | null;
  dateExport: string | null;
  dateExportReel: string | null;
  receptTissu: string | null;
  archived: boolean;
  statutManuel: string | null;
  consoTheo?: number | null;
  consoReel?: number | null;
  chutePct?: number | null;
  /* Réception et contrôle du tissu — alimentés par le magasin tissu. */
  tissuRecu?: number;
  tissuDateReelle?: string | null;
  /** "" | conforme | reserve | refuse */
  tissuControle?: string;
};

export const STATUTS = ["preparation", "production", "terminee", "livree", "retard", "archivee"] as const;
export type Statut = (typeof STATUTS)[number];

const STATUT_META: Record<Statut, { label: string; tone: Tone }> = {
  preparation: { label: "En préparation", tone: "neutral" },
  production: { label: "En production", tone: "brand" },
  terminee: { label: "Terminée", tone: "success" },
  livree: { label: "Livrée", tone: "success" },
  retard: { label: "⚠ Retard", tone: "danger" },
  archivee: { label: "Archivée", tone: "neutral" },
};

/** Statuts an operator may pin manually (archivée is set by archiving, not here). */
export const STATUTS_MANUELS = STATUTS.filter((s) => s !== "archivee");

export const statutLabel = (s: Statut) => STATUT_META[s].label;
export const statutTone = (s: Statut) => STATUT_META[s].tone;
export const statutBadge = (s: Statut): [Tone, string] => [STATUT_META[s].tone, STATUT_META[s].label];
export const isStatut = (v: unknown): v is Statut => STATUTS.includes(v as Statut);

/* ─────────── dates ─────────── */

/** Today at midnight, in the local timezone — matches PilotPro's todayISO(). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `iso`. Negative = in the past. Null if unparseable. */
export function joursJusqua(iso: string | null | undefined, from: Date = new Date()): number | null {
  if (!iso) return null;
  const target = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(target)) return null;
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((target - base) / 86_400_000);
}

/** Whole days between two ISO dates (b − a). Null if either is unparseable. */
export function joursEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const from = Date.parse(`${a}T00:00:00`);
  const to = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/* ─────────── money ─────────── */

/** Money is held as double precision, so products drift (8.6 × 2000 − 2.9 × 2000
 * lands on 11399.999999999998). Rounding at the boundary keeps that out of the
 * sums, the CSV exports and the KPI cards. */
const centimes = (n: number) => Math.round(n * 100) / 100;

export const margeUnitaire = (c: CommandeFacts) => centimes((c.prixVente ?? 0) - (c.prixFacon ?? 0));
export const margeTotale = (c: CommandeFacts) => centimes(margeUnitaire(c) * (c.qte || 0));
export const chiffreAffaires = (c: CommandeFacts) => centimes((c.prixVente ?? 0) * (c.qte || 0));

/** Marge as a share of the line's CA, 0 when there is no CA to divide by. */
export function margePct(c: CommandeFacts): number {
  const ca = chiffreAffaires(c);
  return ca > 0 ? (margeTotale(c) / ca) * 100 : 0;
}

/* ─────────── progress & statut ─────────── */

export function avancementPct(c: CommandeFacts): number {
  return c.qte > 0 ? Math.round((c.produit / c.qte) * 100) : 0;
}

/** Extra signals the derived statut can use but that don't live on the row. */
export type StatutContexte = {
  /** True when GPAO already has production declared for this modèle. */
  enProductionGpao?: boolean;
  now?: Date;
};

/** The statut a commande has on its own, ignoring any manual override. */
export function statutDerive(c: CommandeFacts, ctx: StatutContexte = {}): Statut {
  if (c.archived) return "archivee";
  const q = c.qte || 0;
  const prod = c.produit || 0;
  const fac = c.factureQte || 0;

  if (q > 0 && fac >= q) return "livree";
  const j = joursJusqua(c.dateExport, ctx.now);
  if (j !== null && j < 0 && prod < q) return "retard";
  if (q > 0 && prod >= q) return "terminee";
  if (prod > 0 || ctx.enProductionGpao || c.receptTissu) return "production";
  return "preparation";
}

/** The statut actually shown: a manual override wins unless the commande is
 * archived, which always takes precedence. */
export function statutEffectif(c: CommandeFacts, ctx: StatutContexte = {}): Statut {
  if (c.archived) return "archivee";
  if (c.statutManuel && isStatut(c.statutManuel)) return c.statutManuel;
  return statutDerive(c, ctx);
}

/** True once the commande is fully invoiced — the condition that archives it. */
export const estLivree = (c: CommandeFacts) => c.qte > 0 && (c.factureQte || 0) >= c.qte;

/* ─────────── lateness ─────────── */

export type Retard = { jours: number | null; tone: Tone; label: string };

/** Once exported for real, the delay is measured against the planned date;
 * before that it counts down to it. Mirrors PilotPro's retardTag(). */
export function retard(c: CommandeFacts, now: Date = new Date()): Retard {
  if (c.dateExportReel && c.dateExport) {
    const ecart = joursEntre(c.dateExport, c.dateExportReel);
    if (ecart === null) return { jours: null, tone: "neutral", label: "—" };
    if (ecart > 0) return { jours: ecart, tone: "danger", label: `+${ecart}j` };
    if (ecart === 0) return { jours: 0, tone: "success", label: "À l'heure" };
    return { jours: ecart, tone: "success", label: `${Math.abs(ecart)}j avance` };
  }
  const j = joursJusqua(c.dateExport, now);
  if (j === null) return { jours: null, tone: "neutral", label: "—" };
  if (j < 0) return { jours: j, tone: "danger", label: `Retard ${Math.abs(j)}j` };
  if (j <= 3) return { jours: j, tone: "warning", label: `J-${j}` };
  return { jours: j, tone: "neutral", label: `J-${j}` };
}

/* ─────────── fabric (nomenclature ↔ magasin tissu) ─────────── */

/** Waste rate for this commande, falling back to the app-wide default. */
export const chuteEffective = (c: CommandeFacts, defaut: number) =>
  c.chutePct != null ? c.chutePct : defaut;

/** Metres of fabric one piece really costs, waste included. */
export const consoEffective = (c: CommandeFacts, chuteDefaut: number) =>
  (c.consoTheo ?? 0) * (1 + chuteEffective(c, chuteDefaut) / 100);

/** Total metres the commande needs. 0 when the nomenclature is not filled in. */
export const besoinTissu = (c: CommandeFacts, chuteDefaut: number) =>
  consoEffective(c, chuteDefaut) * (c.qte || 0);

/** Received minus required. Null while either side is unknown. */
export function ecartTissu(c: CommandeFacts, chuteDefaut: number): number | null {
  const besoin = besoinTissu(c, chuteDefaut);
  const recu = c.tissuRecu ?? 0;
  if (besoin <= 0 || recu <= 0) return null;
  return recu - besoin;
}

/** How many pieces the fabric on hand can actually yield. */
export function piecesCoupables(c: CommandeFacts, chuteDefaut: number): number | null {
  const conso = consoEffective(c, chuteDefaut);
  if (!c.consoTheo || !c.tissuRecu || conso <= 0) return null;
  return Math.floor(c.tissuRecu / conso);
}

export type EtatMatiere = { kind: "na" | "manque" | "excedent" | "ok"; label: string; tone: Tone };

export function etatMatiere(c: CommandeFacts, chuteDefaut: number): EtatMatiere {
  if (!c.consoTheo) return { kind: "na", label: "À renseigner", tone: "neutral" };
  const besoin = besoinTissu(c, chuteDefaut);
  const recu = c.tissuRecu ?? 0;
  if (recu < besoin - 0.01) return { kind: "manque", label: "Manque tissu", tone: "danger" };
  if (recu > besoin + 0.01) return { kind: "excedent", label: "Excédent", tone: "info" };
  return { kind: "ok", label: "OK", tone: "success" };
}

/* ─────────── identifiers ─────────── */

const OF_PREFIX = "OF";

/** "OF-2026-287". Sequence is zero-padded to 3 digits, wider past 999. */
export function numeroOF(sequence: number, annee: number = new Date().getFullYear()): string {
  return `${OF_PREFIX}-${annee}-${String(sequence).padStart(3, "0")}`;
}

/** Highest sequence already used for `annee`, so the next one is +1. */
export function dernierSequenceOF(numeros: string[], annee: number = new Date().getFullYear()): number {
  const prefix = `${OF_PREFIX}-${annee}-`;
  let max = 0;
  for (const n of numeros) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max;
}

/* ─────────── matching (facturation ↔ commandes) ─────────── */

/** The key PilotPro's rapprochement uses to tie an invoice line to a commande:
 * client, modèle and article reference, all normalised. */
export function cleRapprochement(client: string, modele: string, ref: string): string {
  const n = (v: string | null | undefined) =>
    String(v ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  return `${n(client)}|${n(modele)}|${n(ref)}`;
}

/** Loose equality for names typed by different people (accents, case, spacing). */
export function normaliserNom(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Slug used as the client's stable business key ("GÉRARD DAREL" → gerard_darel). */
export function slugClient(nom: string): string {
  return (
    normaliserNom(nom)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "client"
  );
}
