import { relations } from "drizzle-orm";
import {
  boolean,
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
} from "drizzle-orm/pg-core";

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
}));
export const modeleRelations = relations(modele, ({ many }) => ({
  journees: many(journee),
}));
export const journeeRelations = relations(journee, ({ one }) => ({
  chaine: one(chaine, { fields: [journee.chaineId], references: [chaine.id] }),
  modele: one(modele, { fields: [journee.modeleId], references: [modele.id] }),
}));
