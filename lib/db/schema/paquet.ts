import { relations } from "drizzle-orm";
import { date, index, integer, jsonb, pgTable, serial, text, timestamp, unique } from "drizzle-orm/pg-core";
import { commande } from "./commande";
import { coupeFiche } from "./aval";
import { journee } from "./gpao";

/* PAQUETS DE COUPE — suivi physique, de la coupe à l'assemblage.
 *
 * Le paquet naît quand une fiche de coupe est validée et MEURT à
 * l'assemblage : après, ce sont des pièces entières finies, comptées comme
 * aujourd'hui par la sortie de chaîne. Le suivi par paquets s'arrête
 * exactement là où le comptage de la production commence : les deux ne se
 * touchent jamais, et aucune pièce ne peut être comptée deux fois.
 *
 * Rien ici n'alimente `commande.produit`, `coupe_qte` ni `magasin_qte`.
 * Le relevé est facultatif : une tournée non faite laisse des cases grises,
 * et la production continue exactement comme avant. */

/** Liste type de liasses, réutilisable d'un modèle à l'autre (« Chemise » =
 * col, devant, manches, dos). Simple raccourci de saisie : la liste retenue
 * est ensuite FIGÉE sur chaque paquet, pour que modifier le gabarit plus tard
 * ne réécrive pas le passé. */
export const liasseGabarit = pgTable("liasse_gabarit", {
  id: serial().primaryKey(),
  nom: text().notNull().unique(),
  liasses: jsonb().$type<string[]>().notNull().default([]),
  archive: text().notNull().default(""),
  createdBy: text().notNull().default(""),
  createdAt: timestamp().notNull().defaultNow(),
});

/** Un paquet : un OF, une taille, une quantité, un numéro définitif.
 *
 * `code` est l'adresse du QR (unique dans l'usine) ; `numero` est le numéro
 * que l'atelier manipule (1 à 48 sur un OF de 1 200 pièces par 25). */
export const paquet = pgTable(
  "paquet",
  {
    id: serial().primaryKey(),
    code: text().notNull().unique(),
    commandeId: integer()
      .notNull()
      .references(() => commande.id, { onDelete: "cascade" }),
    /** Fiche de coupe qui l'a fait naître (null = fiche purgée). */
    ficheId: integer().references(() => coupeFiche.id, { onDelete: "set null" }),
    /** Rang dans l'OF, de 1 à n. C'est le numéro écrit sur l'étiquette. */
    numero: integer().notNull(),
    taille: text().notNull().default(""),
    /* Recopiés à la création : l'étiquette imprimée ne doit pas changer de
     * sens si la commande est corrigée ensuite. */
    modele: text().notNull().default(""),
    couleur: text().notNull().default(""),
    ofNumber: text().notNull().default(""),
    qte: integer().notNull().default(0),
    /** Plage de pièces numérotées, imprimée sur l'étiquette. */
    pieceDebut: integer().notNull().default(0),
    pieceFin: integer().notNull().default(0),
    /** Liasses FIGÉES à la création : une étiquette par liasse. */
    liasses: jsonb().$type<string[]>().notNull().default([]),
    /** actif | annule (sa fiche de coupe a été annulée) */
    statut: text().notNull().default("actif"),
    /** Quantité RÉELLE quand la coupe a corrigé le paquet après coup (23 au
     * lieu de 25). null = la quantité imprimée fait foi. La quantité
     * d'origine reste figée ; chaque correction est aussi tracée dans le
     * journal (relevé « correction »). */
    qteReelle: integer(),
    /** Morceaux annulés (un morceau ajouté par erreur) : ils restent dans
     * `liasses` — les étiquettes ont pu circuler — mais ne comptent plus. */
    morceauxAnnules: jsonb().$type<string[]>().notNull().default([]),
    annuleLe: timestamp(),
    annulePar: text().notNull().default(""),
    motifAnnulation: text().notNull().default(""),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    unique("paquet_numero_of").on(t.commandeId, t.numero),
    index("paquet_commande_idx").on(t.commandeId),
    index("paquet_fiche_idx").on(t.ficheId),
    index("paquet_statut_idx").on(t.statut),
  ],
);

/** Journal des relevés d'un paquet. La règle d'or du projet : on n'efface
 * jamais, on annule. L'état du paquet est DÉRIVÉ de ce journal, jamais
 * stocké — une frise dérivée ne peut pas mentir.
 *
 * etape :
 *   poste      → ce MORCEAU (liasse) est fini à ce poste, par cette ouvrière,
 *                dans cette heure : scanné dans la saisie horaire GPAO. Un
 *                même morceau ne se finit qu'une fois au même poste.
 *   liasse     → cette liasse est finie (relevé de tournée, ancien geste)
 *   assemble   → le paquet est assemblé (bouton) : il cesse d'exister comme paquet
 *   correction → la quantité réelle du paquet a été corrigée (qte = nouvelle)
 *   probleme   → quelque chose cloche (pièces manquantes, défaut) ; ne bloque
 *                rien, signale seulement
 *   annulation → neutralise un relevé (annule_id), l'original reste */
export const paquetReleve = pgTable(
  "paquet_releve",
  {
    id: serial().primaryKey(),
    paquetId: integer()
      .notNull()
      .references(() => paquet.id, { onDelete: "cascade" }),
    /** "" pour un relevé qui porte sur le paquet entier (assemblage). */
    liasse: text().notNull().default(""),
    etape: text().notNull(),
    /** Pièces constatées, quand la responsable les compte. Facultatif. */
    qte: integer(),
    note: text().notNull().default(""),
    /** Jour CONSTATÉ : la tournée peut relever la veille. */
    date: date().notNull(),
    /* ── « fini au poste », scanné dans la saisie horaire (etape = poste) ── */
    /** Opération où le morceau a été fini (« Montage col »). */
    poste: text().notNull().default(""),
    /** Ouvrière qui l'a fini : nom recopié, et sa ligne dans la journée. */
    ouvrier: text().notNull().default(""),
    ouvId: integer(),
    journeeId: integer().references(() => journee.id, { onDelete: "set null" }),
    /** Colonne horaire de la journée (h1, h2…). */
    heure: text().notNull().default(""),
    annuleId: integer(),
    createdBy: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("paquet_releve_paquet_idx").on(t.paquetId, t.id),
    index("paquet_releve_date_idx").on(t.date),
    index("paquet_releve_journee_idx").on(t.journeeId),
  ],
);

export const paquetRelations = relations(paquet, ({ one, many }) => ({
  commande: one(commande, { fields: [paquet.commandeId], references: [commande.id] }),
  fiche: one(coupeFiche, { fields: [paquet.ficheId], references: [coupeFiche.id] }),
  releves: many(paquetReleve),
}));
export const paquetReleveRelations = relations(paquetReleve, ({ one }) => ({
  paquet: one(paquet, { fields: [paquetReleve.paquetId], references: [paquet.id] }),
}));
