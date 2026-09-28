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
    /** client = fourni par le client (CM) | dbs = acheté par DBS (CMT). */
    origine: text().notNull().default("client"),
    /** Fournisseur, pour une ligne achetée par DBS (liste d'achat). */
    fournisseur: text().notNull().default(""),
    /** Ligne générée par la nomenclature du modèle : `qtePrevue` est alors
     * calculée (qté/pièce × pièces × (1 + casse)), plus saisie à la main. */
    nomenclatureId: integer().references(() => fournitureNomenclature.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("commande_four_cmd_idx").on(t.commandeId)],
);

/** Nomenclature fournitures d'un MODÈLE : ce qu'il faut par pièce.
 *
 * La clé est la référence article (ou le nom du modèle sans référence),
 * normalisée : toutes les commandes du même modèle partagent la même
 * nomenclature, et leur « prévu » se calcule tout seul. */
export const fournitureNomenclature = pgTable(
  "fourniture_nomenclature",
  {
    id: serial().primaryKey(),
    /** Clé normalisée du modèle (voir lib/domain/fournitures.ts → cleModele). */
    modeleCle: text().notNull(),
    /** Libellé lisible (référence · modèle). */
    modeleLabel: text().notNull().default(""),
    designation: text().notNull().default(""),
    qteParPiece: doublePrecision().notNull().default(0),
    unite: text().notNull().default("pcs"),
    /** % de casse / surplus ajouté au besoin. */
    cassePct: doublePrecision().notNull().default(0),
    origine: text().notNull().default("client"),
    fournisseur: text().notNull().default(""),
    ordre: integer().notNull().default(0),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("fourniture_nomenclature_cle_idx").on(t.modeleCle)],
);

/** Bon de réception de fournitures du client : UN bon peut livrer plusieurs
 * commandes et plusieurs modèles. Chaque ligne crédite une ligne de
 * fourniture d'une commande. */
export const fournitureReception = pgTable("fourniture_reception", {
  id: serial().primaryKey(),
  numero: text().notNull().default(""),
  date: date().notNull(),
  client: text().notNull().default(""),
  /** N° du bon de livraison du client. */
  blClient: text().notNull().default(""),
  note: text().notNull().default(""),
  createdBy: text().notNull().default(""),
  createdAt: timestamp().notNull().defaultNow(),
});

export const fournitureReceptionLigne = pgTable(
  "fourniture_reception_ligne",
  {
    id: serial().primaryKey(),
    receptionId: integer()
      .notNull()
      .references(() => fournitureReception.id, { onDelete: "cascade" }),
    ligneId: integer().references(() => commandeFournitureLigne.id, { onDelete: "set null" }),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    /** Copie lisible (la ligne peut disparaître). */
    designation: text().notNull().default(""),
    qte: doublePrecision().notNull().default(0),
    unite: text().notNull().default("pcs"),
  },
  (t) => [index("fourniture_reception_ligne_rec_idx").on(t.receptionId)],
);

/** Restes de fournitures par client — en quantités seulement (matière du
 * client, pas de valeur). Un reste se réutilise sur une autre commande ou se
 * rend au client. */
export const fournitureReste = pgTable(
  "fourniture_reste",
  {
    id: serial().primaryKey(),
    client: text().notNull().default(""),
    designation: text().notNull().default(""),
    unite: text().notNull().default("pcs"),
    qte: doublePrecision().notNull().default(0),
    /** OF d'où vient le reste (lisible). */
    origineOf: text().notNull().default(""),
    /** en_stock | reutilise | rendu */
    statut: text().notNull().default("en_stock"),
    /** OF de réutilisation ou n° du bon de retour. */
    destination: text().notNull().default(""),
    date: date().notNull(),
    dateSortie: date(),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("fourniture_reste_client_idx").on(t.client)],
);

/* Le détail « tissus reçus d'une commande, un par matière » a vécu ici sous
 * `commandeTissuLigne` (table `commande_tissu_ligne`). Remplacé pour de bon par
 * le magasin tissu par LOTS (voir `./tissu.ts` : réception → lot → affectation
 * à la commande → consommation) — supprimé en migration 0034, données déjà
 * reprises en lots depuis la 0027. Le feu tissu et l'inventaire par commande
 * lisent maintenant les affectations (`ligneTissuParCommandes` dans
 * `lib/services/tissu.ts`). */

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
});

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
