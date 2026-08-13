import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
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
import { fichier } from "./fichier";

/* Contrôle qualité produit fini.
 *
 * Le verdict n'est pas stocké comme une opinion : il est calculé par
 * lib/domain/qc.ts depuis le plan d'échantillonnage AQL, les défauts relevés et
 * les mesures hors tolérance. Le champ `verdictForce` n'existe que pour le cas
 * où le contrôleur décide contre la proposition — et la proposition reste alors
 * visible à côté. */

export const qcInspection = pgTable(
  "qc_inspection",
  {
    id: serial().primaryKey(),
    /** Numéro métier affiché : QC-001. */
    numero: integer().notNull().unique(),
    date: date().notNull(),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    /* Copiés de la commande au moment du contrôle : le rapport doit rester
     * lisible même si la commande évolue ou disparaît. */
    of: text().notNull().default(""),
    client: text().notNull().default(""),
    modele: text().notNull().default(""),
    ref: text().notNull().default(""),
    couleur: text().notNull().default(""),
    faconnier: text().notNull().default(""),
    /** Taille du lot présenté — détermine l'échantillon AQL. */
    lot: integer().notNull().default(0),
    controleur: text().notNull().default(""),
    /** brouillon | cloture */
    statut: text().notNull().default("brouillon"),
    /** "" = suivre la proposition AQL ; sinon accepte | reserve | refuse */
    verdictForce: text().notNull().default(""),
    /** Verdict figé à la clôture, pour que le rapport ne change plus. */
    verdictCloture: text().notNull().default(""),
    dateCloture: date(),
    note: text().notNull().default(""),
    /** QRQC ouvert automatiquement quand le lot est refusé. */
    qrqcId: integer(),
    /** Chaînage des re-contrôles. */
    recontroleDeId: integer().references((): AnyPgColumn => qcInspection.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("qc_inspection_cmd_idx").on(t.commandeId), index("qc_inspection_statut_idx").on(t.statut)],
);

export const qcDefaut = pgTable(
  "qc_defaut",
  {
    id: serial().primaryKey(),
    inspectionId: integer()
      .notNull()
      .references(() => qcInspection.id, { onDelete: "cascade" }),
    /** Coutures, Aspect / Matière, Mesures, Accessoires, Repassage, Étiquetage, Emballage */
    famille: text().notNull(),
    description: text().notNull().default(""),
    /** critique | majeur | mineur */
    gravite: text().notNull().default("majeur"),
    nombre: integer().notNull().default(1),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("qc_defaut_insp_idx").on(t.inspectionId)],
);

export const qcMesure = pgTable(
  "qc_mesure",
  {
    id: serial().primaryKey(),
    inspectionId: integer()
      .notNull()
      .references(() => qcInspection.id, { onDelete: "cascade" }),
    point: text().notNull().default(""),
    taille: text().notNull().default(""),
    spec: doublePrecision(),
    tolerance: doublePrecision(),
    /** null tant que la mesure n'a pas été relevée. */
    mesure: doublePrecision(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("qc_mesure_insp_idx").on(t.inspectionId)],
);

/** Photos d'une inspection : générales, ou rattachées à un défaut précis. */
export const qcPhoto = pgTable(
  "qc_photo",
  {
    id: serial().primaryKey(),
    inspectionId: integer()
      .notNull()
      .references(() => qcInspection.id, { onDelete: "cascade" }),
    defautId: integer().references(() => qcDefaut.id, { onDelete: "cascade" }),
    hash: text()
      .notNull()
      .references(() => fichier.hash),
    legende: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("qc_photo_insp_idx").on(t.inspectionId)],
);

/* ─────────── barèmes de mesures clients ───────────
 * Ce sont les dossiers techniques réels des donneurs d'ordre : une matrice
 * point de mesure × taille, avec une tolérance par point. */

export const qcBareme = pgTable("qc_bareme", {
  id: serial().primaryKey(),
  nom: text().notNull(),
  client: text().notNull().default(""),
  /** Références du modèle qui déclenchent l'appariement automatique. */
  refs: jsonb().$type<string[]>().notNull().default([]),
  /** Tailles de la grille, dans l'ordre d'affichage. */
  tailles: jsonb().$type<string[]>().notNull().default([]),
  createdAt: timestamp().notNull().defaultNow(),
});

export const qcBaremePoint = pgTable(
  "qc_bareme_point",
  {
    id: serial().primaryKey(),
    baremeId: integer()
      .notNull()
      .references(() => qcBareme.id, { onDelete: "cascade" }),
    ordre: integer().notNull().default(0),
    label: text().notNull(),
    tolerance: doublePrecision().notNull().default(0),
    /** taille → valeur en cm */
    valeurs: jsonb().$type<Record<string, number>>().notNull().default({}),
  },
  (t) => [unique("qc_bareme_point_ordre").on(t.baremeId, t.ordre)],
);

/* ─────────── relations ─────────── */

export const qcInspectionRelations = relations(qcInspection, ({ one, many }) => ({
  commande: one(commande, { fields: [qcInspection.commandeId], references: [commande.id] }),
  defauts: many(qcDefaut),
  mesures: many(qcMesure),
  photos: many(qcPhoto),
}));
export const qcDefautRelations = relations(qcDefaut, ({ one, many }) => ({
  inspection: one(qcInspection, { fields: [qcDefaut.inspectionId], references: [qcInspection.id] }),
  photos: many(qcPhoto),
}));
export const qcMesureRelations = relations(qcMesure, ({ one }) => ({
  inspection: one(qcInspection, { fields: [qcMesure.inspectionId], references: [qcInspection.id] }),
}));
export const qcPhotoRelations = relations(qcPhoto, ({ one }) => ({
  inspection: one(qcInspection, { fields: [qcPhoto.inspectionId], references: [qcInspection.id] }),
  defaut: one(qcDefaut, { fields: [qcPhoto.defautId], references: [qcDefaut.id] }),
}));
export const qcBaremeRelations = relations(qcBareme, ({ many }) => ({
  points: many(qcBaremePoint),
}));
export const qcBaremePointRelations = relations(qcBaremePoint, ({ one }) => ({
  bareme: one(qcBareme, { fields: [qcBaremePoint.baremeId], references: [qcBareme.id] }),
}));
