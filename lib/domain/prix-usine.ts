/* Prix de vente d'une pièce GPAO, ramené dans la devise de l'usine.
 *
 * Une commande porte ses prix dans SA devise (EUR ou TND) ; le prix saisi à la
 * main sur un modèle porte la sienne. La GPAO, elle, compte tout — charges,
 * coût horaire, CA, marges — dans la devise de l'usine. Chaque prix est donc
 * converti au taux en vigueur le JOUR DE PRODUCTION, comme la facturation
 * convertit une facture au taux de sa date. Calcul pur, sans base. */

import { type Devise, type TauxChange, convertir } from "./montants";

/** Un prix unitaire et la devise dans laquelle il a été saisi. */
export type PrixDevise = { montant: number; devise: Devise };

export type PrixUsine = {
  /** Prix converti dans la devise de l'usine ; null si inconnu ou inconvertible. */
  prix: number | null;
  /** Un prix existe mais aucun taux ne permet de le convertir. */
  sansTaux: boolean;
};

/** Le prix retenu pour un modèle : celui de la commande liée, sinon le prix
 * saisi à la main. Un prix nul ou négatif compte comme absent. */
export function prixRetenu(commande: PrixDevise | null, manuel: PrixDevise | null): PrixDevise | null {
  const valide = (p: PrixDevise | null) => (p && Number.isFinite(p.montant) && p.montant > 0 ? p : null);
  return valide(commande) ?? valide(manuel);
}

/** Convertit un prix dans la devise de l'usine au taux du jour `date`. */
export function prixUsine(source: PrixDevise | null, deviseUsine: Devise, date: string, taux: TauxChange[]): PrixUsine {
  if (!source || !(source.montant > 0)) return { prix: null, sansTaux: false };
  const prix = convertir(source.montant, source.devise, deviseUsine, date, taux);
  return prix === null ? { prix: null, sansTaux: true } : { prix, sansTaux: false };
}
