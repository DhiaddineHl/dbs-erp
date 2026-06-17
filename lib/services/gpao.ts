import "server-only";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, journee, modele, ouvriere } from "@/lib/db/schema";

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
