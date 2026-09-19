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

/** Catalogue de fournitures récurrentes (tickets, compositions, grosgrain de
 * marque…). Sert de liste déroulante à la saisie pour éviter de retaper la même
 * désignation à chaque commande. Purement un référentiel de confort : les
 * lignes réelles restent dans commande_fourniture_ligne. */
export const fournitureCatalogue = pgTable(
  "fourniture_catalogue",
  {
    id: serial().primaryKey(),
    designation: text().notNull(),
    unite: text().notNull().default("pcs"),
    /** Quantité proposée par défaut quand on choisit cette fourniture. */
    qteDefaut: doublePrecision().notNull().default(0),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("fourniture_catalogue_desig").on(t.designation)],
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

/** Tissus reçus d'une commande, un par matière.
 *
 * Le tissu d'un modèle n'est pas toujours mono : un même vêtement peut mêler
 * plusieurs matières (tissu principal, doublure, thermocollant…), chacune avec
 * sa propre référence, sa laize et son métrage. Le champ 1:1 historique sur la
 * commande (`tissuRecu`, `tissuControle`) ne savait porter qu'une seule
 * matière ; dès qu'au moins une ligne existe ici, c'est elle qui fait foi pour
 * le magasin, l'inventaire et le feu tissu — comme les fournitures.
 *
 * La `laize` (largeur travaillable, en cm) est saisie par le magasin et lue
 * par la modéliste au moment du plan de coupe : c'est elle qui conditionne le
 * nombre de pièces par largeur de tracé. */
export const commandeTissuLigne = pgTable(
  "commande_tissu_ligne",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** Nom de la matière : « Tissu principal », « Doublure », « Thermocollant »… */
    nom: text().notNull().default("Tissu principal"),
    /** Référence fournisseur / rouleau. */
    reference: text().notNull().default(""),
    couleur: text().notNull().default(""),
    /** Laize travaillable en cm — l'information que cherche la modéliste. */
    laize: doublePrecision(),
    /** Métrage attendu et métrage effectivement reçu (en mètres). */
    metragePrevu: doublePrecision().notNull().default(0),
    metrageRecu: doublePrecision().notNull().default(0),
    /** "" | conforme | reserve | refuse — contrôle qualité de cette matière. */
    controle: text().notNull().default(""),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("commande_tissu_cmd_idx").on(t.commandeId)],
);

/* ═══════════ PLAN DE COUPE (matelassage) ═══════════
 *
 * La fiche de matelassage que prépare la modéliste : combien de tracés, à
 * combien de plis, quelles tailles dans chaque tracé. C'est elle qui dit
 * combien de tissu la commande consomme vraiment, et donc elle qui alimente
 * la consommation réelle de la nomenclature.
 *
 * Une commande, un plan : clé primaire sur la commande, comme le lancement.
 * Une sous-commande n'en a pas — on coupe le tissu une fois pour le groupe,
 * c'est le porteur qui porte le plan, exactement comme il porte la réception
 * tissu et le contrôle qualité. */

/** Un tracé (un matelas) : sa longueur, son nombre de plis, et les pièces de
 * chaque taille qu'il contient UNE fois. Multiplié par les plis, cela donne
 * les pièces coupées ; multiplié par la longueur, les mètres consommés.
 *
 * Rangé en `jsonb` dans sa matière plutôt qu'en table : un tracé n'existe pas
 * hors du matelas qui le porte, et sa carte taille → quantité a la forme déjà
 * admise pour `commande.tailles`. */
export type TracePlan = {
  nom: string;
  /** Longueur du tracé, en mètres. */
  longueur: number;
  plis: number;
  /** Longueur ESTIMÉE par le proposeur, pas encore mesurée après placement.
   *
   * Ce drapeau est le garde-fou du plan : tant qu'un tracé est estimé, la
   * consommation calculée est une prévision et le report vers la nomenclature
   * est refusé. Saisir la longueur à la main l'efface. */
  estime: boolean;
  /** Pièces de chaque taille présentes une fois dans le tracé. */
  qty: Record<string, number>;
};

export const commandePlan = pgTable("commande_plan", {
  commandeId: integer()
    .primaryKey()
    .references(() => commande.id, { onDelete: "cascade" }),
  /** Gamme de tailles gérée par le plan, dans l'ordre d'affichage. */
  sizes: jsonb().$type<string[]>().notNull().default([]),
  /** Quantité à couper par taille. Initialisée depuis la commande, puis
   * corrigeable : c'est souvent le plan qui détaille une commande saisie en
   * taille unique, et qui la corrige en retour. */
  ordre: jsonb().$type<Record<string, number>>().notNull().default({}),

  /* ── contraintes de l'atelier ── */
  /** Pièces différentes admises dans un même tracé. */
  maxPiecesTrace: integer().notNull().default(4),
  /** Plis qu'un matelas peut empiler. */
  maxPlis: integer().notNull().default(100),
  /** Surplus toléré par taille quand le proposeur arrondit. */
  surplusTolere: integer().notNull().default(0),

  par: text().notNull().default(""),
  date: date(),
  updatedAt: timestamp().notNull().defaultNow(),
});

/** Une matière du plan : le tissu principal, la doublure, le thermocollant…
 * Chacune a sa laise, sa consommation prévue et ses propres tracés, parce
 * qu'on ne matelasse pas une doublure comme un tissu de dessus. */
export const commandePlanMatiere = pgTable(
  "commande_plan_matiere",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commandePlan.commandeId, { onDelete: "cascade" }),
    /** Rang d'affichage : les onglets matière gardent leur ordre de saisie. */
    rang: integer().notNull().default(0),
    nom: text().notNull().default("Tissu principal"),
    /** Lot du magasin tissu (nouveau modèle) dont cette matière consomme le
     * stock. Renseigné à l'import depuis le magasin ; permet de déduire la
     * consommation réelle du bon lot. Null = matière non liée à un lot. */
    lotId: integer(),
    /** Laise du rouleau, en centimètres. */
    laise: doublePrecision(),
    /** Consommation attendue, en mètres par pièce. */
    consoPrevue: doublePrecision(),
    /** Perte en bout de matelas, en mètres. */
    perteBout: doublePrecision(),
    traces: jsonb().$type<TracePlan[]>().notNull().default([]),
  },
  (t) => [index("commande_plan_matiere_idx").on(t.commandeId, t.rang)],
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

  /* ── configuration technique FIGÉE au OK production (cahier des charges §11).
   * Au lancement, on mémorise avec QUELLE version on a produit cette série, pour
   * pouvoir le dire plus tard. Nullable : les lancements existants restent
   * valides, ces champs se remplissent à partir des prochains lancements. */
  versionPatronage: integer(),
  versionTds: integer(),
  versionPlan: integer(),
  /** Consommation théorique (m/pc) et SAM en vigueur au lancement, figés. */
  consoFige: doublePrecision(),
  samFige: integer(),
  /** Instantané libre de la config technique, pour la traçabilité complète. */
  configSnapshot: jsonb().$type<Record<string, unknown>>(),
});

/** VERSIONS DU PLAN DE COUPE (cahier des charges §10) : à chaque modification
 * significative du plan, l'état précédent est archivé ici plutôt qu'écrasé
 * silencieusement. Permet de retrouver « le plan V1 » après passage en V2. */
export const commandePlanVersion = pgTable(
  "commande_plan_version",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    version: integer().notNull().default(1),
    /** Instantané complet du plan (sizes, ordre, matières, tracés) au moment de
     * l'archivage — rangé en jsonb, indépendant des tables vivantes. */
    snapshot: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    par: text().notNull().default(""),
    motif: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("commande_plan_version_rang").on(t.commandeId, t.version),
    index("commande_plan_version_cmd_idx").on(t.commandeId),
  ],
);

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
export const commandePlanRelations = relations(commandePlan, ({ one, many }) => ({
  commande: one(commande, { fields: [commandePlan.commandeId], references: [commande.id] }),
  matieres: many(commandePlanMatiere),
}));
export const commandePlanMatiereRelations = relations(commandePlanMatiere, ({ one }) => ({
  plan: one(commandePlan, { fields: [commandePlanMatiere.commandeId], references: [commandePlan.commandeId] }),
}));
export const commandeLancementRelations = relations(commandeLancement, ({ one }) => ({
  commande: one(commande, { fields: [commandeLancement.commandeId], references: [commande.id] }),
}));
export const commandeJournalRelations = relations(commandeJournal, ({ one }) => ({
  commande: one(commande, { fields: [commandeJournal.commandeId], references: [commande.id] }),
}));
export const commandePlanVersionRelations = relations(commandePlanVersion, ({ one }) => ({
  commande: one(commande, { fields: [commandePlanVersion.commandeId], references: [commande.id] }),
}));
