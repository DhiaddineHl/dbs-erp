import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, facture, factureCostLine, factureExtra, factureLigne, faconnier } from "@/lib/db/schema";
import * as biz from "@/lib/domain/commande";

/* ─────────── Domain shapes (match the existing client store) ─────────── */
export type Ligne = { modele: string; desig: string; ref: string; couleur: string; qte: number; pu: number; mt: number };
export type Extra = { label: string; mt: number };
export type FactureDomain = {
  id: string; // business number
  type: string;
  date: string;
  client: string;
  marque: string;
  clientRaw: string;
  pieces: number;
  total: number;
  fournitures: number;
  extras: Extra[];
  lignes: Ligne[];
  poids: string;
  mp: string;
  incoterm: string;
  paiement: string;
  matieres: string[];
};

/* ─────────── Reference data ─────────── */
export async function getClients() {
  return db.select().from(client).orderBy(client.nom);
}

export async function upsertClient(input: typeof client.$inferInsert) {
  await db.insert(client).values(input).onConflictDoUpdate({ target: client.key, set: input });
}

export async function getFaconniers() {
  const rows = await db.select({ nom: faconnier.nom }).from(faconnier).orderBy(faconnier.nom);
  return rows.map((r) => r.nom);
}

export async function addFaconnier(nom: string) {
  await db.insert(faconnier).values({ nom }).onConflictDoNothing({ target: faconnier.nom });
}

/* ─────────── Invoices ─────────── */
function mapFacture(row: {
  num: string;
  type: string;
  date: string;
  clientKey: string | null;
  marque: string;
  clientRaw: string;
  pieces: number;
  total: number;
  fournitures: number;
  poids: string;
  mp: string;
  incoterm: string;
  paiement: string;
  matieres: string[];
  lignes: { idx: number; modele: string; desig: string; ref: string; couleur: string; qte: number; pu: number; mt: number }[];
  extras: { label: string; mt: number }[];
}): FactureDomain {
  return {
    id: row.num,
    type: row.type,
    date: row.date,
    client: row.clientKey ?? "autre",
    marque: row.marque,
    clientRaw: row.clientRaw,
    pieces: row.pieces,
    total: row.total,
    fournitures: row.fournitures,
    extras: row.extras.map((e) => ({ label: e.label, mt: e.mt })),
    lignes: [...row.lignes]
      .sort((a, b) => a.idx - b.idx)
      .map((l) => ({ modele: l.modele, desig: l.desig, ref: l.ref, couleur: l.couleur, qte: l.qte, pu: l.pu, mt: l.mt })),
    poids: row.poids,
    mp: row.mp,
    incoterm: row.incoterm,
    paiement: row.paiement,
    matieres: row.matieres,
  };
}

export async function getFactures(): Promise<FactureDomain[]> {
  const rows = await db.query.facture.findMany({
    where: isNull(facture.deletedAt),
    with: { lignes: true, extras: true },
  });
  return rows.map(mapFacture);
}

/** Soft-deleted invoices, for the "restore" affordance in the registre. */
export async function getDeletedFactures(): Promise<FactureDomain[]> {
  const rows = await db.query.facture.findMany({
    where: isNotNull(facture.deletedAt),
    with: { lignes: true, extras: true },
  });
  return rows.map(mapFacture);
}

export async function factureExists(num: string, type: string): Promise<boolean> {
  const [row] = await db
    .select({ id: facture.id })
    .from(facture)
    .where(and(eq(facture.num, num), eq(facture.type, type), isNull(facture.deletedAt)));
  return !!row;
}

/** Per-line cost entries shaped like the client COUTS store: `${num}|${type}` → lines[idx]. */
export async function getCostLines(): Promise<Record<string, { lines: Record<number, { lieu: string; fac: string; cout: string }> }>> {
  const rows = await db
    .select({
      num: facture.num,
      type: facture.type,
      lineIdx: factureCostLine.lineIdx,
      lieu: factureCostLine.lieu,
      faconnier: factureCostLine.faconnier,
      cout: factureCostLine.cout,
    })
    .from(factureCostLine)
    .innerJoin(facture, eq(factureCostLine.factureId, facture.id));
  const out: Record<string, { lines: Record<number, { lieu: string; fac: string; cout: string }> }> = {};
  for (const r of rows) {
    const k = `${r.num}|${r.type}`;
    (out[k] ??= { lines: {} }).lines[r.lineIdx] = {
      lieu: r.lieu,
      fac: r.faconnier,
      cout: r.cout === null ? "" : String(r.cout),
    };
  }
  return out;
}

/** Insert/replace a full invoice (header + lignes + extras). Returns its db id. */
export async function saveFacture(f: FactureDomain): Promise<number> {
  return db.transaction(async (tx) => {
    const header = {
      num: f.id,
      type: f.type,
      date: f.date,
      clientKey: f.client === "autre" ? null : f.client,
      marque: f.marque,
      clientRaw: f.clientRaw,
      pieces: f.pieces,
      total: f.total,
      fournitures: f.fournitures,
      poids: f.poids,
      mp: f.mp,
      incoterm: f.incoterm,
      paiement: f.paiement,
      matieres: f.matieres,
      // Re-saving an invoice un-deletes it.
      deletedAt: null,
    };
    const [row] = await tx
      .insert(facture)
      .values(header)
      .onConflictDoUpdate({ target: [facture.num, facture.type], set: header })
      .returning({ id: facture.id });
    const id = row.id;
    await tx.delete(factureLigne).where(eq(factureLigne.factureId, id));
    await tx.delete(factureExtra).where(eq(factureExtra.factureId, id));
    if (f.lignes.length)
      await tx.insert(factureLigne).values(f.lignes.map((l, idx) => ({ factureId: id, idx, ...l })));
    if (f.extras.length)
      await tx.insert(factureExtra).values(f.extras.map((e) => ({ factureId: id, label: e.label, mt: e.mt })));
    return id;
  });
}

/** Soft delete: keep the row + lines but hide it from the active list. */
export async function softDeleteFacture(num: string, type: string) {
  await db
    .update(facture)
    .set({ deletedAt: new Date() })
    .where(and(eq(facture.num, num), eq(facture.type, type)));
}

/** Restore every soft-deleted invoice. */
export async function restoreAllFactures() {
  await db.update(facture).set({ deletedAt: null }).where(isNotNull(facture.deletedAt));
}

export async function setCostLine(
  num: string,
  type: string,
  lineIdx: number,
  data: { lieu: string; faconnier: string; cout: number | null },
) {
  const [f] = await db
    .select({ id: facture.id })
    .from(facture)
    .where(and(eq(facture.num, num), eq(facture.type, type)));
  if (!f) return;
  await db
    .insert(factureCostLine)
    .values({ factureId: f.id, lineIdx, ...data })
    .onConflictDoUpdate({ target: [factureCostLine.factureId, factureCostLine.lineIdx], set: data });
}

/* ─────────── Rapprochement client d'une facture ───────────
 *
 * Une facture saisie directement (hors pont commande) peut arriver sans client
 * rattaché → elle s'affiche « AUTRE ». Plutôt que de laisser deviner, on
 * confronte ses modèles et références aux commandes (actives ET archivées) :
 * le client d'une commande qui porte le même modèle/référence est presque
 * toujours le bon. On rend une proposition classée par nombre de
 * correspondances, l'utilisateur garde la main pour choisir. */

export type SuggestionClient = { key: string; nom: string; score: number; preuve: string };

export async function suggererClientPourFacture(
  lignes: { modele: string; ref: string }[],
): Promise<SuggestionClient[]> {
  if (lignes.length === 0) return [];

  const rows = await db
    .select({
      modele: commande.modele,
      ref: commande.refArticle,
      clientId: commande.clientId,
      clientNom: client.nom,
      clientKey: client.key,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id));

  /* Index modèle normalisé → client, et référence normalisée → client. Le
   * modèle vaut plus que la référence (une réf peut se répéter entre saisons),
   * mais les deux concordant donnent la certitude. */
  const parModele = new Map<string, { key: string; nom: string }>();
  const parRef = new Map<string, { key: string; nom: string }>();
  for (const r of rows) {
    if (!r.clientKey || !r.clientNom) continue;
    const c = { key: r.clientKey, nom: r.clientNom };
    const m = biz.normaliserNom(r.modele);
    const ref = biz.normaliserNom(r.ref);
    if (m) parModele.set(m, c);
    if (ref) parRef.set(ref, c);
  }

  const scores = new Map<string, { nom: string; score: number; modeles: Set<string>; refs: Set<string> }>();
  const ajoute = (c: { key: string; nom: string }, points: number, quoi: string, ou: "m" | "r") => {
    const s = scores.get(c.key) ?? { nom: c.nom, score: 0, modeles: new Set<string>(), refs: new Set<string>() };
    s.score += points;
    if (ou === "m") s.modeles.add(quoi);
    else s.refs.add(quoi);
    scores.set(c.key, s);
  };

  for (const l of lignes) {
    const m = biz.normaliserNom(l.modele);
    const ref = biz.normaliserNom(l.ref);
    const cm = m ? parModele.get(m) : undefined;
    const cr = ref ? parRef.get(ref) : undefined;
    if (cm) ajoute(cm, 3, l.modele, "m");
    if (cr) ajoute(cr, 2, l.ref, "r");
  }

  return [...scores.entries()]
    .map(([key, s]) => {
      const preuves: string[] = [];
      if (s.modeles.size) preuves.push(`${s.modeles.size} modèle(s)`);
      if (s.refs.size) preuves.push(`${s.refs.size} référence(s)`);
      return { key, nom: s.nom, score: s.score, preuve: preuves.join(" · ") };
    })
    .sort((a, b) => b.score - a.score);
}

/** Réattribue le client d'une facture (num + type) à une clé client donnée. */
export async function reattribuerClientFacture(num: string, type: string, clientKey: string) {
  const key = clientKey === "autre" || clientKey === "" ? null : clientKey;
  let marque = "";
  if (key) {
    const [c] = await db.select({ nom: client.nom }).from(client).where(eq(client.key, key));
    marque = c?.nom ?? "";
  }
  await db
    .update(facture)
    .set(key ? { clientKey: key, marque } : { clientKey: null })
    .where(and(eq(facture.num, num), eq(facture.type, type)));
}
