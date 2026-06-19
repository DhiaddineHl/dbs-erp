import "server-only";
import { and, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, facture, factureCostLine, factureExtra, factureLigne, faconnier } from "@/lib/db/schema";

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
  const rows = await db.query.faconnier.findMany();
  return rows.map((r) => r.name);
}

export async function addFaconnier(name: string) {
  await db.insert(faconnier).values({ name }).onConflictDoNothing({ target: faconnier.name });
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
