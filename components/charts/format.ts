/** Formats partagés par les graphiques — mêmes règles partout, une seule source. */

import { DEVISES, type Devise } from "@/lib/domain/montants";

/** Montant arrondi à l'unité, avec le symbole de sa devise. */
export const montant = (n: number, devise: Devise = "EUR") =>
  `${Math.round(n).toLocaleString("fr-FR")} ${DEVISES[devise].symbole}`;
export const euros = (n: number) => montant(n, "EUR");

/**
 * Graduation d'axe monétaire, compacte : « 30k€ », « 1,2M€ ». Le passage au
 * million évite la graduation à cinq chiffres qui déborde de la gouttière.
 */
export const montantAxe = (n: number, devise: Devise = "EUR") => {
  const s = DEVISES[devise].symbole;
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}M${s}`;
  if (a >= 1000) return `${Math.round(n / 1000)}k${s}`;
  return `${Math.round(n)}${s}`;
};
export const eurosAxe = (n: number) => montantAxe(n, "EUR");

export const pieces = (n: number) => n.toLocaleString("fr-FR");
