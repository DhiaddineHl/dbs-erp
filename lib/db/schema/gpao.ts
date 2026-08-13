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
} from "drizzle-orm/pg-core";

/** Registre du personnel de l'atelier.
 *
 * Distinct de `ouvriere`, qui est une affectation à une chaîne : une personne
 * existe indépendamment des chaînes où elle passe, et c'est son matricule —
 * le même que dans PilotRH — qui l'identifie partout ailleurs. */
export const personnel = pgTable(
  "personnel",
  {
    id: serial().primaryKey(),
    matricule: text().notNull().unique(),
    nom: text().notNull(),
    /** Poste tenu habituellement. */
    fonction: text().notNull().default(""),
    atelier: text().notNull().default(""),
    /** active | inactive */
    statut: text().notNull().default("active"),
    dateEntree: date(),
    /** Clé opaque du QR personnel. Le matricule n'est pas utilisé comme
     * adresse : il est devinable, et le portail est accessible sans compte. */
    portailCle: text().notNull().unique(),
  },
  (t) => [index("personnel_statut_idx").on(t.statut)],
);

/** Catalogue des opérations de confection avec leur temps standard.
 *
 * Dans l'application d'origine, chaque saisie horaire retapait le libellé du
 * poste à la main : 509 variantes orthographiques pour un nombre d'opérations
 * bien plus faible. Le catalogue leur donne une orthographe et un SAM. */
export const operation = pgTable(
  "operation",
  {
    id: serial().primaryKey(),
    nom: text().notNull(),
    /** Temps standard en secondes. */
    sam: integer().notNull().default(0),
    archive: boolean().notNull().default(false),
  },
  (t) => [index("operation_archive_idx").on(t.archive)],
);

export const modele = pgTable("modele", {
  id: serial().primaryKey(),
  nom: text().notNull(),
  ref: text().notNull().default(""),
  client: text().notNull().default(""),
  sam: integer().notNull().default(1800),
  qte: integer().notNull().default(0),
});

export const chaine = pgTable("chaine", {
  id: serial().primaryKey(),
  nom: text().notNull(),
  chef: text().notNull().default(""),
});

export const ouvriere = pgTable("ouvriere", {
  id: serial().primaryKey(),
  chaineId: integer()
    .notNull()
    .references(() => chaine.id, { onDelete: "cascade" }),
  nom: text().notNull(),
  poste: text().notNull().default(""),
  sam: integer().notNull().default(100),
  /** Rattachement au registre. Nul tant que l'ouvrière n'est pas reliée à un
   * matricule ; le QR de rendement en dépend. */
  personnelId: integer().references(() => personnel.id, { onDelete: "set null" }),
});

/** One production day. The sparse per-hour matrices are stored as jsonb keyed
 * by hour column (sortie) or by ouvriere id then hour (ops/opsSam/...). */
type OpDetail = { poste: string; sam: number; qte: number };
export const journee = pgTable("journee", {
  id: serial().primaryKey(),
  date: text().notNull(),
  chaineId: integer()
    .notNull()
    .references(() => chaine.id),
  modeleId: integer()
    .notNull()
    .references(() => modele.id),
  effectif: integer().notNull().default(0),
  nbHeures: integer().notNull().default(8),
  cloture: boolean().notNull().default(false),
  objManuel: doublePrecision(),
  cols: jsonb().$type<string[]>().notNull().default([]),
  sortie: jsonb().$type<Record<string, number>>().notNull().default({}),
  ops: jsonb().$type<Record<number, Record<string, number | "RI" | "ABS">>>().notNull().default({}),
  ret: jsonb().$type<Record<number, number>>().notNull().default({}),
  opsSam: jsonb().$type<Record<number, Record<string, number>>>().notNull().default({}),
  opsPoste: jsonb().$type<Record<number, Record<string, string>>>().notNull().default({}),
  opsDetail: jsonb().$type<Record<number, Record<string, OpDetail[]>>>().notNull().default({}),
});

/* ─────────── Relations ─────────── */
export const chaineRelations = relations(chaine, ({ many }) => ({
  ouvrieres: many(ouvriere),
  journees: many(journee),
}));
export const ouvriereRelations = relations(ouvriere, ({ one }) => ({
  chaine: one(chaine, { fields: [ouvriere.chaineId], references: [chaine.id] }),
  personne: one(personnel, { fields: [ouvriere.personnelId], references: [personnel.id] }),
}));
export const personnelRelations = relations(personnel, ({ many }) => ({
  affectations: many(ouvriere),
}));
export const modeleRelations = relations(modele, ({ many }) => ({
  journees: many(journee),
}));
export const journeeRelations = relations(journee, ({ one }) => ({
  chaine: one(chaine, { fields: [journee.chaineId], references: [chaine.id] }),
  modele: one(modele, { fields: [journee.modeleId], references: [modele.id] }),
}));
