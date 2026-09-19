/* ENCOURS / WIP — dérivés, pas re-stockés (cahier des charges §23).
 *
 * Les pièces d'une commande avancent par paliers : coupe → production/réception
 * → magasin produits finis → expédition (facturé). Chacun de ces paliers a déjà
 * son compteur sur la commande (`coupeQte`, `produit`, `magasinQte`,
 * `factureQte`) — alimentés par les mouvements aval. L'encours de chaque étape
 * n'est donc PAS une nouvelle donnée à stocker : c'est une soustraction entre
 * deux compteurs. Ce module fait cette soustraction, une fois, au même endroit.
 *
 * Pur : pas de DB, pas de React. */

/** Les compteurs d'avancement d'une commande. */
export type CompteursCommande = {
  qte: number;
  coupeQte: number;
  produit: number;
  magasinQte: number;
  factureQte: number;
};

export type Encours = {
  /** Coupé mais pas encore rentré de production : en cours à l'atelier / chez le façonnier. */
  enProduction: number;
  /** Produit/reçu mais pas encore entré au magasin PF. */
  attenteMagasin: number;
  /** En stock produits finis, pas encore expédié. */
  enMagasin: number;
  /** Pas encore coupé : reste à lancer. */
  aLancer: number;
  /** Total des pièces encore dans le circuit (non expédiées). */
  totalEnCours: number;
};

/** Une soustraction plancher à zéro : un compteur en retard sur un autre ne
 * doit jamais produire un encours négatif. */
const delta = (a: number, b: number) => Math.max(0, (a || 0) - (b || 0));

export function encoursCommande(c: CompteursCommande): Encours {
  const aLancer = delta(c.qte, c.coupeQte);
  const enProduction = delta(c.coupeQte, c.produit);
  const attenteMagasin = delta(c.produit, c.magasinQte);
  const enMagasin = delta(c.magasinQte, c.factureQte);
  return {
    aLancer,
    enProduction,
    attenteMagasin,
    enMagasin,
    totalEnCours: aLancer + enProduction + attenteMagasin + enMagasin,
  };
}

/** Somme des encours d'un ensemble de commandes (tableau de bord atelier). */
export function encoursTotal(commandes: readonly CompteursCommande[]): Encours {
  const acc: Encours = { enProduction: 0, attenteMagasin: 0, enMagasin: 0, aLancer: 0, totalEnCours: 0 };
  for (const c of commandes) {
    const e = encoursCommande(c);
    acc.enProduction += e.enProduction;
    acc.attenteMagasin += e.attenteMagasin;
    acc.enMagasin += e.enMagasin;
    acc.aLancer += e.aLancer;
    acc.totalEnCours += e.totalEnCours;
  }
  return acc;
}
