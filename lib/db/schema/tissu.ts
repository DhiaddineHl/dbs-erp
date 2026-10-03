import { relations } from "drizzle-orm";
import { type AnyPgColumn, boolean, date, doublePrecision, index, integer, jsonb, pgTable, primaryKey, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { commande } from "./commande";
import { coupeFiche } from "./aval";
import { faconnier } from "./referentiel";

/* ═══════════════════════════════════════════════════════════════════════
 * MAGASIN TISSU — modèle physique par lots
 *
 * Le point de départ n'est plus la commande mais la RÉCEPTION PHYSIQUE du
 * tissu. La chaîne de traçabilité est :
 *
 *   Réception → Lot identifiable → Affectation(s) commande → Consommation → Reste
 *
 * Quatre tables, une règle d'or : aucune quantité ne bouge sans un MOUVEMENT.
 * Les indicateurs d'un lot (reçu / affecté / consommé / disponible) ne sont
 * jamais stockés en dur — ils se dérivent des mouvements et des affectations,
 * pour qu'on puisse toujours répondre « d'où viennent ces mètres ».
 *
 * Ce modèle REMPLACE `commande_tissu_ligne` (magasin tissu par commande) :
 * les données de cette table sont migrées en réceptions + lots au déploiement.
 * ═══════════════════════════════════════════════════════════════════════ */

/** Bon de réception : l'événement d'entrée de tissu dans le magasin. Un bon
 * peut créer plusieurs lots (réception globale : Aubergine + Marine d'un coup). */
export const tissuReception = pgTable(
  "tissu_reception",
  {
    id: serial().primaryKey(),
    /** Numéro du bon (BR-2026-001…), unique, saisi ou attribué automatiquement. */
    numero: text().notNull().default(""),
    date: date().notNull(),
    fournisseur: text().notNull().default(""),
    /** Client / donneur d'ordre concerné, quand le tissu est fourni par lui. */
    client: text().notNull().default(""),
    /** N° du bon de livraison du client : la réception se contrôle contre lui. */
    blClient: text().notNull().default(""),
    /** Commande fournisseur / client d'origine (référence libre). */
    commandeFournisseur: text().notNull().default(""),
    observations: text().notNull().default(""),
    /** Pièces jointes (photos du bon, du rouleau…) : hash fichier séparés par des virgules. */
    piecesJointes: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("tissu_reception_date_idx").on(t.date)],
);

/** Un rouleau contrôlé : métrage annoncé (étiquette), mesuré, laize réelle, défauts. */
export type RouleauControle = {
  n: string;
  annonce: number | null;
  mesure: number | null;
  laize: number | null;
  defauts: string;
};

/** Lot de tissu = stock identifiable et traçable (AUBER-01, MAR-01…).
 *
 * C'est la pièce maîtresse : le lot existe indépendamment des commandes, et se
 * répartit sur une ou plusieurs d'entre elles. La quantité reçue est figée ici
 * (elle correspond à l'entrée physique) ; tout le reste se calcule à partir
 * des affectations et des mouvements. */
export const tissuLot = pgTable(
  "tissu_lot",
  {
    id: serial().primaryKey(),
    receptionId: integer()
      .notNull()
      .references(() => tissuReception.id, { onDelete: "cascade" }),
    /** Identifiant humain unique du lot : AUBER-01, MAR-01… */
    identifiant: text().notNull().unique(),
    reference: text().notNull().default(""),
    couleur: text().notNull().default(""),
    composition: text().notNull().default(""),
    saison: text().notNull().default(""),
    /** N° de lot du fournisseur (bain de teinture…), tel qu'imprimé sur ses étiquettes. */
    lotFournisseur: text().notNull().default(""),
    codeCouleur: text().notNull().default(""),
    /** Laize travaillable (cm) — lue par la modéliste au plan de coupe. */
    laize: doublePrecision(),
    /** Quantité reçue et son unité (m, kg…). Figée = l'entrée physique. */
    quantiteRecue: doublePrecision().notNull().default(0),
    unite: text().notNull().default("m"),
    nbRouleaux: integer(),
    /** "" | conforme | reserve | refuse — contrôle qualité du lot. */
    controle: text().notNull().default(""),
    /* ── contrôle à réception contre le bon de livraison du client ── */
    /** Métrage annoncé sur le BL client (null = non renseigné). */
    quantiteAnnoncee: doublePrecision(),
    /** Laize annoncée / commandée (cm). La laize réelle est `laize`. */
    laizeAnnoncee: doublePrecision(),
    /** Défauts constatés (texte libre, repris sur la réclamation). */
    defauts: text().notNull().default(""),
    /** Contrôle rouleau par rouleau (facultatif). */
    rouleaux: jsonb().$type<RouleauControle[]>().notNull().default([]),
    note: text().notNull().default(""),
    /** Rangé à la main (reste inutilisable, lot clos…) : sort des listes de
     * travail, reste consultable dans « Archivés ». Un lot ÉPUISÉ est rangé
     * d'office, sans ce drapeau (voir lib/domain/tissu → rangementLot). */
    archive: boolean().notNull().default(false),
    archiveLe: timestamp(),
    archivePar: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("tissu_lot_reception_idx").on(t.receptionId),
    index("tissu_lot_couleur_idx").on(t.couleur),
  ],
);

/** Affectation : réserve une quantité d'un lot à une commande/modèle.
 *
 * AFFECTÉ ≠ CONSOMMÉ. Une affectation est une réservation ; la consommation
 * réelle est un mouvement de sortie. Un lot peut avoir plusieurs affectations
 * (plusieurs commandes, ou des affectations successives des restes). */
export const tissuAffectation = pgTable(
  "tissu_affectation",
  {
    id: serial().primaryKey(),
    lotId: integer()
      .notNull()
      .references(() => tissuLot.id, { onDelete: "cascade" }),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    /** Copie lisible au cas où la commande serait purgée. */
    commandeLabel: text().notNull().default(""),
    quantite: doublePrecision().notNull().default(0),
    note: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("tissu_affectation_lot_idx").on(t.lotId),
    index("tissu_affectation_cmd_idx").on(t.commandeId),
  ],
);

/** Journal des mouvements d'un lot. La règle d'or : chaque variation de stock
 * passe par ici.
 *
 * sens :
 *   entree        → réception initiale (quantité positive) — trace de l'entrée
 *   sortie        → consommation réelle en production (diminue le disponible)
 *   retour        → retour de reste au stock (rare, ex. sur-sortie corrigée)
 *   rendu         → reliquat rendu au client (sort du stock, n'est PAS une
 *                   consommation) — motif = n° du bon de retour
 *   retour_fournisseur → renvoi au fournisseur (sort du stock) — bon RTF-
 *   consommation / chute → ce que la coupe a fait du tissu SORTI : ne
 *                   touchent pas au stock (déjà décompté par la sortie)
 *   mise_en_stock → validation de la réception d'un rouleau (trace)
 *   deplacement   → changement d'emplacement (quantité 0, avant → après)
 *   annulation    → contre-passation d'un mouvement (annule_id) : l'original
 *                   reste dans l'historique, il n'est plus compté
 *   ajustement    → correction d'inventaire physique (± selon quantite) */
export const tissuMouvement = pgTable(
  "tissu_mouvement",
  {
    id: serial().primaryKey(),
    lotId: integer()
      .notNull()
      .references(() => tissuLot.id, { onDelete: "cascade" }),
    /** entree | sortie | retour | rendu | ajustement */
    sens: text().notNull(),
    /** Toujours positive ; c'est `sens` qui donne le signe métier. */
    quantite: doublePrecision().notNull().default(0),
    /** Commande/modèle concerné par le mouvement (pour une sortie/consommation). */
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    commandeLabel: text().notNull().default(""),
    motif: text().notNull().default(""),
    /** Rouleau physique concerné (null = mouvement au niveau du lot). */
    rouleauId: integer().references((): AnyPgColumn => tissuRouleau.id, { onDelete: "cascade" }),
    /** Destination d'une sortie : coupe | atelier | soustraitant | autre. */
    destination: text().notNull().default(""),
    /** Sous-traitant chez qui part le tissu (sortie « soustraitant ») ; le nom
     * est recopié pour que l'historique survive à un renommage. */
    faconnierId: integer().references(() => faconnier.id, { onDelete: "set null" }),
    faconnierNom: text().notNull().default(""),
    /** Bon de sortie groupée (BST-AAAA-NNN) qui a emporté le rouleau. */
    bon: text().notNull().default(""),
    /** Fiche de coupe (CP-AAAA-NNN) à laquelle cette consommation se rattache :
     * « cette coupe a été faite avec ces rouleaux ». S'inscrit une fois ; ne
     * se détache que si la fiche est annulée. */
    coupeFicheId: integer().references((): AnyPgColumn => coupeFiche.id, { onDelete: "set null" }),
    /** Correction / déplacement : valeur d'avant et d'après (lisible). */
    valeurAvant: text().notNull().default(""),
    valeurApres: text().notNull().default(""),
    /** Annulation : le mouvement annulé (l'original reste, jamais effacé). */
    annuleId: integer().references((): AnyPgColumn => tissuMouvement.id, { onDelete: "set null" }),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("tissu_mouvement_lot_idx").on(t.lotId),
    index("tissu_mouvement_rouleau_idx").on(t.rouleauId),
    index("tissu_mouvement_bon_idx").on(t.bon),
    index("tissu_mouvement_coupe_fiche_idx").on(t.coupeFicheId),
  ],
);

/* ═══════════ ROULEAUX PHYSIQUES ═══════════
 *
 * Un rouleau = un objet physique, un code permanent (R-AAAA-NNNNNN) et une
 * étiquette QR. Il appartient à un lot (même réception, même référence /
 * couleur / lot fournisseur) : le lot reste l'unité d'affectation aux
 * commandes, le rouleau l'unité de mouvement physique.
 *
 * Son métrage initial est FIGÉ (un déclencheur SQL l'interdit en écriture) :
 * tout ce qui arrive ensuite est un mouvement de `tissu_mouvement`. */

export const tissuEmplacement = pgTable("tissu_emplacement", {
  id: serial().primaryKey(),
  /** Code unique : A03-12 */
  code: text().notNull().unique(),
  zone: text().notNull().default(""),
  rayon: text().notNull().default(""),
  libelle: text().notNull().default(""),
  actif: boolean().notNull().default(true),
  createdAt: timestamp().notNull().defaultNow(),
});

export const tissuRouleau = pgTable(
  "tissu_rouleau",
  {
    id: serial().primaryKey(),
    /** R-2026-000145 — unique, permanent, jamais modifiable. */
    code: text().notNull().unique(),
    lotId: integer()
      .notNull()
      .references(() => tissuLot.id, { onDelete: "cascade" }),
    /** Métrage mesuré à la réception : figé. 0 tant que le rouleau est
     * « à mesurer » (étiquette imprimée avant la mesure) — il est alors écrit
     * UNE fois, au scan du magasinier, puis figé comme les autres. */
    metrageInitial: doublePrecision().notNull(),
    /** Étiquette imprimée avant la mesure : métrage à saisir au scan. */
    aMesurer: boolean().notNull().default(false),
    /** Métrage étiqueté par le fournisseur (contrôle), facultatif. */
    metrageAnnonce: doublePrecision(),
    laize: doublePrecision(),
    poids: doublePrecision(),
    /** a_mesurer | en_attente | en_stock | sorti | epuise | rendu | retourne | annule — tenu à jour par le service. */
    statut: text().notNull().default("en_attente"),
    emplacementId: integer().references(() => tissuEmplacement.id, { onDelete: "set null" }),
    observations: text().notNull().default(""),
    valideLe: timestamp(),
    validePar: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("tissu_rouleau_lot_idx").on(t.lotId), index("tissu_rouleau_statut_idx").on(t.statut)],
);

/** Bon RÉCAPITULATIF (BSR-AAAA-NNN) : un seul document pour des rouleaux
 * déjà partis chez un même destinataire, qu'ils aient ou non chacun leur bon
 * BST. Il ne touche à rien : il désigne les mouvements de sortie qu'il
 * regroupe, les bons d'origine restent intacts. */
export const tissuRecap = pgTable("tissu_recap", {
  id: serial().primaryKey(),
  numero: text().notNull().unique(),
  destination: text().notNull().default(""),
  faconnierNom: text().notNull().default(""),
  note: text().notNull().default(""),
  createdBy: text().notNull().default(""),
  createdAt: timestamp().notNull().defaultNow(),
});

export const tissuRecapLigne = pgTable(
  "tissu_recap_ligne",
  {
    recapId: integer()
      .notNull()
      .references(() => tissuRecap.id, { onDelete: "cascade" }),
    mouvementId: integer()
      .notNull()
      .references(() => tissuMouvement.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.recapId, t.mouvementId] }), index("tissu_recap_ligne_mvt_idx").on(t.mouvementId)],
);

/** Inventaire par scan : une session, puis un scan par rouleau trouvé. */
export const tissuInventaire = pgTable("tissu_inventaire", {
  id: serial().primaryKey(),
  numero: text().notNull().unique(),
  /** ouvert | clos */
  statut: text().notNull().default("ouvert"),
  /** Zone inventoriée ("" = tout le magasin). */
  zone: text().notNull().default(""),
  note: text().notNull().default(""),
  ouvertPar: text().notNull().default(""),
  closPar: text().notNull().default(""),
  closLe: timestamp(),
  /** Résultat FIGÉ à la clôture (trouvés, manquants, écarts…) : le stock
   * bouge ensuite, l'inventaire clos doit rester ce qu'il a constaté. */
  resultat: jsonb(),
  createdAt: timestamp().notNull().defaultNow(),
});

export const tissuInventaireScan = pgTable(
  "tissu_inventaire_scan",
  {
    id: serial().primaryKey(),
    inventaireId: integer()
      .notNull()
      .references(() => tissuInventaire.id, { onDelete: "cascade" }),
    /** Code lu, tel quel (un code inconnu est gardé : « trouvé non enregistré »). */
    code: text().notNull(),
    rouleauId: integer().references(() => tissuRouleau.id, { onDelete: "set null" }),
    /** Métrage mesuré sur place (facultatif). */
    metrageConstate: doublePrecision(),
    emplacementCode: text().notNull().default(""),
    par: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("tissu_inventaire_scan_unique").on(t.inventaireId, t.code)],
);

export const tissuReceptionRelations = relations(tissuReception, ({ many }) => ({
  lots: many(tissuLot),
}));
export const tissuLotRelations = relations(tissuLot, ({ one, many }) => ({
  reception: one(tissuReception, { fields: [tissuLot.receptionId], references: [tissuReception.id] }),
  affectations: many(tissuAffectation),
  mouvements: many(tissuMouvement),
  rouleaux: many(tissuRouleau),
}));
export const tissuRouleauRelations = relations(tissuRouleau, ({ one }) => ({
  lot: one(tissuLot, { fields: [tissuRouleau.lotId], references: [tissuLot.id] }),
  emplacement: one(tissuEmplacement, { fields: [tissuRouleau.emplacementId], references: [tissuEmplacement.id] }),
}));
export const tissuAffectationRelations = relations(tissuAffectation, ({ one }) => ({
  lot: one(tissuLot, { fields: [tissuAffectation.lotId], references: [tissuLot.id] }),
  commande: one(commande, { fields: [tissuAffectation.commandeId], references: [commande.id] }),
}));
export const tissuMouvementRelations = relations(tissuMouvement, ({ one }) => ({
  lot: one(tissuLot, { fields: [tissuMouvement.lotId], references: [tissuLot.id] }),
  commande: one(commande, { fields: [tissuMouvement.commandeId], references: [commande.id] }),
}));
