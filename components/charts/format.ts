/** Formats partagés par les graphiques — mêmes règles partout, une seule source. */

export const euros = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

/**
 * Graduation d'axe monétaire, compacte : « 30k€ », « 1,2M€ ». Le passage au
 * million évite la graduation à cinq chiffres qui déborde de la gouttière.
 */
export const eurosAxe = (n: number) => {
  const a = Math.abs(n);
  if (a >= 1_000_000) return `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}M€`;
  if (a >= 1000) return `${Math.round(n / 1000)}k€`;
  return `${Math.round(n)}€`;
};

export const pieces = (n: number) => n.toLocaleString("fr-FR");
