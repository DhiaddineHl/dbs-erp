import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

/* Operational module entities still awaiting their own refactor. Status-style
 * fields are stored as a `*Tone` (UI category) + `*Label` text pair so pages
 * render identically to before. Tables are `m_`-prefixed to avoid collision
 * with the refactored domain tables.
 *
 * Already migrated out of here: client, commande and faconnier — see
 * schema/referentiel.ts and schema/commande.ts. */

export const mTissu = pgTable("m_tissu", {
  id: serial().primaryKey(),
  date: text().notNull(),
  cmd: text().notNull(),
  design: text().notNull(),
  recue: integer().notNull().default(0),
  prevue: integer().notNull().default(0),
  ecartTone: text().notNull().default("neutral"),
  ecartLabel: text().notNull().default(""),
  controleTone: text().notNull().default("neutral"),
  controleLabel: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mFourniture = pgTable("m_fourniture", {
  id: serial().primaryKey(),
  date: text().notNull(),
  cmd: text().notNull(),
  type: text().notNull(),
  design: text().notNull(),
  qte: text().notNull().default(""),
  controleTone: text().notNull().default("neutral"),
  controleLabel: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mBe = pgTable("m_be", {
  id: serial().primaryKey(),
  of: text().notNull(),
  mc: text().notNull(),
  envoi: text().notNull().default(""),
  ok: text().notNull().default(""),
  ref: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mGamme = pgTable("m_gamme", {
  id: serial().primaryKey(),
  modele: text().notNull(),
  ops: integer().notNull().default(0),
  sam: text().notNull().default(""),
  cout: text().notNull().default(""),
  cap: text().notNull().default(""),
});

export const mCapaciteChaine = pgTable("m_capacite_chaine", {
  id: serial().primaryKey(),
  ch: text().notNull(),
  eff: integer().notNull().default(0),
  min: text().notNull().default(""),
  modele: text().notNull().default(""),
  cap: text().notNull().default(""),
  cout: text().notNull().default(""),
});

export const mCosting = pgTable("m_costing", {
  id: serial().primaryKey(),
  of: text().notNull(),
  modele: text().notNull(),
  qte: integer().notNull().default(0),
  sam: text().notNull().default(""),
  coutP: text().notNull().default(""),
  coutT: text().notNull().default(""),
  pf: text().notNull().default(""),
  ecartTone: text().notNull().default("neutral"),
  ecartLabel: text().notNull().default(""),
  delai: text().notNull().default(""),
});

export const mOrdo = pgTable("m_ordo", {
  id: serial().primaryKey(),
  rang: integer().notNull().default(0),
  prioTone: text().notNull().default("neutral"),
  prioLabel: text().notNull().default(""),
  of: text().notNull(),
  mc: text().notNull(),
  qte: integer().notNull().default(0),
  sam: text().notNull().default(""),
  charge: text().notNull().default(""),
  assigne: text().notNull().default(""),
  export: text().notNull().default(""),
  critTone: text().notNull().default("neutral"),
  critLabel: text().notNull().default(""),
});

export const mOf = pgTable("m_of", {
  id: serial().primaryKey(),
  of: text().notNull(),
  article: text().notNull(),
  chaine: text().notNull().default(""),
  qte: integer().notNull().default(0),
  prod: integer().notNull().default(0),
  debut: text().notNull().default(""),
  fin: text().notNull().default(""),
});

export const mAlerte = pgTable("m_alerte", {
  id: serial().primaryKey(),
  iconName: text().notNull().default("AlertCircle"),
  tone: text().notNull().default("neutral"),
  title: text().notNull(),
  detail: text().notNull().default(""),
  levelTone: text().notNull().default("neutral"),
  levelLabel: text().notNull().default(""),
});

export const mQrqc = pgTable("m_qrqc", {
  id: serial().primaryKey(),
  date: text().notNull(),
  pb: text().notNull(),
  cause: text().notNull().default(""),
  cmd: text().notNull().default(""),
  action: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mAction = pgTable("m_action", {
  id: serial().primaryKey(),
  action: text().notNull(),
  resp: text().notNull().default(""),
  echeance: text().notNull().default(""),
  prioTone: text().notNull().default("neutral"),
  prioLabel: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});
