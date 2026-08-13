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

/** Un lâcher de coupe, éventuellement par taille. */
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
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("coupe_commande_idx").on(t.commandeId)],
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
