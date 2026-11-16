/* PÉRIODES — logique pure, commune à tous les modules.
 *
 * Un seul choix de période pour toute l'application : exercice en cours,
 * exercice précédent, une année, un trimestre, un mois, tout, ou du… au….
 * Les écrans (Factures, Grand livre…) ne réinventent pas leur filtre : ils
 * lisent une `Periode` et appellent `dansPeriode`.
 *
 * L'exercice suit l'année civile (1er janvier → 31 décembre).
 *
 * Une période s'écrit en une clé courte, lisible et stockable :
 *   "exercice" · "precedent" · "tout"
 *   "a:2026"            une année
 *   "t:2026-4"          un trimestre
 *   "m:2026-11"         un mois
 *   "l:2026-03-01~2026-06-30"  du… au… */

export type Periode = {
  cle: string;
  /** Bornes incluses, AAAA-MM-JJ. "" = sans borne. */
  du: string;
  au: string;
  /** « Exercice 2027 », « Novembre 2026 », « du 01/03/2026 au 30/06/2026 ». */
  label: string;
  /** Pour les titres : « 2027 », « nov. 2026 »… */
  court: string;
};

export const MOIS_LONGS = [
  "Janvier", "Février", "Mars", "Avril", "Mai", "Juin",
  "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre",
];
const MOIS_COURTS = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const pad = (n: number) => String(n).padStart(2, "0");
const fr = (iso: string) => (ISO.test(iso) ? iso.split("-").reverse().join("/") : iso);
const dernierJour = (a: number, m: number) => new Date(Date.UTC(a, m, 0)).getUTCDate();

/** Année de « aujourd'hui » au format local (pas l'heure UTC du serveur). */
export const anneeDe = (iso: string) => Number(iso.slice(0, 4));
export const aujourdhuiISO = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function annee(a: number, cle: string, label = `Année ${a}`): Periode {
  return { cle, du: `${a}-01-01`, au: `${a}-12-31`, label, court: String(a) };
}

/** Lit une clé de période. Une clé illisible donne l'exercice en cours :
 * on ne montre jamais « rien » à cause d'un réglage abîmé. */
export function lirePeriode(cle: string | null | undefined, aujourdhui = aujourdhuiISO()): Periode {
  const a = anneeDe(aujourdhui);
  const c = (cle ?? "").trim();
  if (c === "precedent") return annee(a - 1, "precedent", `Exercice ${a - 1}`);
  if (c === "tout") return { cle: "tout", du: "", au: "", label: "Toutes les années", court: "toutes années" };
  let m = /^a:(\d{4})$/.exec(c);
  if (m) return annee(Number(m[1]), c, `Exercice ${m[1]}`);
  m = /^t:(\d{4})-([1-4])$/.exec(c);
  if (m) {
    const y = Number(m[1]);
    const t = Number(m[2]);
    const m1 = (t - 1) * 3 + 1;
    return {
      cle: c,
      du: `${y}-${pad(m1)}-01`,
      au: `${y}-${pad(m1 + 2)}-${dernierJour(y, m1 + 2)}`,
      label: `${t}${t === 1 ? "er" : "e"} trimestre ${y}`,
      court: `T${t} ${y}`,
    };
  }
  m = /^m:(\d{4})-(\d{2})$/.exec(c);
  if (m && Number(m[2]) >= 1 && Number(m[2]) <= 12) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    return {
      cle: c,
      du: `${y}-${pad(mo)}-01`,
      au: `${y}-${pad(mo)}-${dernierJour(y, mo)}`,
      label: `${MOIS_LONGS[mo - 1]} ${y}`,
      court: `${MOIS_COURTS[mo - 1]} ${y}`,
    };
  }
  m = /^l:(\d{4}-\d{2}-\d{2})?~(\d{4}-\d{2}-\d{2})?$/.exec(c);
  if (m && (m[1] || m[2])) {
    let du = m[1] ?? "";
    let au = m[2] ?? "";
    if (du && au && du > au) [du, au] = [au, du];
    const label = du && au ? `du ${fr(du)} au ${fr(au)}` : du ? `depuis le ${fr(du)}` : `jusqu'au ${fr(au)}`;
    return { cle: `l:${du}~${au}`, du, au, label, court: label };
  }
  return annee(a, "exercice", `Exercice ${a}`);
}

export const clePeriodeLibre = (du: string, au: string) => `l:${ISO.test(du) ? du : ""}~${ISO.test(au) ? au : ""}`;

/** La date (AAAA-MM-JJ…) tombe-t-elle dans la période ? Une date vide ou
 * illisible n'est dans aucune période bornée. */
export function dansPeriode(date: string | null | undefined, p: Pick<Periode, "du" | "au">): boolean {
  if (!p.du && !p.au) return true;
  const d = (date ?? "").slice(0, 10);
  if (!ISO.test(d)) return false;
  return (!p.du || d >= p.du) && (!p.au || d <= p.au);
}

/** Même période, un an plus tôt : sert la comparaison « l'an passé ».
 * null pour « toutes les années » (rien à comparer). Le 29 février devient le 28. */
export function memePeriodeAnPasse(p: Periode): Periode | null {
  if (!p.du && !p.au) return null;
  // Mois, trimestre, exercice : même découpage, un an plus tôt (libellé lisible).
  const t = /^t:(\d{4})-([1-4])$/.exec(p.cle);
  if (t) return lirePeriode(`t:${Number(t[1]) - 1}-${t[2]}`);
  const m = /^m:(\d{4})-(\d{2})$/.exec(p.cle);
  if (m) return lirePeriode(`m:${Number(m[1]) - 1}-${m[2]}`);
  if (p.cle === "exercice" || p.cle === "precedent" || p.cle.startsWith("a:")) return lirePeriode(`a:${anneeDe(p.du) - 1}`);
  const recule = (iso: string) => {
    if (!iso) return "";
    const y = anneeDe(iso) - 1;
    const mo = Number(iso.slice(5, 7));
    const j = Math.min(Number(iso.slice(8, 10)), dernierJour(y, mo));
    return `${y}-${pad(mo)}-${pad(j)}`;
  };
  const du = recule(p.du);
  const au = recule(p.au);
  const label = p.cle === "exercice" || p.cle === "precedent" || p.cle.startsWith("a:")
    ? `Exercice ${anneeDe(du || au)}`
    : du && au ? `du ${fr(du)} au ${fr(au)}` : du ? `depuis le ${fr(du)}` : `jusqu'au ${fr(au)}`;
  return { cle: clePeriodeLibre(du, au), du, au, label, court: label };
}

/** Variation en %, null quand la base est nulle (pas de « +∞ % »). */
export function variation(actuel: number, precedent: number): number | null {
  if (!Number.isFinite(precedent) || Math.abs(precedent) < 0.005) return null;
  return Math.round(((actuel - precedent) / Math.abs(precedent)) * 1000) / 10;
}

/** Les années présentes dans des dates, plus l'année en cours, de la plus
 * récente à la plus ancienne — pour proposer les choix qui ont un sens. */
export function anneesDisponibles(dates: (string | null | undefined)[], aujourdhui = aujourdhuiISO()): number[] {
  const s = new Set<number>([anneeDe(aujourdhui)]);
  for (const d of dates) {
    const y = Number((d ?? "").slice(0, 4));
    if (y > 1990 && y < 2200) s.add(y);
  }
  return [...s].sort((a, b) => b - a);
}

/** Toutes les clés « mois » d'une période bornée (pour les graphiques mois par
 * mois). Limité à 60 mois : une période sans début s'appuie sur les données. */
export function moisDeLaPeriode(p: Pick<Periode, "du" | "au">, dates: string[] = []): string[] {
  const valides = dates.filter((d) => ISO.test((d ?? "").slice(0, 10))).map((d) => d.slice(0, 7)).sort();
  const debut = p.du ? p.du.slice(0, 7) : valides[0];
  const fin = p.au ? p.au.slice(0, 7) : valides.at(-1);
  if (!debut || !fin) return [];
  const out: string[] = [];
  let y = Number(debut.slice(0, 4));
  let m = Number(debut.slice(5, 7));
  while (`${y}-${pad(m)}` <= fin && out.length < 60) {
    out.push(`${y}-${pad(m)}`);
    m += 1;
    if (m > 12) {
      m = 1;
      y += 1;
    }
  }
  return out;
}

/* ═══════════ numérotation des factures ═══════════
 *
 * Chaque type (facture, avoir, proforma) a sa série, et chaque série repart à
 * 01 au 1er janvier : 01/2027, 02/2027… 99/2027, 100/2027. L'ANNÉE DU NUMÉRO
 * EST CELLE DE LA DATE DE FACTURE, pas celle du jour de la saisie : une
 * facture datée du 31/12/2026 et saisie le 2 janvier prend un numéro 2026. */

const NUM = /^(\d+)\/(\d{4})$/;

export function lireNumero(num: string): { rang: number; annee: number } | null {
  const m = NUM.exec((num ?? "").trim());
  return m ? { rang: Number(m[1]), annee: Number(m[2]) } : null;
}

export function formatNumero(rang: number, annee: number): string {
  return `${pad(rang)}/${annee}`;
}

/** Prochain numéro libre de la série de cette année : le plus grand rang
 * existant + 1 (un trou laissé par une facture supprimée n'est pas comblé
 * tout seul — on ne réattribue pas un numéro qui a pu circuler). */
export function prochainNumero(existants: string[], anneeFacture: number): string {
  let max = 0;
  for (const n of existants) {
    const l = lireNumero(n);
    if (l && l.annee === anneeFacture && l.rang > max) max = l.rang;
  }
  return formatNumero(max + 1, anneeFacture);
}

/** Contrôle d'un numéro tapé à la main, au regard de la date et de la série.
 * Ne bloque rien : la réponse est un avertissement à afficher. */
export function controleNumero(num: string, dateFacture: string, existants: string[]): string | null {
  const l = lireNumero(num);
  if (!l) return null; // format libre (PP-007/2026, ancien format…) : on ne juge pas
  const a = anneeDe(dateFacture);
  if (Number.isFinite(a) && l.annee !== a) {
    return `Le numéro ${num} porte l'année ${l.annee}, mais la facture est datée de ${a}.`;
  }
  const attendu = prochainNumero(existants, l.annee);
  const rangAttendu = lireNumero(attendu)!.rang;
  if (l.rang > rangAttendu) {
    return rangAttendu === 1
      ? `Aucun numéro encore en ${l.annee} : la série commence à ${formatNumero(1, l.annee)}, ${num} laisserait un trou.`
      : `Le dernier numéro de ${l.annee} est ${formatNumero(rangAttendu - 1, l.annee)} : ${num} laisserait un trou dans la série.`;
  }
  return null;
}
