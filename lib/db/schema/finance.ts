import { relations } from "drizzle-orm";
import {
  date,
  doublePrecision,
  index,
  integer,
  pgTable,
  serial,
  text,
  timestamp,
} from "drizzle-orm/pg-core";
import { facture } from "./facturation";

/* Encaissements côté clients et grand livre côté fournisseurs.
 *
 * Rien n'est stocké de ce qui se déduit : le reste dû, l'échéance, le statut de
 * paiement et le solde d'un compte fournisseur sont calculés par
 * lib/domain/finance.ts. La sauvegarde du client montre pourquoi — ses soldes
 * enregistrés avaient dérivé (0,005 DT d'écart sur des totaux à cinq chiffres). */

/** Comptes bancaires d'encaissement, libellés libres. */
export const compteBancaire = pgTable("compte_bancaire", {
  id: serial().primaryKey(),
  libelle: text().notNull().unique(),
  ordre: integer().notNull().default(0),
});

/** Un règlement partiel ou total d'une facture. Plusieurs par facture. */
export const reglement = pgTable(
  "reglement",
  {
    id: serial().primaryKey(),
    factureId: integer()
      .notNull()
      .references(() => facture.id, { onDelete: "cascade" }),
    date: date().notNull(),
    montant: doublePrecision().notNull().default(0),
    /** Virement, Lettre de crédit (LC), Traite, Chèque, Espèces, Compensation, Autre */
    mode: text().notNull().default("Virement"),
    compteId: integer().references(() => compteBancaire.id, { onDelete: "set null" }),
    /** Référence bancaire du mouvement. */
    ref: text().notNull().default(""),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("reglement_facture_idx").on(t.factureId), index("reglement_date_idx").on(t.date)],
);

/* ─────────── grand livre fournisseurs ─────────── */

/** Un compte fournisseur. La devise porte sur tout le compte. */
export const fournisseurCompte = pgTable("fournisseur_compte", {
  id: serial().primaryKey(),
  nom: text().notNull().unique(),
  /** Façonniers, Matières / Fournitures, Transport / Logistique, Charges fixes, Divers */
  categorie: text().notNull().default("Divers"),
  /** TND | EUR */
  devise: text().notNull().default("TND"),
  createdAt: timestamp().notNull().defaultNow(),
});

/** Mouvement du compte : crédit = ce que le fournisseur nous facture,
 * débit = ce que nous lui réglons. Un débit à date future est une échéance. */
export const fournisseurTransaction = pgTable(
  "fournisseur_transaction",
  {
    id: serial().primaryKey(),
    compteId: integer()
      .notNull()
      .references(() => fournisseurCompte.id, { onDelete: "cascade" }),
    date: date().notNull(),
    libelle: text().notNull().default(""),
    debit: doublePrecision().notNull().default(0),
    credit: doublePrecision().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("fourn_tx_compte_idx").on(t.compteId), index("fourn_tx_date_idx").on(t.date)],
);

export const compteBancaireRelations = relations(compteBancaire, ({ many }) => ({
  reglements: many(reglement),
}));
export const reglementRelations = relations(reglement, ({ one }) => ({
  facture: one(facture, { fields: [reglement.factureId], references: [facture.id] }),
  compte: one(compteBancaire, { fields: [reglement.compteId], references: [compteBancaire.id] }),
}));
export const fournisseurCompteRelations = relations(fournisseurCompte, ({ many }) => ({
  transactions: many(fournisseurTransaction),
}));
export const fournisseurTransactionRelations = relations(fournisseurTransaction, ({ one }) => ({
  compte: one(fournisseurCompte, { fields: [fournisseurTransaction.compteId], references: [fournisseurCompte.id] }),
}));
