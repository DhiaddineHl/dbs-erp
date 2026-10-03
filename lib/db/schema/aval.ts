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
import { client } from "./referentiel";

/* Flux aval : ce qui sort de production jusqu'à la facture.
 *
 *   coupe → réception sous-traitance → stock magasin → bon de livraison
 *
 * Les compteurs portés par la commande (coupeQte, produit, magasinQte) sont
 * la somme des mouvements enregistrés ici. Ils y sont recopiés à chaque
 * écriture plutôt que recalculés à la lecture : la commande est lue partout,
 * les mouvements ne le sont que dans leur module. */

/** FICHE DE COUPE (CP-AAAA-NNN) : une coupe réalisée depuis le plan de
 * coupe. Elle porte l'en-tête et les chiffres figés à la validation ; le
 * détail par OF × taille est écrit dans `coupe` (ci-dessous), qui reste la
 * seule source du coupé (`commande.coupeQte`). Une fiche ne s'efface pas :
 * elle s'ANNULE (motif), ses lignes sortent alors des totaux. */
export const coupeFiche = pgTable(
  "coupe_fiche",
  {
    id: serial().primaryKey(),
    numero: text().notNull().unique(),
    /** Commande qui porte le plan (le porteur pour des OF réunis). */
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    date: date().notNull(),
    /** validee | annulee */
    statut: text().notNull().default("validee"),
    /** interne | soustraite */
    type: text().notNull().default("interne"),
    /** Matière du plan suivie pour la consommation (0 = tissu principal). */
    matiereRang: integer().notNull().default(0),
    matiereNom: text().notNull().default(""),
    /** Consommation prévue par pièce (m), figée à la validation. */
    consoPrevuePiece: doublePrecision(),
    /** Métrage des tracés du plan (longueur × plis), figé. */
    metragePlan: doublePrecision(),
    /** Seuil d'écart (%) au-delà duquel un motif était exigé. */
    seuilEcartPct: doublePrecision().notNull().default(2),
    /** Motif de l'écart prévu / coupé (manque_tissu, defaut_tissu…) + précision. */
    motifEcart: text().notNull().default(""),
    precisionEcart: text().notNull().default(""),
    note: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
    annulePar: text().notNull().default(""),
    annuleLe: timestamp(),
    motifAnnulation: text().notNull().default(""),
  },
  (t) => [index("coupe_fiche_commande_idx").on(t.commandeId)],
);

/** Un lâcher de coupe, éventuellement par taille. Avec une fiche : une ligne
 * par OF × taille, le prévu du plan figé à côté du coupé. Sans fiche : un
 * lâcher saisi à la main (ancien mode, sans plan de coupe). */
export const coupe = pgTable(
  "coupe",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    date: date().notNull(),
    qte: integer().notNull().default(0),
    /** Vide = toutes tailles confondues. */
    taille: text().notNull().default(""),
    /** interne | soustraite */
    type: text().notNull().default("interne"),
    note: text().notNull().default(""),
    /** Fiche de coupe d'origine (null = lâcher saisi à la main). */
    ficheId: integer().references((): AnyPgColumn => coupeFiche.id, { onDelete: "cascade" }),
    /** Quantité prévue par le plan pour cet OF × taille (figée). */
    qtePrevue: integer(),
    /** Quantité commandée pour cet OF × taille (figée). */
    qteCommandee: integer(),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("coupe_commande_idx").on(t.commandeId), index("coupe_fiche_idx").on(t.ficheId)],
);

/** PROCÈS-VERBAL DE COUPE client (PVC-AAAA-NNN). Chaque génération est une
 * VERSION figée (données copiées au moment de générer) : le document remis
 * au client ne change jamais en silence ; régénérer crée la version suivante. */
export const pvCoupe = pgTable(
  "pv_coupe",
  {
    id: serial().primaryKey(),
    numero: text().notNull(),
    version: integer().notNull().default(1),
    ficheId: integer()
      .notNull()
      .references(() => coupeFiche.id, { onDelete: "cascade" }),
    donnees: jsonb().notNull(),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [unique("pv_coupe_version").on(t.numero, t.version), index("pv_coupe_fiche_idx").on(t.ficheId)],
);

/** Bon de réception d'un façonnier. Alimente le produit et le stock magasin. */
export const br = pgTable(
  "br",
  {
    id: serial().primaryKey(),
    numero: text().notNull().unique(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    date: date().notNull(),
    /** Recopié au moment de la réception : le rapport doit rester lisible. */
    faconnier: text().notNull().default(""),
    qteRecue: integer().notNull().default(0),
    qteOk: integer().notNull().default(0),
    qteNc: integer().notNull().default(0),
    /** ok | ecart | refuse */
    controle: text().notNull().default("ok"),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("br_commande_idx").on(t.commandeId)],
);

/** Entrée de stock produits finis. Une réception ST en crée une
 * automatiquement ; la production interne se saisit directement. */
export const magasinMouvement = pgTable(
  "magasin_mouvement",
  {
    id: serial().primaryKey(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    date: date().notNull(),
    qte: integer().notNull().default(0),
    /** br | interne */
    origine: text().notNull().default("interne"),
    brId: integer().references(() => br.id, { onDelete: "cascade" }),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("magasin_commande_idx").on(t.commandeId)],
);

/** Bon de livraison export. */
export const bl = pgTable(
  "bl",
  {
    id: serial().primaryKey(),
    numero: text().notNull().unique(),
    date: date().notNull(),
    clientId: integer().references(() => client.id, { onDelete: "set null" }),
    /** Recopié : le document ne doit pas changer si le client est renommé. */
    clientNom: text().notNull().default(""),
    transporteur: text().notNull().default(""),
    adresseLivraison: text().notNull().default(""),
    /** draft | sent | invoiced */
    statut: text().notNull().default("draft"),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("bl_client_idx").on(t.clientId), index("bl_statut_idx").on(t.statut)],
);

export const blLigne = pgTable(
  "bl_ligne",
  {
    id: serial().primaryKey(),
    blId: integer()
      .notNull()
      .references(() => bl.id, { onDelete: "cascade" }),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    /* Identité figée à l'émission du BL. */
    of: text().notNull().default(""),
    modele: text().notNull().default(""),
    refArticle: text().notNull().default(""),
    couleur: text().notNull().default(""),
    qteLivree: integer().notNull().default(0),
    prixUnitaire: doublePrecision().notNull().default(0),
  },
  (t) => [index("bl_ligne_bl_idx").on(t.blId)],
);

export const coupeRelations = relations(coupe, ({ one }) => ({
  commande: one(commande, { fields: [coupe.commandeId], references: [commande.id] }),
}));
export const brRelations = relations(br, ({ one, many }) => ({
  commande: one(commande, { fields: [br.commandeId], references: [commande.id] }),
  mouvements: many(magasinMouvement),
}));
export const magasinMouvementRelations = relations(magasinMouvement, ({ one }) => ({
  commande: one(commande, { fields: [magasinMouvement.commandeId], references: [commande.id] }),
  br: one(br, { fields: [magasinMouvement.brId], references: [br.id] }),
}));
export const blRelations = relations(bl, ({ one, many }) => ({
  client: one(client, { fields: [bl.clientId], references: [client.id] }),
  lignes: many(blLigne),
}));
export const blLigneRelations = relations(blLigne, ({ one }) => ({
  bl: one(bl, { fields: [blLigne.blId], references: [bl.id] }),
  commande: one(commande, { fields: [blLigne.commandeId], references: [commande.id] }),
}));
