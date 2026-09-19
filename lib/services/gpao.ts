import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, client, commande, journee, modele, ouvriere } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";

/* Reads return shapes aligned with app/(app)/gpao_prod/store.ts so the future
 * UI wiring is a near drop-in for the localStorage store. */

export async function getModeles() {
  return db.select().from(modele).orderBy(modele.id);
}

export async function getChaines() {
  return db.query.chaine.findMany({ with: { ouvrieres: true }, orderBy: (c, { asc }) => asc(c.id) });
}

export async function getJournees() {
  return db.select().from(journee).orderBy(journee.date);
}

/** Une journée par son id — utile pour vérifier son état (clôture) avant
 * d'autoriser une écriture côté serveur. */
export async function getJournee(id: number) {
  const [row] = await db.select().from(journee).where(eq(journee.id, id)).limit(1);
  return row ?? null;
}

/* ─────────── modèle writes ─────────── */
export async function insertModele(input: typeof modele.$inferInsert) {
  const [row] = await db.insert(modele).values(input).returning();
  return row;
}
export async function updateModele(id: number, patch: Partial<typeof modele.$inferInsert>) {
  await db.update(modele).set(patch).where(eq(modele.id, id));
}
export async function deleteModele(id: number) {
  await db.delete(modele).where(eq(modele.id, id));
}

/** Passerelle Commandes → GPAO (B22).
 *
 * Enregistrer une commande fait exister son modèle côté production, avec la
 * quantité de TOUTES les commandes actives qui le portent : c'est cette
 * quantité que la chaîne doit sortir, pas celle d'une commande isolée.
 *
 * Le SAM n'est jamais écrasé. Il est tenu dans GPAO, à partir des opérations
 * réellement chronométrées ; le remplacer depuis les commandes effacerait un
 * relevé d'atelier par une donnée commerciale. Un modèle créé ici part donc
 * sur le SAM par défaut de la colonne, que les écrans GPAO signalent déjà
 * comme à régler.
 *
 * Ne crée rien pour un modèle sans nom, et ne réveille pas un modèle archivé :
 * l'archivage est une décision de l'atelier. */
export async function synchroniserModele(nom: string): Promise<"cree" | "maj" | "aucun"> {
  const propre = nom.trim();
  if (!propre) return "aucun";

  const [agg] = await db
    .select({
      qte: sql<number>`coalesce(sum(${commande.qte}), 0)::int`,
      n: sql<number>`count(*)::int`,
      ref: sql<string>`coalesce(max(${commande.refArticle}), '')`,
      client: sql<string>`coalesce(max(${client.nom}), '')`,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(and(eq(commande.modele, propre), eq(commande.archived, false)));

  // Plus aucune commande active : rien à pousser, et surtout rien à effacer.
  if (!agg || agg.n === 0) return "aucun";

  const [existant] = await db.select().from(modele).where(eq(modele.nom, propre)).limit(1);

  if (existant) {
    await db
      .update(modele)
      .set({
        // Les champs vides ne remplacent pas une valeur déjà saisie en GPAO.
        ref: agg.ref || existant.ref,
        client: agg.client || existant.client,
        qte: agg.qte,
      })
      .where(eq(modele.id, existant.id));
    return "maj";
  }

  await db.insert(modele).values({ nom: propre, ref: agg.ref, client: agg.client, qte: agg.qte });
  return "cree";
}

/* ─────────── chaîne writes ─────────── */
export async function upsertChaineWithOuvrieres(
  c: { nom: string; chef?: string },
  ouvrieres: { nom: string; poste: string; sam: number }[],
) {
  return db.transaction(async (tx) => {
    const [row] = await tx.insert(chaine).values({ nom: c.nom, chef: c.chef ?? "" }).returning();
    if (ouvrieres.length)
      await tx.insert(ouvriere).values(ouvrieres.map((o) => ({ chaineId: row.id, ...o })));
    return row;
  });
}
export async function insertChaine(input: { nom: string; chef?: string }) {
  const [row] = await db.insert(chaine).values({ nom: input.nom, chef: input.chef ?? "" }).returning();
  return row;
}
export async function updateChaine(id: number, patch: { nom?: string; chef?: string }) {
  await db.update(chaine).set(patch).where(eq(chaine.id, id));
}
export async function deleteChaine(id: number) {
  await db.delete(chaine).where(eq(chaine.id, id));
}

/* ─────────── ouvrière writes ─────────── */
export async function insertOuvriere(input: typeof ouvriere.$inferInsert) {
  const [row] = await db.insert(ouvriere).values(input).returning();
  return row;
}
export async function updateOuvriere(id: number, patch: Partial<typeof ouvriere.$inferInsert>) {
  await db.update(ouvriere).set(patch).where(eq(ouvriere.id, id));
}
export async function deleteOuvriere(id: number) {
  await db.delete(ouvriere).where(eq(ouvriere.id, id));
}

/** Effectif courant d'une chaîne, dans la forme figée par une journée.
 *
 * Lu côté serveur au moment de créer la journée plutôt que repris du client :
 * l'effectif figé est une photo de la base, pas de l'écran de celui qui clique. */
export async function ouvrieresDeChaine(chaineId: number): Promise<JourneeOuvriere[]> {
  const rows = await db
    .select({
      id: ouvriere.id,
      nom: ouvriere.nom,
      poste: ouvriere.poste,
      sam: ouvriere.sam,
      personnelId: ouvriere.personnelId,
    })
    .from(ouvriere)
    .where(eq(ouvriere.chaineId, chaineId))
    .orderBy(asc(ouvriere.id));
  return rows;
}

/* ─────────── journée writes ─────────── */
export async function insertJournee(input: typeof journee.$inferInsert) {
  const [row] = await db.insert(journee).values(input).returning();
  return row;
}

export async function updateJournee(id: number, patch: Partial<typeof journee.$inferInsert>) {
  await db.update(journee).set(patch).where(eq(journee.id, id));
}

export async function deleteJournee(id: number) {
  await db.delete(journee).where(eq(journee.id, id));
}

export async function countModeles() {
  return (await db.select().from(modele)).length;
}
