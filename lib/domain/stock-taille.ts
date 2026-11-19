/* STOCK PAR TAILLE au magasin produits finis — règles pures.
 *
 * Une pièce entre au magasin rangée par taille :
 *  · façonnier : sa livraison est saisie par taille (portail), le 1er choix
 *    reçu entre au stock taille par taille ;
 *  · production interne : la GPAO ne connaît pas les tailles ; c'est à
 *    l'ENTRÉE au magasin (après contrôle et finition) qu'on les saisit.
 * Elle sort par taille sur le bon de livraison. Une entrée ou une sortie
 * saisie sans tailles (ancienne, ou taille unique) reste « non ventilée » :
 * rien n'est réparti au hasard. */

export type Ventilation = Record<string, number>;

const entier = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && Math.round(n) === n ? n : null;
};

export const totalVentilation = (v: Ventilation | null | undefined) => Object.values(v ?? {}).reduce((s, n) => s + n, 0);
export const estVentilee = (v: Ventilation | null | undefined) => totalVentilation(v) > 0;

/** Lit une ventilation saisie : entiers ≥ 0, tailles connues, et — si elle
 * est remplie — un total égal à la quantité. Vide = « non ventilée ». */
export function lireVentilation(brut: Record<string, unknown> | null | undefined, tailles: string[], qte: number): Ventilation {
  const out: Ventilation = {};
  for (const [t, q] of Object.entries(brut ?? {})) {
    if (q === "" || q == null) continue;
    const n = entier(q);
    if (n == null) throw new Error(`Taille ${t} : un nombre entier.`);
    if (!tailles.includes(t)) throw new Error(`Taille inconnue : ${t}.`);
    if (n > 0) out[t] = n;
  }
  const total = totalVentilation(out);
  if (total > 0 && total !== qte) throw new Error(`Les tailles font ${total} pièces pour ${qte} au total.`);
  return out;
}

export type StockTaille = {
  /** Pièces en stock, taille par taille. */
  parTaille: Ventilation;
  /** Pièces en stock dont la taille n'a pas été saisie. */
  nonVentile: number;
  total: number;
};

/** Stock par taille = entrées par taille − sorties par taille. Une sortie
 * ventilée prise sur un stock non ventilé (entrée ancienne) puise dans le
 * non ventilé : jamais de taille négative. */
export function stockParTaille(entrees: { qte: number; tailles: Ventilation }[], sorties: { qte: number; tailles: Ventilation }[], tailles: string[]): StockTaille {
  const parTaille: Ventilation = {};
  let nonVentile = 0;
  for (const e of entrees) {
    if (estVentilee(e.tailles)) for (const [t, n] of Object.entries(e.tailles)) parTaille[t] = (parTaille[t] ?? 0) + n;
    else nonVentile += e.qte;
  }
  for (const s of sorties) {
    if (estVentilee(s.tailles)) for (const [t, n] of Object.entries(s.tailles)) parTaille[t] = (parTaille[t] ?? 0) - n;
    else nonVentile -= s.qte;
  }
  for (const [t, n] of Object.entries(parTaille)) {
    if (n < 0) {
      nonVentile += n;
      parTaille[t] = 0;
    }
  }
  // Ordre de la grille de la commande, puis les autres.
  const ordre = [...tailles, ...Object.keys(parTaille).filter((t) => !tailles.includes(t))];
  const propre: Ventilation = {};
  for (const t of ordre) if ((parTaille[t] ?? 0) > 0) propre[t] = parTaille[t];
  // Un non ventilé négatif (sortie non ventilée sur stock ventilé) se retire des tailles : on ne sait pas lesquelles.
  const total = Math.max(0, totalVentilation(propre) + nonVentile);
  return { parTaille: nonVentile < 0 ? {} : propre, nonVentile: nonVentile < 0 ? total : nonVentile, total };
}

/** Ventilation d'une sortie, proposée sans rien deviner : seulement quand
 * on expédie TOUT le stock et que tout le stock est ventilé. */
export function ventilationAuto(stock: StockTaille, qte: number): Ventilation | null {
  if (stock.nonVentile > 0 || qte <= 0 || qte !== totalVentilation(stock.parTaille)) return null;
  return { ...stock.parTaille };
}

/** Une sortie ventilée ne prend pas plus, dans une taille, que le stock de
 * cette taille (plus le stock non ventilé, qui peut la contenir). */
export function refusSortie(stock: StockTaille, sortie: Ventilation): string | null {
  let pris = 0;
  for (const [t, n] of Object.entries(sortie)) {
    const dispo = stock.parTaille[t] ?? 0;
    if (n > dispo) pris += n - dispo;
  }
  if (pris > stock.nonVentile) return `Pas assez de stock dans ces tailles (${pris - stock.nonVentile} pièce(s) de trop).`;
  return null;
}

export const formatVentilation = (v: Ventilation) =>
  Object.entries(v)
    .filter(([, n]) => n > 0)
    .map(([t, n]) => `${t} ${n}`)
    .join(" · ");
