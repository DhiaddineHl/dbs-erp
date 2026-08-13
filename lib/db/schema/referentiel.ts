import { doublePrecision, pgTable, serial, text } from "drizzle-orm/pg-core";

/* Shared reference data. These two tables used to exist twice — once for
 * facturation (`client` keyed by slug, `faconnier` by name) and once for the
 * operational modules (`m_client`, `m_faconnier`). They are now single tables
 * carrying the union of both field sets.
 *
 * Counters that used to be stored (client.cmd / ca, faconnier.cmd / charge) are
 * gone: they are derived from the commandes and computed by the service.
 *
 * Relations live in schema/facturation.ts, which can see both sides. */

export const client = pgTable("client", {
  id: serial().primaryKey(),
  /** Stable business key used by facturation, e.g. "gerard_darel". */
  key: text().notNull().unique(),
  /** Human code shown in the répertoire, e.g. "CLI-001". */
  code: text().notNull().default(""),
  nom: text().notNull(),
  marque: text().notNull().default(""),
  contact: text().notNull().default(""),
  email: text().notNull().default(""),
  tel: text().notNull().default(""),
  ville: text().notNull().default(""),
  pays: text().notNull().default(""),
  tva: text().notNull().default(""),
  adresse: text().notNull().default(""),
  livraison: text().notNull().default(""),
});

export const faconnier = pgTable("faconnier", {
  id: serial().primaryKey(),
  nom: text().notNull().unique(),
  specialite: text().notNull().default(""),
  contact: text().notNull().default(""),
  tel: text().notNull().default(""),
  /** Reference façon price (€/pc) — a default, overridden per commande. */
  prixFacon: doublePrecision(),
});
