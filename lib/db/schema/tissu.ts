import { relations } from "drizzle-orm";
import { date, doublePrecision, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { commande } from "./commande";

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
    observations: text().notNull().default(""),
    /** Pièces jointes (photos du bon, du rouleau…) : hash fichier séparés par des virgules. */
    piecesJointes: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("tissu_reception_date_idx").on(t.date)],
);

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
    /** Laize travaillable (cm) — lue par la modéliste au plan de coupe. */
    laize: doublePrecision(),
    /** Quantité reçue et son unité (m, kg…). Figée = l'entrée physique. */
    quantiteRecue: doublePrecision().notNull().default(0),
    unite: text().notNull().default("m"),
    nbRouleaux: integer(),
    /** "" | conforme | reserve | refuse — contrôle qualité du lot. */
    controle: text().notNull().default(""),
    note: text().notNull().default(""),
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
 *   ajustement    → correction d'inventaire physique (± selon quantite) */
export const tissuMouvement = pgTable(
  "tissu_mouvement",
  {
    id: serial().primaryKey(),
    lotId: integer()
      .notNull()
      .references(() => tissuLot.id, { onDelete: "cascade" }),
    /** entree | sortie | retour | ajustement */
    sens: text().notNull(),
    /** Toujours positive ; c'est `sens` qui donne le signe métier. */
    quantite: doublePrecision().notNull().default(0),
    /** Commande/modèle concerné par le mouvement (pour une sortie/consommation). */
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    commandeLabel: text().notNull().default(""),
    motif: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("tissu_mouvement_lot_idx").on(t.lotId)],
);

export const tissuReceptionRelations = relations(tissuReception, ({ many }) => ({
  lots: many(tissuLot),
}));
export const tissuLotRelations = relations(tissuLot, ({ one, many }) => ({
  reception: one(tissuReception, { fields: [tissuLot.receptionId], references: [tissuReception.id] }),
  affectations: many(tissuAffectation),
  mouvements: many(tissuMouvement),
}));
export const tissuAffectationRelations = relations(tissuAffectation, ({ one }) => ({
  lot: one(tissuLot, { fields: [tissuAffectation.lotId], references: [tissuLot.id] }),
  commande: one(commande, { fields: [tissuAffectation.commandeId], references: [commande.id] }),
}));
export const tissuMouvementRelations = relations(tissuMouvement, ({ one }) => ({
  lot: one(tissuLot, { fields: [tissuMouvement.lotId], references: [tissuLot.id] }),
  commande: one(commande, { fields: [tissuMouvement.commandeId], references: [commande.id] }),
}));
