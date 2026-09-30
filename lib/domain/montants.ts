/* Devises, TVA et conversion.
 *
 * Tous les prix saisis (commande, facture, BL) sont hors taxes. La TVA ne se
 * pose qu'au moment d'émettre une facture ou un BL : un taux par document,
 * 0 % par défaut. Le chiffre d'affaires, les marges et les statistiques
 * restent hors taxes — le TTC ne sert qu'à ce que le client doit payer.
 *
 * Les montants de devises différentes ne s'additionnent jamais tels quels :
 * on les somme par devise, ou on les convertit dans une devise de référence
 * au taux en vigueur à la date du document. */

export const DEVISES = {
  EUR: { symbole: "€", decimales: 2, unite: ["euro", "euros"], fraction: ["centime", "centimes"] },
  TND: { symbole: "DT", decimales: 3, unite: ["dinar", "dinars"], fraction: ["millime", "millimes"] },
} as const;

export type Devise = keyof typeof DEVISES;
export const LISTE_DEVISES = Object.keys(DEVISES) as Devise[];
/** Devise pivot des taux de change : un taux dit combien vaut 1 unité en TND. */
export const DEVISE_PIVOT: Devise = "TND";
export const DEVISE_DEFAUT: Devise = "EUR";

export const estDevise = (d: unknown): d is Devise => typeof d === "string" && d in DEVISES;
/** Une devise inconnue (donnée ancienne, saisie libre) retombe sur la devise par défaut. */
export const deviseOu = (d: unknown, defaut: Devise = DEVISE_DEFAUT): Devise => (estDevise(d) ? d : defaut);

/** Arrondi à la plus petite unité de la devise : centime, millime. */
export function arrondir(n: number, devise: Devise): number {
  const f = 10 ** DEVISES[devise].decimales;
  return Math.round((n + Number.EPSILON) * f) / f;
}

export function formatMontant(
  n: number | null | undefined,
  devise: Devise,
  opts: { symbole?: boolean; /** 0 pour un KPI arrondi à l'unité. */ decimales?: number } = {},
): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  const d = opts.decimales ?? DEVISES[devise].decimales;
  const s = n.toLocaleString("fr-FR", { minimumFractionDigits: d, maximumFractionDigits: d });
  return opts.symbole === false ? s : `${s} ${DEVISES[devise].symbole}`;
}

/* ─────────── TVA ─────────── */

/** Un taux saisi : borné à [0, 100], 0 par défaut. */
export function tauxTvaValide(t: unknown): number {
  const n = typeof t === "string" ? parseFloat(t.replace(",", ".")) : Number(t);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(100, n);
}

export type Totaux = { totalHt: number; montantTva: number; totalTtc: number };

/** Totaux d'un document à partir de ses montants hors taxes.
 *
 * La TVA se calcule une fois, sur le total HT arrondi — pas ligne par ligne :
 * c'est ce qu'imprime la facture et ce que le client vérifie. */
export function calculerTotaux(input: { montantsHt: number[]; tauxTva: number; devise: Devise }): Totaux {
  const { devise } = input;
  const taux = tauxTvaValide(input.tauxTva);
  const totalHt = arrondir(
    input.montantsHt.reduce((s, m) => s + (Number.isFinite(m) ? m : 0), 0),
    devise,
  );
  const montantTva = arrondir((totalHt * taux) / 100, devise);
  return { totalHt, montantTva, totalTtc: arrondir(totalHt + montantTva, devise) };
}

/* ─────────── taux de change ─────────── */

/** 1 unité de `devise` vaut `taux` TND à partir de `date` (ISO yyyy-mm-dd). */
export type TauxChange = { devise: Devise; date: string; taux: number };

/** Taux en vigueur à une date : le plus récent qui ne la dépasse pas. Une
 * date antérieure à tout taux connu prend le plus ancien — mieux vaut un taux
 * approché qu'un chiffre d'affaires qui disparaît. `null` si la devise n'a
 * aucun taux. */
export function tauxA(devise: Devise, date: string, taux: TauxChange[]): number | null {
  if (devise === DEVISE_PIVOT) return 1;
  let enVigueur: TauxChange | null = null;
  let plusAncien: TauxChange | null = null;
  for (const t of taux) {
    if (t.devise !== devise || !(t.taux > 0)) continue;
    if (!plusAncien || t.date < plusAncien.date) plusAncien = t;
    if (t.date <= date && (!enVigueur || t.date > enVigueur.date)) enVigueur = t;
  }
  return (enVigueur ?? plusAncien)?.taux ?? null;
}

/** Convertit un montant d'une devise à l'autre au taux du jour `date`, en
 * passant par la devise pivot. `null` quand un taux manque. Non arrondi : on
 * arrondit la somme, pas chaque terme. */
export function convertir(montant: number, de: Devise, vers: Devise, date: string, taux: TauxChange[]): number | null {
  if (de === vers) return montant;
  const tDe = tauxA(de, date, taux);
  const tVers = tauxA(vers, date, taux);
  if (tDe === null || tVers === null) return null;
  return (montant * tDe) / tVers;
}

/* ─────────── agrégation ─────────── */

export type Montants = Partial<Record<Devise, number>>;
/** "par-devise" (défaut) ou la devise de référence dans laquelle tout convertir. */
export type VueDevise = "par-devise" | Devise;

export const parseVueDevise = (v: unknown): VueDevise => (estDevise(v) ? v : "par-devise");

export type MontantDate = { devise: Devise; montant: number; date: string };

export type Totalisation = {
  montants: Montants;
  /** Nombre de montants qu'aucun taux ne permettait de convertir (exclus du total). */
  nonConvertis: number;
};

/** Somme des montants, séparés par devise ou convertis dans une seule. */
export function totaliser(items: MontantDate[], vue: VueDevise, taux: TauxChange[] = []): Totalisation {
  const brut: Montants = {};
  let nonConvertis = 0;
  for (const it of items) {
    if (!Number.isFinite(it.montant)) continue;
    const cible = vue === "par-devise" ? it.devise : vue;
    const v = vue === "par-devise" ? it.montant : convertir(it.montant, it.devise, vue, it.date, taux);
    if (v === null) {
      nonConvertis++;
      continue;
    }
    brut[cible] = (brut[cible] ?? 0) + v;
  }
  const montants: Montants = {};
  for (const d of LISTE_DEVISES) if (brut[d] !== undefined) montants[d] = arrondir(brut[d]!, d);
  return { montants, nonConvertis };
}

/** Additionne deux jeux de montants devise par devise. */
export function ajouterMontants(a: Montants, b: Montants): Montants {
  const out: Montants = { ...a };
  for (const d of LISTE_DEVISES) if (b[d] !== undefined) out[d] = (out[d] ?? 0) + b[d]!;
  return out;
}

/** Devises présentes, dans l'ordre de DEVISES. */
export const devisesDe = (m: Montants): Devise[] => LISTE_DEVISES.filter((d) => m[d] !== undefined);

/** "120 000,00 € · 45 000,000 DT" — ou "—" si vide. */
export const formatMontants = (m: Montants, opts: { decimales?: number } = {}): string => {
  const ds = devisesDe(m);
  return ds.length ? ds.map((d) => formatMontant(m[d]!, d, opts)).join(" · ") : "—";
};

/* ─────────── montant en lettres ─────────── */

const U = [
  "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize",
  "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
];
const D = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];

function dix(x: number): string {
  if (x < 20) return U[x];
  const d1 = Math.floor(x / 10);
  const u1 = x % 10;
  if (d1 === 7) return D[6] + (u1 === 1 ? " et onze" : u1 > 0 ? "-" + U[10 + u1] : "-dix");
  if (d1 === 9) return D[8] + "-" + U[10 + u1];
  return D[d1] + (u1 === 1 && d1 !== 8 ? " et un" : u1 > 0 ? "-" + U[u1] : d1 === 8 ? "s" : "");
}
function cent(x: number): string {
  if (x < 100) return dix(x);
  const c = Math.floor(x / 100);
  const r = x % 100;
  if (c === 1) return "cent" + (r > 0 ? " " + dix(r) : "");
  return U[c] + " cent" + (r === 0 ? "s" : " " + dix(r));
}
function entier(x: number): string {
  if (x === 0) return "zéro";
  if (x >= 1_000_000) {
    const m = Math.floor(x / 1_000_000);
    const r = x % 1_000_000;
    return (m === 1 ? "un million" : entier(m) + " millions") + (r > 0 ? " " + entier(r) : "");
  }
  if (x < 1000) return cent(x);
  const m = Math.floor(x / 1000);
  const r = x % 1000;
  // « cent » et « vingt » ne prennent pas de s devant « mille » : deux cent mille.
  return (m === 1 ? "mille" : cent(m).replace(/(cent|vingt)s$/, "$1") + " mille") + (r > 0 ? " " + cent(r) : "");
}

/** "mille deux cent trente-quatre euros et cinquante centimes",
 *  "cent dinars et cinq cents millimes". */
export function montantEnLettres(n: number, devise: Devise): string {
  const { unite, fraction, decimales } = DEVISES[devise];
  const abs = arrondir(Math.abs(n || 0), devise);
  const ent = Math.floor(abs);
  const dec = Math.round((abs - ent) * 10 ** decimales);
  let s = entier(ent) + " " + unite[ent > 1 ? 1 : 0];
  if (dec > 0) s += " et " + entier(dec) + " " + fraction[dec > 1 ? 1 : 0];
  return s;
}
