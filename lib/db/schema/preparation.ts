import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";
import { commande } from "./commande";

/* Sous-système de préparation : les cinq écrans (direction technique, bureau
 * modélisme, nomenclature, magasin tissu, magasin fournitures) écrivent tous
 * sur la même commande, et la règle de lancement lit l'ensemble.
 *
 * Les états (feux, prêt à lancer, statut) ne sont stockés nulle part : ils sont
 * calculés par lib/domain/feux.ts à partir de ces tables. */

/** Cycle des têtes de série. Le verdict de la plus récente pilote le feu TDS ;
 * dès qu'une TDS est « ok », le modèle est OK production. */
export const commandeTds = pgTable(
  "commande_tds",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** Rang dans le cycle : TDS1, TDS2… */
    n: integer().notNull(),
    envoi: date(),
    retour: date(),
    /** attente | ok | refus */
    verdict: text().notNull().default("attente"),
    commentaire: text().notNull().default(""),
    par: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("commande_tds_rang").on(t.commandeId, t.n), index("commande_tds_cmd_idx").on(t.commandeId)],
);

/** Étapes du bureau modélisme : patronage et tracés, toutes deux bloquantes. */
export const commandeEtape = pgTable(
  "commande_etape",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** patronage | traces */
    etape: text().notNull(),
    fait: boolean().notNull().default(false),
    date: date(),
    par: text().notNull().default(""),
  },
  (t) => [unique("commande_etape_unique").on(t.commandeId, t.etape)],
);

/** Suivi référence par référence des fournitures. Dès qu'une ligne existe, elle
 * pilote le feu et le statut global se verrouille. */
export const commandeFournitureLigne = pgTable(
  "commande_fourniture_ligne",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    designation: text().notNull().default(""),
    qtePrevue: doublePrecision().notNull().default(0),
    qteRecue: doublePrecision().notNull().default(0),
    unite: text().notNull().default("pcs"),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("commande_four_cmd_idx").on(t.commandeId)],
);

/** Une commande lancée en a une seule — d'où la clé primaire sur la commande. */
export const commandeLancement = pgTable("commande_lancement", {
  commandeId: integer()
    .primaryKey()
    .references(() => commande.id, { onDelete: "cascade" }),
  date: date().notNull(),
  /** interne | soustraitance */
  mode: text().notNull(),
  par: text().notNull().default(""),
  /** Renseigné uniquement quand des feux bloquants étaient encore rouges. */
  derogationMotif: text(),
  derogationPar: text(),
  derogationDate: date(),
  /** Feux non satisfaits au moment de la dérogation, figés pour l'audit. */
  derogationManques: jsonb().$type<string[]>().notNull().default([]),
});

/** Journal de traçabilité de la fiche : une ligne par modification, avec la
 * valeur avant et après. C'est la mémoire de la commande. */
export const commandeJournal = pgTable(
  "commande_journal",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    ts: timestamp().notNull().defaultNow(),
    par: text().notNull().default(""),
    role: text().notNull().default(""),
    /** tds | tissu | four | modelisme | nomen | lancement */
    domaine: text().notNull(),
    action: text().notNull(),
    detail: text().notNull().default(""),
    avant: text().notNull().default(""),
    apres: text().notNull().default(""),
  },
  (t) => [index("commande_journal_cmd_idx").on(t.commandeId, t.ts)],
);

export const commandeTdsRelations = relations(commandeTds, ({ one }) => ({
  commande: one(commande, { fields: [commandeTds.commandeId], references: [commande.id] }),
}));
export const commandeEtapeRelations = relations(commandeEtape, ({ one }) => ({
  commande: one(commande, { fields: [commandeEtape.commandeId], references: [commande.id] }),
}));
export const commandeFournitureLigneRelations = relations(commandeFournitureLigne, ({ one }) => ({
  commande: one(commande, { fields: [commandeFournitureLigne.commandeId], references: [commande.id] }),
}));
export const commandeLancementRelations = relations(commandeLancement, ({ one }) => ({
  commande: one(commande, { fields: [commandeLancement.commandeId], references: [commande.id] }),
}));
export const commandeJournalRelations = relations(commandeJournal, ({ one }) => ({
  commande: one(commande, { fields: [commandeJournal.commandeId], references: [commande.id] }),
}));
