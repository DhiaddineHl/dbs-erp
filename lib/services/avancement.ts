import "server-only";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { br, commande, journee, magasinMouvement, modele } from "@/lib/db/schema";
import { produitCommande, repartirProductionGpao, type OfGpao, type PartGpao } from "@/lib/domain/aval";
import { normaliserNom } from "@/lib/domain/commande";

/* Avancement d'une commande — le SEUL endroit qui écrit `commande.produit`.
 *
 * La GPAO (production interne) et le magasin (réceptions façonniers,
 * retouches) l'appellent tous les deux : plus aucun des deux ne peut écraser
 * ce que l'autre a compté. Formule dans lib/domain/aval.ts (produitCommande). */

type Executeur = Pick<typeof db, "select" | "update">;

const sommeSortie = (sortie: Record<string, unknown> | null) => {
  let t = 0;
  for (const v of Object.values(sortie ?? {})) if (typeof v === "number") t += v;
  return t;
};

/** Champs d'une commande utiles à la répartition GPAO. */
const colonnesOf = {
  id: commande.id,
  clientId: commande.clientId,
  modele: commande.modele,
  qte: commande.qte,
  dateExport: commande.dateExport,
  archived: commande.archived,
  faconnierId: commande.faconnierId,
};
type LigneOf = { id: number; clientId: number | null; modele: string; qte: number; dateExport: string | null; archived: boolean; faconnierId: number | null };
const versOfGpao = (c: LigneOf): OfGpao => ({
  id: c.id,
  clientId: c.clientId,
  modele: c.modele,
  qte: c.qte,
  dateExport: c.dateExport,
  // Une commande archivée ou confiée à un façonnier ne reçoit pas la production interne d'un frère.
  recoitSurplus: !c.archived && c.faconnierId == null,
});

/** OF frères d'une commande : même client, même nom de modèle (elle comprise). */
async function freres(ex: Executeur, commandeId: number): Promise<LigneOf[]> {
  const [c] = await ex.select(colonnesOf).from(commande).where(eq(commande.id, commandeId));
  if (!c) return [];
  const nom = normaliserNom(c.modele);
  if (!nom) return [c];
  const memeClient = await ex
    .select(colonnesOf)
    .from(commande)
    .where(c.clientId == null ? isNull(commande.clientId) : eq(commande.clientId, c.clientId));
  return memeClient.filter((x) => normaliserNom(x.modele) === nom);
}

/** Production GPAO DIRECTE (modèles reliés) de chaque commande donnée. */
async function productionDirecte(ex: Executeur, ids: number[]): Promise<Map<number, number>> {
  const out = new Map<number, number>();
  if (!ids.length) return out;
  const modeles = await ex.select({ id: modele.id, commandeId: modele.commandeId }).from(modele).where(inArray(modele.commandeId, ids));
  if (!modeles.length) return out;
  const cmdDe = new Map(modeles.map((m) => [m.id, m.commandeId!]));
  const journees = await ex
    .select({ modeleId: journee.modeleId, sortie: journee.sortie })
    .from(journee)
    .where(inArray(journee.modeleId, modeles.map((m) => m.id)));
  for (const j of journees) {
    const c = cmdDe.get(j.modeleId);
    if (c != null) out.set(c, (out.get(c) ?? 0) + sommeSortie(j.sortie));
  }
  return out;
}

/** Part de production GPAO de chaque OF du groupe de frères de la commande
 * (répartition : lib/domain/aval.ts repartirProductionGpao). */
async function partsGpaoGroupe(ex: Executeur, commandeId: number): Promise<{ ids: number[]; parts: Map<number, PartGpao> }> {
  const ofs = await freres(ex, commandeId);
  const ids = ofs.map((o) => o.id);
  const directe = await productionDirecte(ex, ids);
  return { ids, parts: repartirProductionGpao(ofs.map(versOfGpao), directe) };
}

/** Production GPAO attribuée à la commande (sa production + le surplus de ses frères). */
export async function productionGpao(ex: Executeur, commandeId: number): Promise<number> {
  return (await partsGpaoGroupe(ex, commandeId)).parts.get(commandeId)?.gpao ?? 0;
}

/** Recalcule et écrit `produit` (et renvoie le détail pour qui en a besoin). */
export async function recalculerProduit(ex: Executeur, commandeId: number, gpaoConnu?: number) {
  const [c] = await ex.select({ qte: commande.qte, produit: commande.produit }).from(commande).where(eq(commande.id, commandeId));
  if (!c) return null;
  // En séquence : `ex` peut être une transaction, qui n'a qu'une connexion.
  const gpao = gpaoConnu ?? (await productionGpao(ex, commandeId));
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

/** Recalcule la commande ET tous ses OF frères : quand la production GPAO
 * d'un modèle bouge, son surplus éventuel se redistribue entre eux. */
export async function recalculerProduitGroupe(ex: Executeur, commandeId: number) {
  const ofs = await freres(ex, commandeId);
  const directe = await productionDirecte(ex, ofs.map((o) => o.id));
  const parts = repartirProductionGpao(ofs.map(versOfGpao), directe);
  /* Une commande archivée est de l'historique : on ne réécrit pas son
   * avancement (elle ne reçoit d'ailleurs plus de surplus). */
  for (const o of ofs) if (!o.archived || o.id === commandeId) await recalculerProduit(ex, o.id, parts.get(o.id)?.gpao ?? 0);
}

/** Ids des OF frères d'une commande (elle comprise). */
export async function idsFreres(ex: Executeur, commandeId: number): Promise<number[]> {
  return (await freres(ex, commandeId)).map((o) => o.id);
}

/** Entrées au stock qui comptent (le rebut n'entre pas). */
export const conditionEntreeStock = (commandeId: number) =>
  and(eq(magasinMouvement.commandeId, commandeId), ne(magasinMouvement.origine, "rebut"));

/** Production GPAO par commande (après répartition entre OF frères), pour
 * toutes les commandes d'un coup (écrans de liste). */
export async function productionGpaoParCommande(): Promise<Map<number, PartGpao>> {
  const [ofs, modeles, journees] = await Promise.all([
    db.select(colonnesOf).from(commande),
    db.select({ id: modele.id, commandeId: modele.commandeId }).from(modele),
    db.select({ modeleId: journee.modeleId, sortie: journee.sortie }).from(journee),
  ]);
  const cmdDe = new Map(modeles.filter((m) => m.commandeId != null).map((m) => [m.id, m.commandeId!]));
  const directe = new Map<number, number>();
  for (const j of journees) {
    const c = cmdDe.get(j.modeleId);
    if (c == null) continue;
    directe.set(c, (directe.get(c) ?? 0) + sommeSortie(j.sortie));
  }
  return repartirProductionGpao(ofs.map(versOfGpao), directe);
}
