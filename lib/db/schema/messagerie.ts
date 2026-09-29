import { boolean, index, integer, pgTable, primaryKey, serial, text, timestamp } from "drizzle-orm/pg-core";
import { user } from "./auth";
import { commande } from "./commande";
import { fichier } from "./fichier";

/* Messagerie interne (style WhatsApp Web, dans PilotPro).
 *
 * Une CONVERSATION est soit directe (deux personnes), soit un groupe (nom +
 * membres). Les messages appartiennent à la conversation ; une personne ne lit
 * que les conversations dont elle est membre. « Lu » = une ligne dans
 * message_lecture (qui, quand) : c'est ce qui affiche ✓✓ et « Lu par … ». */

export const conversation = pgTable(
  "conversation",
  {
    id: serial().primaryKey(),
    /** direct | groupe */
    type: text().notNull().default("direct"),
    /** Nom du groupe ("" pour une discussion directe : c'est le nom de l'autre). */
    nom: text().notNull().default(""),
    /** Discussion directe : « idA|idB » trié — une seule conversation par paire. */
    cleDirect: text().unique(),
    creePar: text().references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp().notNull().defaultNow(),
    /** Date du dernier message : tri de la liste des discussions. */
    dernierMessageLe: timestamp().notNull().defaultNow(),
  },
  (t) => [index("conversation_dernier_idx").on(t.dernierMessageLe)],
);

export const conversationMembre = pgTable(
  "conversation_membre",
  {
    conversationId: integer()
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    /** admin (peut gérer le groupe) | membre */
    role: text().notNull().default("membre"),
    ajouteLe: timestamp().notNull().defaultNow(),
    /** A quitté ou a été retiré : garde l'historique, ne reçoit plus rien. */
    parti: boolean().notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.conversationId, t.userId] }), index("conversation_membre_user_idx").on(t.userId)],
);

export const message = pgTable(
  "message",
  {
    id: serial().primaryKey(),
    conversationId: integer()
      .notNull()
      .references(() => conversation.id, { onDelete: "cascade" }),
    auteurId: text().references(() => user.id, { onDelete: "set null" }),
    /** Nom de l'auteur recopié : le fil reste lisible si le compte disparaît. */
    auteurNom: text().notNull().default(""),
    /** texte | systeme (« X a ajouté Y au groupe ») */
    genre: text().notNull().default("texte"),
    texte: text().notNull().default(""),
    /** Pièce jointe (photo, PDF, Excel…) : contenu dans le stockage objet. */
    fichierHash: text().references(() => fichier.hash, { onDelete: "set null" }),
    fichierNom: text().notNull().default(""),
    fichierMime: text().notNull().default(""),
    fichierTaille: integer().notNull().default(0),
    /** Commande / OF cité : un clic l'ouvre. */
    commandeId: integer().references(() => commande.id, { onDelete: "set null" }),
    commandeLabel: text().notNull().default(""),
    /** Supprimé par son auteur : le fil affiche « Message supprimé ». */
    supprime: boolean().notNull().default(false),
    createdAt: timestamp().notNull().defaultNow(),
  },
  (t) => [index("message_conversation_idx").on(t.conversationId, t.id)],
);

export const messageLecture = pgTable(
  "message_lecture",
  {
    messageId: integer()
      .notNull()
      .references(() => message.id, { onDelete: "cascade" }),
    userId: text()
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    luLe: timestamp().notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.messageId, t.userId] }), index("message_lecture_user_idx").on(t.userId)],
);

/** Dernière activité de chaque personne dans PilotPro (« en ligne », « vu à »). */
export const presence = pgTable("presence", {
  userId: text()
    .primaryKey()
    .references(() => user.id, { onDelete: "cascade" }),
  vuLe: timestamp().notNull().defaultNow(),
});
