import { relations } from "drizzle-orm";
import {
  type AnyPgColumn,
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
} from "drizzle-orm/pg-core";
import { chaine } from "./gpao";
import {
  commandeEtape,
  commandeFournitureLigne,
  commandeJournal,
  commandeLancement,
  commandeTds,
} from "./preparation";
import { client, faconnier } from "./referentiel";

export type Taille = { taille: string; qte: number };

/* The commande is the pivot of the whole system: préparation, coupe, magasin,
 * BL, facturation and traçabilité all read and write it.
 *
 * Two rules this table follows and `m_commande` did not:
 *   1. it stores facts, never rendering decisions — no `*Tone` / `*Label`
 *      pairs. Statut, retard, marge and avancement are derived at read time
 *      by lib/domain/commande.ts, so a commande becomes late on its own.
 *   2. amounts are numeric and dates are dates. Formatting happens in the UI. */
export const commande = pgTable(
  "commande",
  {
    id: serial().primaryKey(),
    /** Business number, e.g. "OF-2026-287". */
    ofNumber: text().notNull().unique(),

    /* ── identity ── */
    modele: text().notNull(),
    refArticle: text().notNull().default(""),
    couleur: text().notNull().default(""),
    saison: text().notNull().default(""),
    note: text().notNull().default(""),
    /** Set when a commande was split off another one. */
    parentId: integer().references((): AnyPgColumn => commande.id, { onDelete: "set null" }),

    /* ── links ── */
    clientId: integer().references(() => client.id, { onDelete: "set null" }),
    faconnierId: integer().references(() => faconnier.id, { onDelete: "set null" }),
    chaineId: integer().references(() => chaine.id, { onDelete: "set null" }),

    /* ── quantities & prices ── */
    qte: integer().notNull().default(0),
    tailles: jsonb().$type<Taille[]>().notNull().default([]),
    prixVente: doublePrecision(),
    prixFacon: doublePrecision(),

    /* ── nomenclature (feeds the fabric requirement) ── */
    consoTheo: doublePrecision(),
    consoReel: doublePrecision(),
    /** Per-commande waste rate; null falls back to the `chutePct` app setting. */
    chutePct: doublePrecision(),

    /* ── dates ── */
    receptTissu: date(),
    dateExport: date(),
    dateExportReel: date(),
    dateLivraison: date(),
    /** Set when the commande is queued in Prévision Export. */
    exportPrev: date(),

    /* ── progress counters (these drive the derived statut) ── */
    produit: integer().notNull().default(0),
    coupeQte: integer().notNull().default(0),
    magasinQte: integer().notNull().default(0),
    factureQte: integer().notNull().default(0),
    tissuRecu: doublePrecision().notNull().default(0),

    /* ── magasin tissu (1:1 avec la commande, donc pas de table dédiée) ── */
    tissuDateReelle: date(),
    /** "" | conforme | reserve | refuse */
    tissuControle: text().notNull().default(""),
    tissuNote: text().notNull().default(""),

    /* ── magasin fournitures ──
     * Statut global de repli : il ne compte que tant qu'aucune ligne de détail
     * n'existe dans commande_fourniture_ligne. */
    fournituresStatut: text().notNull().default(""),

    /* ── flags ── */
    /** Dérivé du contrôle (conforme ou sous réserve) et écrit en même temps. */
    tissuLibere: boolean().notNull().default(false),
    magasinPrepare: boolean().notNull().default(false),
    magasinExpedie: boolean().notNull().default(false),
    archived: boolean().notNull().default(false),

    /** Manual statut override; null = fully derived. */
    statutManuel: text(),
    /** Logistics statut used by Prévision Export: attente | pret | expedie. */
    statutLog: text().notNull().default("attente"),

    /** Invoice numbers this commande was matched against ("79/2026", …). */
    facNums: jsonb().$type<string[]>().notNull().default([]),

    /** Photo du modèle, adressée par le hash de son contenu dans `fichier`.
     *
     * Simple colonne et non table de liaison : une commande n'a qu'une photo,
     * celle qui permet à l'atelier de reconnaître l'article sans ouvrir le
     * dossier technique. Elle est purgée à la livraison — elle n'a plus
     * d'utilité une fois la marchandise partie. */
    photoHash: text(),

    createdAt: timestamp().notNull().defaultNow(),
    updatedAt: timestamp().notNull().defaultNow(),
  },
  (t) => [
    index("commande_client_idx").on(t.clientId),
    index("commande_faconnier_idx").on(t.faconnierId),
    index("commande_archived_idx").on(t.archived),
    index("commande_modele_idx").on(t.modele),
  ],
);

/** Append-only price journal — the server-side equivalent of PilotPro's
 * PPRICE ledger: every prix_vente / prix_facon change, who made it and when.
 *
 * Deleting a commande detaches its entries instead of cascading them away: an
 * audit trail that disappears with the record it audits is not one. The OF
 * number is denormalised so the history stays readable afterwards. */
export const commandePrixJournal = pgTable(
  "commande_prix_journal",
  {
    id: serial().primaryKey(),
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    ofNumber: text().notNull().default(""),
    champ: text().notNull(), // prixVente | prixFacon
    ancien: doublePrecision(),
    nouveau: doublePrecision(),
    userId: text(),
    userName: text().notNull().default(""),
    ts: timestamp().notNull().defaultNow(),
  },
  (t) => [index("prix_journal_commande_idx").on(t.commandeId)],
);

/** Tombstones for deleted OF numbers, so a re-import never resurrects them
 * (PilotPro keeps this as `ds.deletedOfs`). */
export const ofSupprime = pgTable("of_supprime", {
  ofNumber: text().primaryKey(),
  supprimeLe: timestamp().notNull().defaultNow(),
  parUserId: text(),
});

export const commandeRelations = relations(commande, ({ one, many }) => ({
  client: one(client, { fields: [commande.clientId], references: [client.id] }),
  faconnier: one(faconnier, { fields: [commande.faconnierId], references: [faconnier.id] }),
  chaine: one(chaine, { fields: [commande.chaineId], references: [chaine.id] }),
  parent: one(commande, { fields: [commande.parentId], references: [commande.id], relationName: "parent" }),
  tds: many(commandeTds),
  etapes: many(commandeEtape),
  fournitures: many(commandeFournitureLigne),
  lancement: one(commandeLancement),
  journal: many(commandeJournal),
}));

export const commandePrixJournalRelations = relations(commandePrixJournal, ({ one }) => ({
  commande: one(commande, { fields: [commandePrixJournal.commandeId], references: [commande.id] }),
}));
