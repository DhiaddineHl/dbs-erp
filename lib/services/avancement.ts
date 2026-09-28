import "server-only";
import { and, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { br, commande, journee, magasinMouvement, modele } from "@/lib/db/schema";
import { produitCommande } from "@/lib/domain/aval";

/* Avancement d'une commande — le SEUL endroit qui écrit `commande.produit`.
 *
 * La GPAO (production interne) et le magasin (réceptions façonniers,
 * retouches) l'appellent tous les deux : plus aucun des deux ne peut écraser
 * ce que l'autre a compté. Formule dans lib/domain/aval.ts (produitCommande). */

type Executeur = Pick<typeof db, "select" | "update">;

/** Production GPAO cumulée des modèles reliés à la commande. */
export async function productionGpao(ex: Executeur, commandeId: number): Promise<number> {
  const modeles = await ex.select({ id: modele.id }).from(modele).where(eq(modele.commandeId, commandeId));
  if (!modeles.length) return 0;
  const journees = await ex
    .select({ sortie: journee.sortie })
    .from(journee)
    .where(inArray(journee.modeleId, modeles.map((m) => m.id)));
  let total = 0;
  for (const j of journees) for (const v of Object.values(j.sortie ?? {})) if (typeof v === "number") total += v;
  return total;
}

/** Recalcule et écrit `produit` (et renvoie le détail pour qui en a besoin). */
export async function recalculerProduit(ex: Executeur, commandeId: number) {
  const [c] = await ex.select({ qte: commande.qte, produit: commande.produit }).from(commande).where(eq(commande.id, commandeId));
  if (!c) return null;
  // En séquence : `ex` peut être une transaction, qui n'a qu'une connexion.
  const gpao = await productionGpao(ex, commandeId);
  const [{ brOk }] = await ex
    .select({ brOk: sql<number>`coalesce(sum(${br.qteOk}), 0)::int` })
    .from(br)
    .where(eq(br.commandeId, commandeId));
  const [{ reprises }] = await ex
    .select({ reprises: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
    .from(magasinMouvement)
    .where(and(eq(magasinMouvement.commandeId, commandeId), eq(magasinMouvement.origine, "retouche")));
  const produit = produitCommande({ qte: c.qte, gpao, brOk, reprises });
  if (produit !== c.produit) {
    await ex.update(commande).set({ produit, updatedAt: new Date() }).where(eq(commande.id, commandeId));
  }
  return { produit, gpao, brOk, reprises };
}

/** Entrées au stock qui comptent (le rebut n'entre pas). */
export const conditionEntreeStock = (commandeId: number) =>
  and(eq(magasinMouvement.commandeId, commandeId), ne(magasinMouvement.origine, "rebut"));

/** Production GPAO par commande, pour toutes les commandes d'un coup (écrans de liste). */
export async function productionGpaoParCommande(): Promise<Map<number, number>> {
  const [modeles, journees] = await Promise.all([
    db.select({ id: modele.id, commandeId: modele.commandeId }).from(modele),
    db.select({ modeleId: journee.modeleId, sortie: journee.sortie }).from(journee),
  ]);
  const cmdDe = new Map(modeles.filter((m) => m.commandeId != null).map((m) => [m.id, m.commandeId!]));
  const out = new Map<number, number>();
  for (const j of journees) {
    const c = cmdDe.get(j.modeleId);
    if (c == null) continue;
    let t = 0;
    for (const v of Object.values(j.sortie ?? {})) if (typeof v === "number") t += v;
    out.set(c, (out.get(c) ?? 0) + t);
  }
  return out;
}
