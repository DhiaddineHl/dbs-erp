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
    /** D'où vient le libellé : "" (inconnu, reprise), "import" (fichier),
     * "saisie" (capturé automatiquement en chaîne) ou "manuel". Sert à
     * distinguer le catalogue voulu de ce que la saisie a ramassé. */
    source: text().notNull().default(""),
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
  /** Modèle terminé, rangé : il disparaît des listes et du choix d'une
   * nouvelle journée, sans que rien ne soit supprimé. Un modèle produit une
   * fois par an sinon encombre l'écran onze mois sur douze. */
  archive: boolean().notNull().default(false),
  /** Effectif servant à estimer les pièces/heure dans la fiche modèle.
   * 0 = reprendre l'effectif de la première chaîne. */
  estimEff: integer().notNull().default(0),
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

/** Une ligne de l'effectif figé d'une journée.
 *
 * `id` indexe les matrices `ops` / `ret` / `opsSam` / `opsPoste` / `opsDetail`.
 * Positif = l'identifiant de la ligne `ouvriere` recopiée ; négatif = une
 * ouvrière ajoutée pour cette journée seulement (renfort, remplaçante), qui
 * n'existe pas dans la chaîne. Les deux espaces ne peuvent pas se croiser,
 * `ouvriere.id` étant un serial. */
export type JourneeOuvriere = {
  id: number;
  nom: string;
  poste: string;
  sam: number;
  /** Rattachement au registre, recopié pour que l'historique survive à une
   * ouvrière qui change de chaîne ou dont on corrige l'orthographe. */
  personnelId?: number | null;
};

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
  /** Heures travaillées dans la journée. En décimal : une demi-journée ou une
   * journée écourtée valent 8,5 ou 8,25 h, et le rendement (dont c'est le
   * dénominateur) doit en tenir compte. Le nombre de colonnes horaires de
   * saisie, lui, reste entier — voir `cols`, dérivé de l'arrondi supérieur. */
  nbHeures: doublePrecision().notNull().default(8),
  cloture: boolean().notNull().default(false),
  objManuel: doublePrecision(),
  cols: jsonb().$type<string[]>().notNull().default([]),
  /** Effectif de la journée, figé au moment où elle est créée.
   *
   * Sans lui, une journée lisait l'effectif *courant* de sa chaîne : retirer
   * une ouvrière aujourd'hui réécrivait le rendement de toutes les journées
   * passées, et les clés de `ops` pointaient vers des lignes disparues. Un
   * tableau vide veut dire « journée d'avant ce champ » — la lecture retombe
   * alors sur `chaine.ouvrieres`, comme avant. */
  ouvrieres: jsonb().$type<JourneeOuvriere[]>().notNull().default([]),
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
