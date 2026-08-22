import { cleRapprochement, estSousTraitee } from "./commande";

/* Passerelle commande → facture.
 *
 * Tout ce qui décide de chiffres est ici, en fonctions pures : ce sont elles
 * qui fixent ce qui part en facture et ce qui remonte sur la commande. Une
 * erreur à cet endroit se voit sur une facture client, pas dans un journal. */

const centimes = (n: number) => Math.round(n * 100) / 100;

/* ─────────── B1 · facturer une commande ─────────── */

export type CommandeAFacturer = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  note: string;
  client: string;
  faconnier: string;
  chaineId: number | null;
  qte: number;
  /** Part de `qte` dont la commande répond elle-même — voir `resteAFacturer`.
   * Absente sur une commande non découpée, où elle vaudrait `qte`. */
  qtePropre?: number;
  factureQte: number;
  prixVente: number | null;
  prixFacon: number | null;
};

/** Ce qu'il reste à facturer sur une commande. Jamais négatif : une commande
 * sur-facturée (reprise de données, avoir) n'ouvre pas un reste fantôme.
 *
 * Sur une commande découpée, le reste se mesure sur la quantité PROPRE : les
 * parts confiées ailleurs se facturent sur leur propre ligne. Compter le total
 * de la mère ouvrirait le droit de facturer deux fois les mêmes pièces — une
 * fois sur la mère, une fois sur chaque part. Sans découpe, propre et total
 * sont la même chose. */
export const resteAFacturer = (c: { qte: number; factureQte: number; qtePropre?: number }) =>
  Math.max(0, (c.qtePropre ?? c.qte ?? 0) - (c.factureQte || 0));

export type LigneFacture = {
  modele: string;
  desig: string;
  ref: string;
  couleur: string;
  qte: number;
  pu: number;
  mt: number;
};

export type LigneCout = { lieu: "interne" | "faconnier"; faconnier: string; cout: number | null };

export type BrouillonFacturation = {
  ligne: LigneFacture;
  cout: LigneCout;
  /** Quantité réellement retenue, bornée par le reste à facturer. */
  qte: number;
  /** Ce que la commande portera après coup. */
  factureQteApres: number;
  /** Vrai quand la commande se trouve intégralement facturée. */
  complete: boolean;
};

export type SaisieFacturation = { qte: number; pu: number; ref?: string; desig?: string };

/** Construit la ligne de facture et sa ligne de coût à partir d'une commande.
 *
 * Deux règles qui ne se devinent pas :
 *   · la quantité est bornée par le reste à facturer — on ne facture pas deux
 *     fois la même pièce parce qu'un zéro a glissé dans la saisie ;
 *   · le coût de production dépend du LIEU. En interne, ce que la pièce coûte
 *     à l'entreprise est son prix de vente (il n'y a pas de facture de façon) ;
 *     en sous-traitance, c'est le prix façon. Confondre les deux fausse la
 *     marge de tout ce qui est produit chez DBS.
 */
export function preparerFacturation(c: CommandeAFacturer, saisie: SaisieFacturation): BrouillonFacturation | null {
  const reste = resteAFacturer(c);
  if (reste <= 0) return null;

  const qte = Math.min(reste, Math.max(1, Math.round(saisie.qte || 0)));
  const pu = Math.max(0, saisie.pu || 0);
  const sousTraitee = estSousTraitee(c);

  return {
    qte,
    ligne: {
      modele: c.modele,
      desig: (saisie.desig ?? c.note ?? "").trim() || c.modele,
      ref: (saisie.ref ?? c.refArticle ?? "").trim(),
      couleur: c.couleur ?? "",
      qte,
      pu,
      mt: centimes(qte * pu),
    },
    cout: sousTraitee
      ? { lieu: "faconnier", faconnier: c.faconnier, cout: c.prixFacon }
      : { lieu: "interne", faconnier: "", cout: pu },
    factureQteApres: (c.factureQte || 0) + qte,
    complete: (c.factureQte || 0) + qte >= (c.qte || 0),
  };
}

/* ─────────── B3 · cohérence du prix façon ─────────── */

export type LigneCoutFacture = {
  numero: string;
  type: string;
  lineIdx: number;
  /** Clé de rapprochement de la ligne (client|modèle|réf). */
  client: string;
  modele: string;
  ref: string;
  lieu: string;
  faconnier: string;
  cout: number | null;
};

export type CommandeFaconnable = {
  id: number;
  of: string;
  client: string;
  modele: string;
  refArticle: string;
  faconnier: string;
  chaineId: number | null;
  prixFacon: number | null;
  archived: boolean;
};

export type Divergence = {
  commandeId: number;
  of: string;
  modele: string;
  client: string;
  /** Facture et ligne d'où vient le prix de référence. */
  numero: string;
  type: string;
  lineIdx: number;
  prixCommande: number | null;
  prixFacture: number | null;
  ecart: number;
  /** L'écart porte-t-il sur une commande archivée ? */
  archivee: boolean;
};

/** Un centime d'écart vient d'un arrondi, pas d'une erreur de saisie. */
const SEUIL_ECART = 0.011;

/** Compare le prix façon porté par les commandes et celui saisi sur les lignes
 * de facture, archives comprises.
 *
 * La facture fait foi : c'est elle qui a été envoyée au client et qui sert de
 * base à la marge réalisée. Une commande qui s'en écarte est signalée pour
 * être alignée — jamais alignée d'office, parce qu'un écart peut aussi
 * révéler une erreur de saisie sur la facture.
 *
 * Ne regarde que la sous-traitance : en interne il n'y a pas de prix façon à
 * rapprocher, le coût est le prix de vente. */
export function comparerPrixFacon(
  lignesCout: LigneCoutFacture[],
  commandes: CommandeFaconnable[],
): Divergence[] {
  const parCle = new Map<string, LigneCoutFacture>();
  for (const l of lignesCout) {
    if (l.lieu !== "faconnier" || l.cout == null) continue;
    const cle = cleRapprochement(l.client, l.modele, l.ref);
    // À clé égale, la dernière facture connue l'emporte : c'est le prix en vigueur.
    const vu = parCle.get(cle);
    if (!vu || l.numero.localeCompare(vu.numero, "fr", { numeric: true }) > 0) parCle.set(cle, l);
  }

  const out: Divergence[] = [];
  for (const c of commandes) {
    if (!estSousTraitee(c)) continue;
    const l = parCle.get(cleRapprochement(c.client, c.modele, c.refArticle));
    if (!l || l.cout == null) continue;
    const ecart = centimes((c.prixFacon ?? 0) - l.cout);
    if (Math.abs(ecart) < SEUIL_ECART) continue;
    out.push({
      commandeId: c.id,
      of: c.of,
      modele: c.modele,
      client: c.client,
      numero: l.numero,
      type: l.type,
      lineIdx: l.lineIdx,
      prixCommande: c.prixFacon,
      prixFacture: l.cout,
      ecart,
      archivee: c.archived,
    });
  }
  return out.sort((a, b) => Math.abs(b.ecart) - Math.abs(a.ecart));
}

/* ─────────── B10 · purge des livrées / facturées ─────────── */

/** Une commande est-elle soldée, donc bonne à ranger ?
 *
 * « Facturée » veut dire INTÉGRALEMENT facturée. La simple présence d'un
 * numéro de facture ne suffit pas : une commande facturée à 100 pièces sur 800
 * doit rester active, les 700 autres sont encore à produire. C'est l'erreur
 * qui faisait disparaître des commandes en cours. */
export function estSoldee(c: {
  qte: number;
  factureQte: number;
  archived: boolean;
  statutKey?: string;
  /** Voir `resteAFacturer` : une mère n'est soldée que sur sa propre part. */
  qtePropre?: number;
}): boolean {
  if (c.archived) return false; // déjà rangée
  const du = c.qtePropre ?? c.qte ?? 0;
  if (du > 0 && (c.factureQte || 0) >= du) return true;
  return c.statutKey === "livree";
}
