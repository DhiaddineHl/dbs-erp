import { relations } from "drizzle-orm";
import {
  doublePrecision,
  integer,
  jsonb,
  pgTable,
  serial,
  text,
  unique,
} from "drizzle-orm/pg-core";

/* ─────────── Reference data ─────────── */
export const client = pgTable("client", {
  key: text().primaryKey(), // e.g. "gerard_darel"
  nom: text().notNull(),
  adresse: text().notNull().default(""),
  livraison: text().notNull().default(""),
  marque: text().notNull().default(""),
});

export const faconnier = pgTable("faconnier", {
  id: serial().primaryKey(),
  name: text().notNull().unique(),
});

/* ─────────── Invoices ─────────── */
export const facture = pgTable(
  "facture",
  {
    id: serial().primaryKey(),
    num: text().notNull(), // business number, e.g. "01/2026"
    type: text().notNull(), // facture | avoir | proforma
    date: text().notNull(), // ISO yyyy-mm-dd
    clientKey: text().references(() => client.key),
    marque: text().notNull().default(""),
    clientRaw: text().notNull().default(""),
    pieces: integer().notNull().default(0),
    total: doublePrecision().notNull().default(0),
    fournitures: doublePrecision().notNull().default(0),
    poids: text().notNull().default(""),
    mp: text().notNull().default(""),
    incoterm: text().notNull().default(""),
    paiement: text().notNull().default(""),
    matieres: jsonb().$type<string[]>().notNull().default([]),
  },
  (t) => [unique("facture_num_type").on(t.num, t.type)],
);

export const factureLigne = pgTable("facture_ligne", {
  id: serial().primaryKey(),
  factureId: integer()
    .notNull()
    .references(() => facture.id, { onDelete: "cascade" }),
  idx: integer().notNull(),
  modele: text().notNull().default(""),
  desig: text().notNull().default(""),
  ref: text().notNull().default(""),
  couleur: text().notNull().default(""),
  qte: integer().notNull().default(0),
  pu: doublePrecision().notNull().default(0),
  mt: doublePrecision().notNull().default(0),
});

export const factureExtra = pgTable("facture_extra", {
  id: serial().primaryKey(),
  factureId: integer()
    .notNull()
    .references(() => facture.id, { onDelete: "cascade" }),
  label: text().notNull(),
  mt: doublePrecision().notNull().default(0),
});

/** Per-line production-cost entry (the "marges" data: where it was made + cost). */
export const factureCostLine = pgTable(
  "facture_cost_line",
  {
    id: serial().primaryKey(),
    factureId: integer()
      .notNull()
      .references(() => facture.id, { onDelete: "cascade" }),
    lineIdx: integer().notNull(),
    lieu: text().notNull().default(""), // "" | interne | faconnier
    faconnier: text().notNull().default(""),
    cout: doublePrecision(), // null = not entered
  },
  (t) => [unique("cost_line_facture_idx").on(t.factureId, t.lineIdx)],
);

/* ─────────── Relations ─────────── */
export const clientRelations = relations(client, ({ many }) => ({
  factures: many(facture),
}));
export const factureRelations = relations(facture, ({ one, many }) => ({
  client: one(client, { fields: [facture.clientKey], references: [client.key] }),
  lignes: many(factureLigne),
  extras: many(factureExtra),
  costLines: many(factureCostLine),
}));
export const factureLigneRelations = relations(factureLigne, ({ one }) => ({
  facture: one(facture, { fields: [factureLigne.factureId], references: [facture.id] }),
}));
export const factureExtraRelations = relations(factureExtra, ({ one }) => ({
  facture: one(facture, { fields: [factureExtra.factureId], references: [facture.id] }),
}));
export const factureCostLineRelations = relations(factureCostLine, ({ one }) => ({
  facture: one(facture, { fields: [factureCostLine.factureId], references: [facture.id] }),
}));
