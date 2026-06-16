import { integer, pgTable, serial, text } from "drizzle-orm/pg-core";

/* Operational module entities. Status-style fields are stored as a `*Tone`
 * (UI category) + `*Label` text pair so pages render identically to before.
 * Tables are `m_`-prefixed to avoid collision with facturation/GPAO tables. */

export const mClient = pgTable("m_client", {
  id: serial().primaryKey(),
  code: text().notNull(),
  nom: text().notNull(),
  contact: text().notNull().default(""),
  email: text().notNull().default(""),
  ville: text().notNull().default(""),
  cmd: integer().notNull().default(0),
  ca: text().notNull().default(""),
});

export const mCommande = pgTable("m_commande", {
  id: serial().primaryKey(),
  of: text().notNull(),
  modele: text().notNull(),
  client: text().notNull(),
  assigne: text().notNull().default(""),
  qte: integer().notNull().default(0),
  pv: text().notNull().default(""),
  pf: text().notNull().default(""),
  marge: text().notNull().default(""),
  export: text().notNull().default(""),
  retardTone: text().notNull().default("neutral"),
  retardLabel: text().notNull().default(""),
  av: integer().notNull().default(0),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mFaconnier = pgTable("m_faconnier", {
  id: serial().primaryKey(),
  nom: text().notNull(),
  spec: text().notNull().default(""),
  contact: text().notNull().default(""),
  tel: text().notNull().default(""),
  prix: text().notNull().default(""),
  cmd: integer().notNull().default(0),
  charge: integer().notNull().default(0),
});

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

export const mCoupe = pgTable("m_coupe", {
  id: serial().primaryKey(),
  of: text().notNull(),
  mc: text().notNull(),
  qte: integer().notNull().default(0),
  coupee: integer().notNull().default(0),
  planif: text().notNull().default(""),
  fin: text().notNull().default(""),
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

export const mBr = pgTable("m_br", {
  id: serial().primaryKey(),
  br: text().notNull(),
  date: text().notNull(),
  facon: text().notNull(),
  cmd: text().notNull(),
  recu: integer().notNull().default(0),
  oknc: text().notNull().default(""),
  controleTone: text().notNull().default("neutral"),
  controleLabel: text().notNull().default(""),
});

export const mMagasin = pgTable("m_magasin", {
  id: serial().primaryKey(),
  of: text().notNull(),
  mc: text().notNull(),
  sourceTone: text().notNull().default("neutral"),
  sourceLabel: text().notNull().default(""),
  cmd: integer().notNull().default(0),
  recu: integer().notNull().default(0),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mBl = pgTable("m_bl", {
  id: serial().primaryKey(),
  bl: text().notNull(),
  date: text().notNull(),
  client: text().notNull(),
  lignes: integer().notNull().default(0),
  qte: integer().notNull().default(0),
  total: text().notNull().default(""),
  statutTone: text().notNull().default("neutral"),
  statutLabel: text().notNull().default(""),
});

export const mArchive = pgTable("m_archive", {
  id: serial().primaryKey(),
  of: text().notNull(),
  modele: text().notNull(),
  client: text().notNull(),
  qte: integer().notNull().default(0),
  ca: text().notNull().default(""),
  marge: text().notNull().default(""),
  livre: text().notNull().default(""),
  retardTone: text().notNull().default("neutral"),
  retardLabel: text().notNull().default(""),
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
