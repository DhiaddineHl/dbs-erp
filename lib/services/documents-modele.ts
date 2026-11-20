import "server-only";
import { and, desc, eq, inArray, isNotNull, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, commandeDocument, portailAcces } from "@/lib/db/schema";
import * as dm from "@/lib/domain/documents-modele";
import { messageBureau, type Moi } from "@/lib/services/messagerie";

/* FICHES DU MODÈLE — déposées en direction technique sur une commande, elles
 * valent pour tout son groupe (porteur et OF rattachés : même modèle). Une
 * fiche « visible par l'atelier » se consulte et s'imprime sur le portail du
 * sous-traitant à qui l'une de ces commandes est confiée. */

export type DocumentModele = {
  id: number;
  commandeId: number;
  of: string;
  nature: dm.NatureDocument;
  nom: string;
  hash: string;
  mime: string;
  taille: number;
  note: string;
  visibleAtelier: boolean;
  deposePar: string;
  le: string;
};

/** Les commandes du même groupe (le porteur et ses OF rattachés). */
async function groupes(ids: number[]): Promise<Map<number, number[]>> {
  const out = new Map<number, number[]>();
  if (!ids.length) return out;
  const base = await db.select({ id: commande.id, parentId: commande.parentId }).from(commande).where(inArray(commande.id, ids));
  const teteDe = new Map(base.map((c) => [c.id, c.parentId ?? c.id]));
  const tetes = [...new Set(teteDe.values())];
  const membres = await db
    .select({ id: commande.id, parentId: commande.parentId })
    .from(commande)
    .where(or(inArray(commande.id, tetes), inArray(commande.parentId, tetes)));
  for (const id of ids) {
    const t = teteDe.get(id) ?? id;
    out.set(id, [...new Set([t, ...membres.filter((m) => m.parentId === t).map((m) => m.id)])]);
  }
  return out;
}

export async function documentsParCommande(ids: number[], o: { pourAtelier?: boolean } = {}): Promise<Map<number, DocumentModele[]>> {
  const out = new Map<number, DocumentModele[]>();
  if (!ids.length) return out;
  const g = await groupes(ids);
  const tous = [...new Set([...g.values()].flat())];
  const rows = await db
    .select({ d: commandeDocument, of: commande.ofNumber })
    .from(commandeDocument)
    .innerJoin(commande, eq(commandeDocument.commandeId, commande.id))
    .where(and(inArray(commandeDocument.commandeId, tous), eq(commandeDocument.actif, true), ...(o.pourAtelier ? [eq(commandeDocument.visibleAtelier, true)] : [])))
    .orderBy(desc(commandeDocument.createdAt));
  const docs = rows.map(
    ({ d, of }): DocumentModele => ({
      id: d.id, commandeId: d.commandeId, of, nature: dm.estNatureDocument(d.nature) ? d.nature : "autre", nom: d.nom, hash: d.fichierHash, mime: d.mime,
      taille: d.taille, note: d.note, visibleAtelier: d.visibleAtelier, deposePar: d.deposePar, le: d.createdAt.toISOString(),
    }),
  );
  for (const id of ids) {
    const membres = new Set(g.get(id) ?? [id]);
    out.set(id, docs.filter((d) => membres.has(d.commandeId)));
  }
  return out;
}

export async function ajouterDocument(
  v: { commandeId: number; nature: string; nom: string; hash: string; mime: string; taille: number; note: string; visibleAtelier: boolean },
  moi: Moi,
) {
  if (!dm.estNatureDocument(v.nature)) throw new Error("Type de fiche inconnu.");
  const [c] = await db.select({ id: commande.id, of: commande.ofNumber, modele: commande.modele, parentId: commande.parentId }).from(commande).where(eq(commande.id, v.commandeId));
  if (!c) throw new Error("Commande introuvable.");
  const [d] = await db
    .insert(commandeDocument)
    .values({
      commandeId: c.id, nature: v.nature, nom: v.nom.slice(0, 200), fichierHash: v.hash, mime: v.mime, taille: v.taille,
      note: (v.note ?? "").trim().slice(0, 300), visibleAtelier: v.visibleAtelier, deposePar: moi.nom,
    })
    .returning({ id: commandeDocument.id });
  if (v.visibleAtelier) await prevenirAteliers(c.id, moi, `📄 Nouvelle ${dm.NATURES_DOCUMENT[v.nature].toLowerCase()} pour ${c.of} · ${c.modele} : « ${v.nom} » (onglet Commandes → 📄 Fiches).`);
  return d.id;
}

/** Un mot dans le fil des ateliers concernés (ceux qui ont une commande du groupe). */
async function prevenirAteliers(commandeId: number, moi: Moi, texte: string) {
  const membres = (await groupes([commandeId])).get(commandeId) ?? [commandeId];
  const ateliers = await db.select({ f: commande.faconnierId }).from(commande).where(and(inArray(commande.id, membres), isNotNull(commande.faconnierId)));
  const ids = [...new Set(ateliers.map((a) => a.f!))];
  if (!ids.length) return;
  const acces = await db
    .select({ conv: portailAcces.conversationId })
    .from(portailAcces)
    .where(and(eq(portailAcces.type, "soustraitant"), eq(portailAcces.actif, true), inArray(portailAcces.faconnierId, ids)));
  for (const a of acces) if (a.conv) await messageBureau(a.conv, moi, texte, commandeId).catch(() => 0);
}

export async function retirerDocument(id: number, moi: Moi) {
  const [d] = await db
    .update(commandeDocument)
    .set({ actif: false, retirePar: moi.nom, retireLe: new Date() })
    .where(and(eq(commandeDocument.id, id), eq(commandeDocument.actif, true)))
    .returning({ nom: commandeDocument.nom });
  if (!d) throw new Error("Fiche introuvable ou déjà retirée.");
  return d.nom;
}

export async function visibiliteDocument(id: number, visible: boolean) {
  await db.update(commandeDocument).set({ visibleAtelier: visible }).where(eq(commandeDocument.id, id));
}

/** Une fiche que CET atelier a le droit d'ouvrir : active, visible par
 * l'atelier, et rattachée au groupe d'une commande qui lui est confiée. */
export async function documentPourAtelier(faconnierId: number, docId: number): Promise<DocumentModele | null> {
  const [d] = await db.select().from(commandeDocument).where(and(eq(commandeDocument.id, docId), eq(commandeDocument.actif, true), eq(commandeDocument.visibleAtelier, true)));
  if (!d) return null;
  const membres = (await groupes([d.commandeId])).get(d.commandeId) ?? [d.commandeId];
  const [sienne] = await db.select({ id: commande.id }).from(commande).where(and(inArray(commande.id, membres), eq(commande.faconnierId, faconnierId))).limit(1);
  if (!sienne) return null;
  return {
    id: d.id, commandeId: d.commandeId, of: "", nature: dm.estNatureDocument(d.nature) ? d.nature : "autre", nom: d.nom, hash: d.fichierHash, mime: d.mime,
    taille: d.taille, note: d.note, visibleAtelier: true, deposePar: d.deposePar, le: d.createdAt.toISOString(),
  };
}
