import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  mAction,
  mAlerte,
  mBe,
  mCapaciteChaine,
  mCosting,
  mFourniture,
  mGamme,
  mOf,
  mOrdo,
  mQrqc,
  mTissu,
} from "@/lib/db/schema";
import type { Tone } from "@/components/shared/status-badge";
import type {
  ActionRow,
  AlertRow,
  BeRow,
  CostingRow,
  FournitureRow,
  OrdoRow,
  QrqcRow,
  TissuRow,
} from "@/lib/modules/types";

const t = (tone: string) => tone as Tone;

/* ─────────── plain entities (row shape matches the table) ─────────── */
export const listGammes = () => db.select().from(mGamme).orderBy(mGamme.id);
export const listCapaciteChaines = () => db.select().from(mCapaciteChaine).orderBy(mCapaciteChaine.id);
export const listOfs = () => db.select().from(mOf).orderBy(mOf.id);

/* ─────────── entities with [tone, label] status tuples ─────────── */
export async function listTissus(): Promise<TissuRow[]> {
  const rows = await db.select().from(mTissu).orderBy(mTissu.id);
  return rows.map((r) => ({
    id: r.id, date: r.date, cmd: r.cmd, design: r.design, recue: r.recue, prevue: r.prevue,
    ecart: [t(r.ecartTone), r.ecartLabel], controle: [t(r.controleTone), r.controleLabel],
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listFournitures(): Promise<FournitureRow[]> {
  const rows = await db.select().from(mFourniture).orderBy(mFourniture.id);
  return rows.map((r) => ({
    id: r.id, date: r.date, cmd: r.cmd, type: r.type, design: r.design, qte: r.qte,
    controle: [t(r.controleTone), r.controleLabel], statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listBe(): Promise<BeRow[]> {
  const rows = await db.select().from(mBe).orderBy(mBe.id);
  return rows.map((r) => ({
    id: r.id, of: r.of, mc: r.mc, envoi: r.envoi, ok: r.ok, ref: r.ref, statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listCosting(): Promise<CostingRow[]> {
  const rows = await db.select().from(mCosting).orderBy(mCosting.id);
  return rows.map((r) => ({
    id: r.id, of: r.of, modele: r.modele, qte: r.qte, sam: r.sam, coutP: r.coutP, coutT: r.coutT,
    pf: r.pf, ecart: [t(r.ecartTone), r.ecartLabel], delai: r.delai,
  }));
}

export async function listOrdo(): Promise<OrdoRow[]> {
  const rows = await db.select().from(mOrdo).orderBy(mOrdo.rang);
  return rows.map((r) => ({
    id: r.id, rang: r.rang, prio: [t(r.prioTone), r.prioLabel], of: r.of, mc: r.mc, qte: r.qte,
    sam: r.sam, charge: r.charge, assigne: r.assigne, export: r.export, crit: [t(r.critTone), r.critLabel],
  }));
}

export async function listAlertes(): Promise<AlertRow[]> {
  const rows = await db.select().from(mAlerte).orderBy(mAlerte.id);
  return rows.map((r) => ({
    id: r.id, iconName: r.iconName, tone: t(r.tone), title: r.title, detail: r.detail, level: [t(r.levelTone), r.levelLabel],
  }));
}

export async function listQrqc(): Promise<QrqcRow[]> {
  const rows = await db.select().from(mQrqc).orderBy(mQrqc.id);
  return rows.map((r) => ({
    id: r.id, date: r.date, pb: r.pb, cause: r.cause, cmd: r.cmd, action: r.action, statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listActions(): Promise<ActionRow[]> {
  const rows = await db.select().from(mAction).orderBy(mAction.id);
  return rows.map((r) => ({
    id: r.id, action: r.action, resp: r.resp, echeance: r.echeance, prio: [t(r.prioTone), r.prioLabel],
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

/* ─────────── inserts (used by the create server actions) ─────────── */
export const insertTissu = (v: typeof mTissu.$inferInsert) => db.insert(mTissu).values(v);
export const insertFourniture = (v: typeof mFourniture.$inferInsert) => db.insert(mFourniture).values(v);
export const insertGamme = (v: typeof mGamme.$inferInsert) => db.insert(mGamme).values(v);
export const insertQrqc = (v: typeof mQrqc.$inferInsert) => db.insert(mQrqc).values(v);
export const insertAction = (v: typeof mAction.$inferInsert) => db.insert(mAction).values(v);

/* ─────────── generic update / delete (inline-edit + bulk delete) ─────────── */
export const ENTITY_TABLES = {
  tissu: mTissu,
  fourniture: mFourniture,
  be: mBe,
  gamme: mGamme,
  capacite: mCapaciteChaine,
  costing: mCosting,
  ordo: mOrdo,
  of: mOf,
  qrqc: mQrqc,
  action: mAction,
} as const;

/** Entities still backed by a generic `m_*` table. */
export type ModuleEntityName = keyof typeof ENTITY_TABLES;

/** Every entity the shared <EditableTable> can drive. The three refactored
 * ones are handled by lib/actions/commandes.ts, not by the generic writers. */
export type EntityName = ModuleEntityName | "client" | "commande" | "faconnier";

export async function updateEntityRow(entity: ModuleEntityName, id: number, patch: Record<string, unknown>) {
  const table = ENTITY_TABLES[entity];
  await db.update(table).set(patch).where(eq(table.id, id));
}

export async function deleteEntityRows(entity: ModuleEntityName, ids: number[]) {
  if (!ids.length) return;
  const table = ENTITY_TABLES[entity];
  await db.delete(table).where(inArray(table.id, ids));
}
