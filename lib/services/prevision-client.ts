import "server-only";
import { and, desc, eq, inArray, lt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, exportPrevision, exportPrevisionLigne, portailAcces } from "@/lib/db/schema";
import * as pv from "@/lib/domain/prevision-client";
import { todayISO } from "@/lib/domain/commande";
import { listPrevisionExport } from "@/lib/services/aval";
import { messageBureau, type Moi } from "@/lib/services/messagerie";

/* PRÉVISION D'EXPORT PUBLIÉE AUX CLIENTS — côté bureau.
 *
 * Le brouillon part de l'échéancier « Prévision export » existant (date
 * prévue, sinon contractuelle) : une seule source pour les dates. Vous
 * vérifiez, retirez une ligne ou corrigez une quantité, écrivez un mot par
 * client, puis « Publier » fige une photo que chaque client lit sur son
 * portail. */

const d10 = (d: unknown) => (d instanceof Date ? d.toISOString() : d ? String(d) : "").slice(0, 10);

export type LigneBrouillon = pv.LigneComparee & { max: number };
export type BrouillonClient = { clientId: number; client: string; lignes: LigneBrouillon[] };
export type Brouillon = { debut: string; fin: string; semaines: { debut: string; fin: string }[]; clients: BrouillonClient[]; precedente: { debut: string; version: number; publieLe: string } | null };

/** Ce qui part dans la période, par commande telle que le client la connaît
 * (la tête du groupe : une découpe ou un regroupement = une ligne). */
async function lignesPrevues(periode: { debut: string; fin: string }): Promise<{ lignes: pv.LignePrevue[]; noms: Map<number, string> }> {
  const toutes = await listPrevisionExport();
  const parId = new Map(toutes.map((c) => [c.id, c]));
  const teteDe = (c: (typeof toutes)[number]) => (c.parentId != null && parId.has(c.parentId) ? c.parentId : c.id);
  const groupes = new Map<number, typeof toutes>();
  for (const c of toutes) groupes.set(teteDe(c), [...(groupes.get(teteDe(c)) ?? []), c]);
  const noms = new Map<number, string>();
  const lignes: pv.LignePrevue[] = [];
  for (const [teteId, membres] of groupes) {
    const tete = parId.get(teteId)!;
    if (tete.clientId == null) continue;
    const dans = membres.filter((m) => !m.magasinExpedie && m.datePlan && m.datePlan >= periode.debut && m.datePlan <= periode.fin);
    const reste = dans.reduce((s, m) => s + Math.max(0, m.qtePropre - m.expedieQte), 0);
    if (!dans.length || reste <= 0) continue;
    noms.set(tete.clientId, tete.client);
    lignes.push({
      commandeId: teteId,
      clientId: tete.clientId,
      of: tete.of,
      modele: tete.modele,
      reference: tete.refArticle,
      couleur: tete.couleur,
      date: dans.map((m) => m.datePlan).sort()[0],
      qte: reste,
      qteCommande: membres.reduce((s, m) => s + m.qtePropre, 0),
      etat: pv.etatExport({
        reste,
        stock: dans.reduce((s, m) => s + Math.max(0, m.stockQte), 0),
        produit: dans.reduce((s, m) => s + m.produit, 0),
        qte: dans.reduce((s, m) => s + m.qtePropre, 0),
        pret: dans.every((m) => m.statutLog === "pret"),
      }),
    });
  }
  return { lignes, noms };
}

/** Dernière publication d'une période ANTÉRIEURE : la base des « changements ». */
async function precedente(debut: string) {
  const [p] = await db.select().from(exportPrevision).where(lt(exportPrevision.debut, debut)).orderBy(desc(exportPrevision.debut), desc(exportPrevision.version)).limit(1);
  if (!p) return null;
  const lignes = await db.select().from(exportPrevisionLigne).where(eq(exportPrevisionLigne.previsionId, p.id));
  return { p, lignes: lignes.filter((l) => l.changement !== "retiree").map((l) => ({ ...l, date: d10(l.date) || null })) };
}

export async function brouillon(aujourdhui = todayISO()): Promise<Brouillon> {
  const periode = pv.periodePrevision(aujourdhui);
  const [{ lignes, noms }, prec] = await Promise.all([lignesPrevues(periode), precedente(periode.debut)]);
  const comparees = pv.comparerPrevision(lignes, prec?.lignes ?? null, periode);
  // Les lignes « retirées » peuvent viser un client absent de la nouvelle liste.
  const manquants = [...new Set(comparees.map((l) => l.clientId).filter((id): id is number => id != null && !noms.has(id)))];
  if (manquants.length) for (const c of await db.select({ id: client.id, nom: client.nom }).from(client).where(inArray(client.id, manquants))) noms.set(c.id, c.nom);
  const clients = new Map<number, BrouillonClient>();
  for (const l of comparees) {
    if (l.clientId == null) continue;
    const c = clients.get(l.clientId) ?? { clientId: l.clientId, client: noms.get(l.clientId) ?? "—", lignes: [] };
    c.lignes.push({ ...l, max: l.qteCommande });
    clients.set(l.clientId, c);
  }
  return {
    ...periode,
    clients: [...clients.values()].sort((a, b) => a.client.localeCompare(b.client, "fr")),
    precedente: prec ? { debut: d10(prec.p.debut), version: prec.p.version, publieLe: prec.p.publieLe.toISOString() } : null,
  };
}

/** Publie la photo : lignes retenues (quantités éventuellement corrigées),
 * changements calculés à nouveau côté serveur, un mot par client. Prévient
 * chaque client qui a un portail, dans son fil. */
export async function publier(v: { exclus: number[]; qtes: Record<string, number>; commentaires: Record<string, string> }, moi: Moi) {
  const aujourdhui = todayISO();
  const periode = pv.periodePrevision(aujourdhui);
  const [{ lignes }, prec] = await Promise.all([lignesPrevues(periode), precedente(periode.debut)]);
  const exclus = new Set(v.exclus ?? []);
  const retenues: pv.LignePrevue[] = [];
  for (const l of lignes) {
    if (exclus.has(l.commandeId)) continue;
    const q = v.qtes?.[String(l.commandeId)];
    if (q !== undefined && q !== null && String(q) !== "") {
      const refus = pv.refusQuantite(q, l.qteCommande);
      if (refus) throw new Error(`${l.of} : ${refus}`);
      if (Number(q) === 0) continue;
      retenues.push({ ...l, qte: Number(q) });
    } else retenues.push(l);
  }
  const comparees = pv.comparerPrevision(retenues, prec?.lignes ?? null, periode);
  if (!comparees.length) throw new Error("Rien à publier pour ces deux semaines.");
  const commentaires: Record<string, string> = {};
  for (const [k, t] of Object.entries(v.commentaires ?? {})) if ((t ?? "").trim()) commentaires[k] = t.trim().slice(0, 500);

  const id = await db.transaction(async (t) => {
    await t.execute(sql`select pg_advisory_xact_lock(hashtext('export_prevision'))`);
    const [{ n }] = await t.select({ n: sql<number>`coalesce(max(${exportPrevision.version}), 0)::int` }).from(exportPrevision).where(eq(exportPrevision.debut, periode.debut));
    const [p] = await t
      .insert(exportPrevision)
      .values({ debut: periode.debut, fin: periode.fin, version: Number(n) + 1, commentaires, publiePar: moi.nom })
      .returning({ id: exportPrevision.id });
    await t.insert(exportPrevisionLigne).values(
      comparees.map((l) => ({
        previsionId: p.id, clientId: l.clientId, commandeId: l.commandeId, of: l.of, modele: l.modele, reference: l.reference, couleur: l.couleur,
        date: l.date, qte: l.qte, qteCommande: l.qteCommande, etat: l.etat, changement: l.changement, dateAvant: l.dateAvant, qteAvant: l.qteAvant,
      })),
    );
    return p.id;
  });

  // Un mot dans le fil de chaque client concerné qui a un portail.
  const clientsVises = [...new Set(comparees.map((l) => l.clientId).filter((x): x is number => x != null))];
  const acces = clientsVises.length
    ? await db
        .select({ clientId: portailAcces.clientId, conv: portailAcces.conversationId })
        .from(portailAcces)
        .where(and(eq(portailAcces.type, "client"), eq(portailAcces.actif, true), inArray(portailAcces.clientId, clientsVises)))
    : [];
  const fr = (x: string) => x.split("-").reverse().join("/");
  for (const a of acces) {
    if (!a.conv) continue;
    const n = comparees.filter((l) => l.clientId === a.clientId && l.changement !== "retiree").length;
    await messageBureau(a.conv, moi, `📦 Prévision d'export du ${fr(periode.debut)} au ${fr(periode.fin)} publiée : ${n} commande(s) (onglet « Prévision d'export »).`).catch(() => 0);
  }
  return { id, debut: periode.debut, lignes: comparees.length, clients: clientsVises.length };
}

export async function historique(limite = 12) {
  const ps = await db.select().from(exportPrevision).orderBy(desc(exportPrevision.publieLe)).limit(limite);
  const ids = ps.map((p) => p.id);
  const lignes = ids.length
    ? await db.select({ p: exportPrevisionLigne.previsionId, c: exportPrevisionLigne.clientId }).from(exportPrevisionLigne).where(inArray(exportPrevisionLigne.previsionId, ids))
    : [];
  return ps.map((p) => ({
    id: p.id, debut: d10(p.debut), fin: d10(p.fin), version: p.version, publieLe: p.publieLe.toISOString(), publiePar: p.publiePar,
    lignes: lignes.filter((l) => l.p === p.id).length, clients: new Set(lignes.filter((l) => l.p === p.id).map((l) => l.c)).size,
  }));
}

/** Pastille du menu : le week-end, tant que la prévision n'est pas publiée. */
export async function aPublier(aujourdhui = todayISO()): Promise<number> {
  if (!pv.estWeekEnd(aujourdhui)) return 0;
  const { debut } = pv.periodePrevision(aujourdhui);
  const [p] = await db.select({ id: exportPrevision.id }).from(exportPrevision).where(eq(exportPrevision.debut, debut)).limit(1);
  return p ? 0 : 1;
}
