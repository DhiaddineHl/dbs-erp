import "server-only";
import { and, asc, desc, eq, gt, inArray, lt, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, conversation, conversationMembre, message, messageLecture, presence, user } from "@/lib/db/schema";
import * as ms from "@/lib/domain/messagerie";

/* Messagerie interne — lecture et écriture. Chaque fonction reçoit l'identité
 * de l'appelant et vérifie qu'il est MEMBRE de la conversation : on ne lit ni
 * n'écrit jamais dans une discussion dont on ne fait pas partie. */

export type Moi = { id: string; nom: string };

const iso = (d: Date | string | null) => (d == null ? "" : typeof d === "string" ? d : d.toISOString());

/* ─────────── annuaire ─────────── */

export type Personne = { id: string; nom: string; role: string };

/** Toutes les personnes joignables (comptes actifs). */
export async function annuaire(): Promise<Personne[]> {
  const rows = await db
    .select({ id: user.id, nom: user.name, role: user.role, banned: user.banned })
    .from(user)
    .orderBy(asc(user.name));
  return rows.filter((r) => !r.banned).map((r) => ({ id: r.id, nom: r.nom, role: r.role ?? "" }));
}

/* ─────────── appartenance ─────────── */

async function membre(convId: number, userId: string) {
  const [m] = await db
    .select()
    .from(conversationMembre)
    .where(and(eq(conversationMembre.conversationId, convId), eq(conversationMembre.userId, userId)));
  return m ?? null;
}

async function exigerMembreActif(convId: number, userId: string) {
  const m = await membre(convId, userId);
  if (!m) throw new Error("Discussion introuvable.");
  if (m.parti) throw new Error("Vous ne faites plus partie de ce groupe.");
  return m;
}

async function membresDe(convIds: number[]) {
  if (!convIds.length) return [];
  return db
    .select({
      conversationId: conversationMembre.conversationId,
      userId: conversationMembre.userId,
      role: conversationMembre.role,
      parti: conversationMembre.parti,
      nom: user.name,
      vuLe: presence.vuLe,
    })
    .from(conversationMembre)
    .innerJoin(user, eq(conversationMembre.userId, user.id))
    .leftJoin(presence, eq(presence.userId, conversationMembre.userId))
    .where(inArray(conversationMembre.conversationId, convIds));
}

/* ─────────── liste des discussions ─────────── */

export type ConversationResume = {
  id: number;
  type: string;
  nom: string;
  membres: number;
  /** Discussion directe : l'autre personne (pour l'avatar et la présence). */
  autre: { id: string; nom: string; vuLe: string } | null;
  dernier: { apercu: string; auteur: string; moi: boolean; date: string } | null;
  nonLus: number;
  parti: boolean;
};

export async function listConversations(moi: Moi): Promise<ConversationResume[]> {
  const mes = await db
    .select({ c: conversation, parti: conversationMembre.parti })
    .from(conversationMembre)
    .innerJoin(conversation, eq(conversationMembre.conversationId, conversation.id))
    .where(eq(conversationMembre.userId, moi.id))
    .orderBy(desc(conversation.dernierMessageLe));
  if (!mes.length) return [];
  const ids = mes.map((x) => x.c.id);
  const [membres, derniers, nonLus] = await Promise.all([
    membresDe(ids),
    db
      .selectDistinctOn([message.conversationId], {
        conversationId: message.conversationId,
        auteurId: message.auteurId,
        auteurNom: message.auteurNom,
        genre: message.genre,
        texte: message.texte,
        fichierNom: message.fichierNom,
        fichierMime: message.fichierMime,
        commandeLabel: message.commandeLabel,
        supprime: message.supprime,
        createdAt: message.createdAt,
      })
      .from(message)
      .where(inArray(message.conversationId, ids))
      .orderBy(message.conversationId, desc(message.id)),
    db
      .select({ conversationId: message.conversationId, n: sql<number>`count(*)::int` })
      .from(message)
      .where(
        and(
          inArray(message.conversationId, ids),
          ne(message.genre, "systeme"),
          sql`${message.auteurId} IS DISTINCT FROM ${moi.id}`,
          sql`NOT EXISTS (SELECT 1 FROM message_lecture l WHERE l.message_id = ${message.id} AND l.user_id = ${moi.id})`,
        ),
      )
      .groupBy(message.conversationId),
  ]);
  const dernierDe = new Map(derniers.map((d) => [d.conversationId, d]));
  const nonLuDe = new Map(nonLus.map((x) => [x.conversationId, x.n]));
  return mes.map(({ c, parti }) => {
    const mb = membres.filter((m) => m.conversationId === c.id);
    const actifs = mb.filter((m) => !m.parti);
    const autre = c.type === "direct" ? (mb.find((m) => m.userId !== moi.id) ?? null) : null;
    const d = dernierDe.get(c.id);
    return {
      id: c.id,
      type: c.type,
      nom: ms.nomConversation(c, mb.map((m) => ({ userId: m.userId, nom: m.nom })), moi.id),
      membres: actifs.length,
      autre: autre ? { id: autre.userId, nom: autre.nom, vuLe: iso(autre.vuLe) } : null,
      dernier: d ? { apercu: ms.apercu(d), auteur: d.auteurNom, moi: d.auteurId === moi.id, date: iso(d.createdAt) } : null,
      nonLus: nonLuDe.get(c.id) ?? 0,
      parti,
    };
  });
}

/* ─────────── une discussion ─────────── */

export type MessageVue = {
  id: number;
  auteurId: string | null;
  auteurNom: string;
  genre: string;
  texte: string;
  fichier: { hash: string; nom: string; mime: string; taille: number } | null;
  commande: { id: number | null; label: string } | null;
  supprime: boolean;
  date: string;
  /** Pour MES messages : qui l'a lu et quand ; et l'état ✓ / ✓✓. */
  lecteurs: { userId: string; nom: string; luLe: string }[];
  etat: ms.EtatLecture | null;
};

export type MembreVue = { userId: string; nom: string; role: string; parti: boolean; vuLe: string };

export type ConversationVue = {
  id: number;
  type: string;
  nom: string;
  membres: MembreVue[];
  suisAdmin: boolean;
  parti: boolean;
  messages: MessageVue[];
  plusAnciens: boolean;
};

const PAGE = 80;

async function messagesVue(convId: number, moi: Moi, filtre: { apres?: number; avant?: number }, membres: MembreVue[]): Promise<MessageVue[]> {
  const conds = [eq(message.conversationId, convId)];
  if (filtre.apres != null) conds.push(gt(message.id, filtre.apres));
  if (filtre.avant != null) conds.push(lt(message.id, filtre.avant));
  const rows = (
    await db
      .select()
      .from(message)
      .where(and(...conds))
      .orderBy(desc(message.id))
      .limit(PAGE)
  ).reverse();
  const miens = rows.filter((m) => m.auteurId === moi.id).map((m) => m.id);
  const lectures = miens.length
    ? await db
        .select({ messageId: messageLecture.messageId, userId: messageLecture.userId, luLe: messageLecture.luLe })
        .from(messageLecture)
        .where(inArray(messageLecture.messageId, miens))
    : [];
  const nomDe = new Map(membres.map((m) => [m.userId, m.nom]));
  return rows.map((m) => {
    const mien = m.auteurId === moi.id;
    const lu = lectures.filter((l) => l.messageId === m.id);
    // Destinataires = membres présents à l'envoi, autres que l'auteur.
    const dest = membres.filter((x) => x.userId !== m.auteurId && (!x.parti || lu.some((l) => l.userId === x.userId))).map((x) => x.userId);
    return {
      id: m.id,
      auteurId: m.auteurId,
      auteurNom: m.auteurNom,
      genre: m.genre,
      texte: m.supprime ? "" : m.texte,
      fichier: !m.supprime && m.fichierHash ? { hash: m.fichierHash, nom: m.fichierNom, mime: m.fichierMime, taille: m.fichierTaille } : null,
      commande: !m.supprime && m.commandeLabel ? { id: m.commandeId, label: m.commandeLabel } : null,
      supprime: m.supprime,
      date: iso(m.createdAt),
      lecteurs: mien ? lu.map((l) => ({ userId: l.userId, nom: nomDe.get(l.userId) ?? "", luLe: iso(l.luLe) })) : [],
      etat: mien && m.genre !== "systeme" ? ms.etatLecture(lu.map((l) => l.userId), dest) : null,
    };
  });
}

export async function ouvrirConversation(convId: number, moi: Moi, avant?: number): Promise<ConversationVue> {
  const mb = await membre(convId, moi.id);
  if (!mb) throw new Error("Discussion introuvable.");
  const [c] = await db.select().from(conversation).where(eq(conversation.id, convId));
  const membres: MembreVue[] = (await membresDe([convId])).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role, parti: m.parti, vuLe: iso(m.vuLe) }));
  const messages = await messagesVue(convId, moi, { avant }, membres);
  return {
    id: c.id,
    type: c.type,
    nom: ms.nomConversation(c, membres, moi.id),
    membres,
    suisAdmin: mb.role === "admin",
    parti: mb.parti,
    messages,
    plusAnciens: messages.length === PAGE,
  };
}

/** Marque comme lus tous les messages reçus de la discussion. */
export async function marquerLu(convId: number, moi: Moi): Promise<number> {
  const m = await membre(convId, moi.id);
  if (!m) return 0;
  const res = await db.execute(sql`
    INSERT INTO message_lecture (message_id, user_id)
    SELECT id, ${moi.id} FROM message
    WHERE conversation_id = ${convId} AND genre <> 'systeme' AND auteur_id IS DISTINCT FROM ${moi.id}
    ON CONFLICT DO NOTHING`);
  return res.rowCount ?? 0;
}

/* ─────────── écrire ─────────── */

async function ecrireMessage(
  convId: number,
  auteur: Moi | null,
  v: Partial<Pick<typeof message.$inferInsert, "texte" | "fichierHash" | "fichierNom" | "fichierMime" | "fichierTaille" | "commandeId" | "commandeLabel" | "genre">>,
) {
  const [row] = await db
    .insert(message)
    .values({ conversationId: convId, auteurId: auteur?.id ?? null, auteurNom: auteur?.nom ?? "", ...v })
    .returning({ id: message.id });
  await db.update(conversation).set({ dernierMessageLe: new Date() }).where(eq(conversation.id, convId));
  return row.id;
}

export async function envoyer(
  convId: number,
  moi: Moi,
  contenu: { texte?: string; fichier?: { hash: string; nom: string; mime: string; taille: number } | null; commandeId?: number | null },
): Promise<number> {
  await exigerMembreActif(convId, moi.id);
  const texte = ms.texteMessage(contenu.texte ?? "") ?? "";
  let commandeLabel = "";
  if (contenu.commandeId) {
    const [c] = await db.select({ of: commande.ofNumber, modele: commande.modele }).from(commande).where(eq(commande.id, contenu.commandeId));
    if (!c) throw new Error("Commande introuvable.");
    commandeLabel = `${c.of} · ${c.modele}`;
  }
  if (!texte && !contenu.fichier && !commandeLabel) throw new Error("Message vide.");
  return ecrireMessage(convId, moi, {
    texte,
    fichierHash: contenu.fichier?.hash ?? null,
    fichierNom: contenu.fichier?.nom.slice(0, 200) ?? "",
    fichierMime: contenu.fichier?.mime ?? "",
    fichierTaille: contenu.fichier?.taille ?? 0,
    commandeId: contenu.commandeId ?? null,
    commandeLabel,
  });
}

/** Ouvre (ou crée) LA discussion directe avec une personne. */
export async function discussionAvec(moi: Moi, autreId: string): Promise<number> {
  if (autreId === moi.id) throw new Error("Choisissez une autre personne.");
  const [autre] = await db.select({ id: user.id }).from(user).where(eq(user.id, autreId));
  if (!autre) throw new Error("Personne introuvable.");
  const cle = ms.cleDirect(moi.id, autreId);
  const [existe] = await db.select({ id: conversation.id }).from(conversation).where(eq(conversation.cleDirect, cle));
  if (existe) return existe.id;
  return db.transaction(async (t) => {
    const [c] = await t.insert(conversation).values({ type: "direct", cleDirect: cle, creePar: moi.id }).onConflictDoNothing().returning({ id: conversation.id });
    if (!c) {
      const [x] = await t.select({ id: conversation.id }).from(conversation).where(eq(conversation.cleDirect, cle));
      return x.id;
    }
    await t.insert(conversationMembre).values([
      { conversationId: c.id, userId: moi.id },
      { conversationId: c.id, userId: autreId },
    ]);
    return c.id;
  });
}

export async function creerGroupe(moi: Moi, nom: string, membresIds: string[]): Promise<number> {
  const n = (nom ?? "").trim().slice(0, ms.NOM_GROUPE_MAX);
  if (!n) throw new Error("Donnez un nom au groupe.");
  const autres = [...new Set(membresIds.filter((id) => id && id !== moi.id))];
  if (!autres.length) throw new Error("Ajoutez au moins une personne.");
  const existants = await db.select({ id: user.id, nom: user.name }).from(user).where(inArray(user.id, autres));
  if (existants.length !== autres.length) throw new Error("Personne introuvable.");
  const id = await db.transaction(async (t) => {
    const [c] = await t.insert(conversation).values({ type: "groupe", nom: n, creePar: moi.id }).returning({ id: conversation.id });
    await t.insert(conversationMembre).values([
      { conversationId: c.id, userId: moi.id, role: "admin" },
      ...autres.map((u) => ({ conversationId: c.id, userId: u })),
    ]);
    return c.id;
  });
  await ecrireMessage(id, null, { genre: "systeme", texte: `${moi.nom} a créé le groupe « ${n} »` });
  return id;
}

/** Renommer, ajouter, retirer : réservé aux administrateurs du groupe. */
export async function majGroupe(convId: number, moi: Moi, v: { nom?: string; ajouter?: string[]; retirer?: string[] }) {
  const m = await exigerMembreActif(convId, moi.id);
  const [c] = await db.select().from(conversation).where(eq(conversation.id, convId));
  if (c.type !== "groupe") throw new Error("Ce n'est pas un groupe.");
  if (m.role !== "admin") throw new Error("Seul un administrateur du groupe peut le modifier.");
  if (v.nom != null) {
    const n = v.nom.trim().slice(0, ms.NOM_GROUPE_MAX);
    if (!n) throw new Error("Donnez un nom au groupe.");
    if (n !== c.nom) {
      await db.update(conversation).set({ nom: n }).where(eq(conversation.id, convId));
      await ecrireMessage(convId, null, { genre: "systeme", texte: `${moi.nom} a renommé le groupe « ${n} »` });
    }
  }
  for (const u of [...new Set(v.ajouter ?? [])]) {
    const [p] = await db.select({ nom: user.name }).from(user).where(eq(user.id, u));
    if (!p) continue;
    await db
      .insert(conversationMembre)
      .values({ conversationId: convId, userId: u })
      .onConflictDoUpdate({ target: [conversationMembre.conversationId, conversationMembre.userId], set: { parti: false, ajouteLe: new Date() } });
    await ecrireMessage(convId, null, { genre: "systeme", texte: `${moi.nom} a ajouté ${p.nom}` });
  }
  for (const u of [...new Set(v.retirer ?? [])]) {
    if (u === moi.id) continue;
    const [p] = await db.select({ nom: user.name }).from(user).where(eq(user.id, u));
    await db
      .update(conversationMembre)
      .set({ parti: true })
      .where(and(eq(conversationMembre.conversationId, convId), eq(conversationMembre.userId, u)));
    await ecrireMessage(convId, null, { genre: "systeme", texte: `${moi.nom} a retiré ${p?.nom ?? "un membre"}` });
  }
}

export async function quitterGroupe(convId: number, moi: Moi) {
  const m = await exigerMembreActif(convId, moi.id);
  const [c] = await db.select().from(conversation).where(eq(conversation.id, convId));
  if (c.type !== "groupe") throw new Error("On ne quitte pas une discussion directe.");
  await db.update(conversationMembre).set({ parti: true, role: "membre" }).where(and(eq(conversationMembre.conversationId, convId), eq(conversationMembre.userId, moi.id)));
  await ecrireMessage(convId, null, { genre: "systeme", texte: `${moi.nom} a quitté le groupe` });
  if (m.role === "admin") {
    // Un groupe garde toujours un administrateur : le plus ancien membre.
    const restants = await db
      .select()
      .from(conversationMembre)
      .where(and(eq(conversationMembre.conversationId, convId), eq(conversationMembre.parti, false)))
      .orderBy(asc(conversationMembre.ajouteLe));
    if (restants.length && !restants.some((r) => r.role === "admin")) {
      await db.update(conversationMembre).set({ role: "admin" }).where(and(eq(conversationMembre.conversationId, convId), eq(conversationMembre.userId, restants[0].userId)));
    }
  }
}

/** Supprimer SON message (pour tout le monde) : il reste une trace « supprimé ». */
export async function supprimerMessage(messageId: number, moi: Moi) {
  const [m] = await db.select().from(message).where(eq(message.id, messageId));
  if (!m) throw new Error("Message introuvable.");
  if (m.auteurId !== moi.id) throw new Error("Vous ne pouvez supprimer que vos propres messages.");
  await db
    .update(message)
    .set({ supprime: true, texte: "", fichierHash: null, fichierNom: "", fichierMime: "", fichierTaille: 0, commandeId: null, commandeLabel: "" })
    .where(eq(message.id, messageId));
}

/* ─────────── relève (toutes les quelques secondes, sur toutes les pages) ─────────── */

export type Releve = {
  nonLus: number;
  /** Messages reçus depuis `depuis` — pour l'alerte à l'écran. */
  nouveaux: { id: number; conversationId: number; conversation: string; groupe: boolean; auteur: string; apercu: string }[];
  dernierId: number;
  /** Discussion ouverte : messages arrivés depuis `apres`, et les accusés de lecture à jour. */
  ouverte: { messages: MessageVue[]; lectures: { messageId: number; lecteurs: MessageVue["lecteurs"]; etat: MessageVue["etat"] }[]; membres: MembreVue[] } | null;
};

export async function releve(moi: Moi, p: { depuis?: number; conversationId?: number; apres?: number }): Promise<Releve> {
  await db
    .insert(presence)
    .values({ userId: moi.id, vuLe: new Date() })
    .onConflictDoUpdate({ target: presence.userId, set: { vuLe: new Date() } });

  const nonLusRes = await db.execute(sql`
    SELECT count(*)::int AS n, coalesce(max(m.id), 0)::int AS dernier FROM message m
    JOIN conversation_membre cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${moi.id} AND cm.parti = false
    WHERE m.genre <> 'systeme' AND m.auteur_id IS DISTINCT FROM ${moi.id}
      AND NOT EXISTS (SELECT 1 FROM message_lecture l WHERE l.message_id = m.id AND l.user_id = ${moi.id})`);
  const r0 = nonLusRes.rows[0] as { n: number; dernier: number };

  let nouveaux: Releve["nouveaux"] = [];
  if (p.depuis != null) {
    const rows = await db
      .select({ m: message, c: conversation })
      .from(message)
      .innerJoin(conversation, eq(message.conversationId, conversation.id))
      .innerJoin(conversationMembre, and(eq(conversationMembre.conversationId, message.conversationId), eq(conversationMembre.userId, moi.id), eq(conversationMembre.parti, false)))
      .where(and(gt(message.id, p.depuis), ne(message.genre, "systeme"), sql`${message.auteurId} IS DISTINCT FROM ${moi.id}`))
      .orderBy(asc(message.id))
      .limit(10);
    nouveaux = rows.map(({ m, c }) => ({
      id: m.id,
      conversationId: c.id,
      conversation: c.type === "groupe" ? c.nom : m.auteurNom,
      groupe: c.type === "groupe",
      auteur: m.auteurNom,
      apercu: ms.apercu(m),
    }));
  }

  let ouverte: Releve["ouverte"] = null;
  if (p.conversationId != null && (await membre(p.conversationId, moi.id))) {
    const membres: MembreVue[] = (await membresDe([p.conversationId])).map((m) => ({ userId: m.userId, nom: m.nom, role: m.role, parti: m.parti, vuLe: iso(m.vuLe) }));
    const messages = p.apres != null ? await messagesVue(p.conversationId, moi, { apres: p.apres }, membres) : [];
    // Accusés de lecture de mes 50 derniers messages (ils changent sans nouveau message).
    const miens = await messagesVue(p.conversationId, moi, {}, membres);
    ouverte = {
      messages,
      lectures: miens.filter((m) => m.auteurId === moi.id).slice(-50).map((m) => ({ messageId: m.id, lecteurs: m.lecteurs, etat: m.etat })),
      membres,
    };
  }

  const [maxId] = await db.select({ id: sql<number>`coalesce(max(${message.id}), 0)::int` }).from(message);
  return { nonLus: r0.n, nouveaux, dernierId: Math.max(maxId?.id ?? 0, r0.dernier), ouverte };
}

/** Nombre de messages non lus (pastille du menu). */
export async function totalNonLus(userId: string): Promise<number> {
  const res = await db.execute(sql`
    SELECT count(*)::int AS n FROM message m
    JOIN conversation_membre cm ON cm.conversation_id = m.conversation_id AND cm.user_id = ${userId} AND cm.parti = false
    WHERE m.genre <> 'systeme' AND m.auteur_id IS DISTINCT FROM ${userId}
      AND NOT EXISTS (SELECT 1 FROM message_lecture l WHERE l.message_id = m.id AND l.user_id = ${userId})`);
  return (res.rows[0] as { n: number }).n;
}

/** Commandes à citer dans un message (recherche par OF / modèle / client). */
export async function commandesACiter(q: string) {
  const t = `%${q.trim()}%`;
  return db
    .select({ id: commande.id, of: commande.ofNumber, modele: commande.modele })
    .from(commande)
    .where(sql`(${commande.ofNumber} ILIKE ${t} OR ${commande.modele} ILIKE ${t} OR ${commande.refArticle} ILIKE ${t})`)
    .orderBy(desc(commande.id))
    .limit(15);
}
