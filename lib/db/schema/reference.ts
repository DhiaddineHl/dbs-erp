import { relations } from "drizzle-orm";
import { date, index, integer, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core";
import { commande } from "./commande";

/* ═══════════════════════════════════════════════════════════════════════
 * RÉFÉRENCE INDUSTRIELLE DBS — la mémoire de l'entreprise.
 *
 * Une référence est l'identité stable d'un article (client + référence + modèle)
 * à laquelle se rattachent toutes les commandes/OF qui la portent, sa production,
 * son SAM et son historique. Une même référence peut être commandée plusieurs
 * fois : les commandes ne fusionnent JAMAIS, elles pointent vers la même
 * référence (voir `commande.referenceId`).
 *
 * La clé canonique (`cle`) est calculée par lib/domain/reference.ts et unifie
 * les trois clés d'identité qui divergeaient dans le code.
 * ═══════════════════════════════════════════════════════════════════════ */

export const referenceIndustrielle = pgTable(
  "reference_industrielle",
  {
    id: serial().primaryKey(),
    /** Clé canonique unique (cf. `cleReference`). */
    cle: text().notNull().unique(),
    client: text().notNull().default(""),
    refArticle: text().notNull().default(""),
    modele: text().notNull().default(""),

    /* ── SAM DBS de référence : la valeur historique VALIDÉE À LA MAIN.
     * Null tant que personne ne l'a arrêtée. N'écrase jamais le SAM théorique
     * du modèle (qui reste dans `modele.sam`) ni le SAM constaté (dérivé). */
    samDbs: integer(),
    samDbsPar: text().notNull().default(""),
    samDbsDate: date(),

    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("reference_client_idx").on(t.client)],
);

/** Une série produite d'une référence : la trace de ce qui s'est réellement
 * passé, série après série. Le SAM constaté y est FIGÉ au moment où on l'archive
 * (déduction faite des temps non productifs), pour que l'historique ne bouge
 * plus. C'est ce que lit la proposition de SAM DBS. */
export const samSerie = pgTable(
  "sam_serie",
  {
    id: serial().primaryKey(),
    referenceId: integer()
      .notNull()
      .references(() => referenceIndustrielle.id, { onDelete: "cascade" }),
    /** OF concerné, quand la série correspond à une commande précise. */
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    /** Étiquette lisible (n° OF ou libellé de série). */
    libelle: text().notNull().default(""),
    /** SAM théorique en vigueur à ce moment-là (sec/pièce). */
    samTheorique: integer(),
    /** SAM constaté figé (sec/pièce), temps non productifs déduits. */
    samConstate: integer(),
    pieces: integer().notNull().default(0),
    rendementMoyen: integer(),
    /** D'où vient la ligne : "auto" (dérivée des journées) | "manuel". */
    source: text().notNull().default("auto"),
    date: date(),
    note: text().notNull().default(""),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("sam_serie_ref_idx").on(t.referenceId), index("sam_serie_cmd_idx").on(t.commandeId)],
);

export const referenceIndustrielleRelations = relations(referenceIndustrielle, ({ many }) => ({
  commandes: many(commande),
  series: many(samSerie),
}));

export const samSerieRelations = relations(samSerie, ({ one }) => ({
  reference: one(referenceIndustrielle, { fields: [samSerie.referenceId], references: [referenceIndustrielle.id] }),
  commande: one(commande, { fields: [samSerie.commandeId], references: [commande.id] }),
}));
