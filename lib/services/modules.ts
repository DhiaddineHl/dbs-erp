import "server-only";
import { db } from "@/lib/db";
import {
  mAction,
  mAlerte,
  mArchive,
  mBe,
  mBl,
  mBr,
  mCapaciteChaine,
  mClient,
  mCommande,
  mCosting,
  mCoupe,
  mFaconnier,
  mFourniture,
  mGamme,
  mMagasin,
  mOf,
  mOrdo,
  mQrqc,
  mTissu,
} from "@/lib/db/schema";
import type { Tone } from "@/components/shared/status-badge";
import type {
  ActionRow,
  AlertRow,
  ArchiveRow,
  BeRow,
  BlRow,
  BrRow,
  CommandeRow,
  CostingRow,
  CoupeRow,
  FournitureRow,
  MagasinRow,
  OrdoRow,
  QrqcRow,
  TissuRow,
} from "@/lib/modules/types";

const t = (tone: string) => tone as Tone;

/* ─────────── plain entities (row shape matches the table) ─────────── */
export const listClients = () => db.select().from(mClient).orderBy(mClient.id);
export const listFaconniers = () => db.select().from(mFaconnier).orderBy(mFaconnier.id);
export const listGammes = () => db.select().from(mGamme).orderBy(mGamme.id);
export const listCapaciteChaines = () => db.select().from(mCapaciteChaine).orderBy(mCapaciteChaine.id);
export const listOfs = () => db.select().from(mOf).orderBy(mOf.id);

/* ─────────── entities with [tone, label] status tuples ─────────── */
export async function listCommandes(): Promise<CommandeRow[]> {
  const rows = await db.select().from(mCommande).orderBy(mCommande.id);
  return rows.map((r) => ({
    of: r.of, modele: r.modele, client: r.client, assigne: r.assigne, qte: r.qte,
    pv: r.pv, pf: r.pf, marge: r.marge, export: r.export,
    retard: [t(r.retardTone), r.retardLabel], av: r.av, statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listTissus(): Promise<TissuRow[]> {
  const rows = await db.select().from(mTissu).orderBy(mTissu.id);
  return rows.map((r) => ({
    date: r.date, cmd: r.cmd, design: r.design, recue: r.recue, prevue: r.prevue,
    ecart: [t(r.ecartTone), r.ecartLabel], controle: [t(r.controleTone), r.controleLabel],
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listFournitures(): Promise<FournitureRow[]> {
  const rows = await db.select().from(mFourniture).orderBy(mFourniture.id);
  return rows.map((r) => ({
    date: r.date, cmd: r.cmd, type: r.type, design: r.design, qte: r.qte,
    controle: [t(r.controleTone), r.controleLabel], statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listCoupe(): Promise<CoupeRow[]> {
  const rows = await db.select().from(mCoupe).orderBy(mCoupe.id);
  return rows.map((r) => ({
    of: r.of, mc: r.mc, qte: r.qte, coupee: r.coupee, planif: r.planif, fin: r.fin,
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listBe(): Promise<BeRow[]> {
  const rows = await db.select().from(mBe).orderBy(mBe.id);
  return rows.map((r) => ({
    of: r.of, mc: r.mc, envoi: r.envoi, ok: r.ok, ref: r.ref, statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listCosting(): Promise<CostingRow[]> {
  const rows = await db.select().from(mCosting).orderBy(mCosting.id);
  return rows.map((r) => ({
    of: r.of, modele: r.modele, qte: r.qte, sam: r.sam, coutP: r.coutP, coutT: r.coutT,
    pf: r.pf, ecart: [t(r.ecartTone), r.ecartLabel], delai: r.delai,
  }));
}

export async function listOrdo(): Promise<OrdoRow[]> {
  const rows = await db.select().from(mOrdo).orderBy(mOrdo.rang);
  return rows.map((r) => ({
    rang: r.rang, prio: [t(r.prioTone), r.prioLabel], of: r.of, mc: r.mc, qte: r.qte,
    sam: r.sam, charge: r.charge, assigne: r.assigne, export: r.export, crit: [t(r.critTone), r.critLabel],
  }));
}

export async function listBr(): Promise<BrRow[]> {
  const rows = await db.select().from(mBr).orderBy(mBr.id);
  return rows.map((r) => ({
    br: r.br, date: r.date, facon: r.facon, cmd: r.cmd, recu: r.recu, oknc: r.oknc,
    controle: [t(r.controleTone), r.controleLabel],
  }));
}

export async function listMagasin(): Promise<MagasinRow[]> {
  const rows = await db.select().from(mMagasin).orderBy(mMagasin.id);
  return rows.map((r) => ({
    of: r.of, mc: r.mc, source: [t(r.sourceTone), r.sourceLabel], cmd: r.cmd, recu: r.recu,
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listBl(): Promise<BlRow[]> {
  const rows = await db.select().from(mBl).orderBy(mBl.id);
  return rows.map((r) => ({
    bl: r.bl, date: r.date, client: r.client, lignes: r.lignes, qte: r.qte, total: r.total,
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listArchives(): Promise<ArchiveRow[]> {
  const rows = await db.select().from(mArchive).orderBy(mArchive.id);
  return rows.map((r) => ({
    of: r.of, modele: r.modele, client: r.client, qte: r.qte, ca: r.ca, marge: r.marge,
    livre: r.livre, retard: [t(r.retardTone), r.retardLabel],
  }));
}

export async function listAlertes(): Promise<AlertRow[]> {
  const rows = await db.select().from(mAlerte).orderBy(mAlerte.id);
  return rows.map((r) => ({
    iconName: r.iconName, tone: t(r.tone), title: r.title, detail: r.detail, level: [t(r.levelTone), r.levelLabel],
  }));
}

export async function listQrqc(): Promise<QrqcRow[]> {
  const rows = await db.select().from(mQrqc).orderBy(mQrqc.id);
  return rows.map((r) => ({
    date: r.date, pb: r.pb, cause: r.cause, cmd: r.cmd, action: r.action, statut: [t(r.statutTone), r.statutLabel],
  }));
}

export async function listActions(): Promise<ActionRow[]> {
  const rows = await db.select().from(mAction).orderBy(mAction.id);
  return rows.map((r) => ({
    action: r.action, resp: r.resp, echeance: r.echeance, prio: [t(r.prioTone), r.prioLabel],
    statut: [t(r.statutTone), r.statutLabel],
  }));
}

/* ─────────── inserts (used by the create server actions) ─────────── */
export const insertClient = (v: typeof mClient.$inferInsert) => db.insert(mClient).values(v);
export const insertCommande = (v: typeof mCommande.$inferInsert) => db.insert(mCommande).values(v);
export const insertFaconnier = (v: typeof mFaconnier.$inferInsert) => db.insert(mFaconnier).values(v);
export const insertTissu = (v: typeof mTissu.$inferInsert) => db.insert(mTissu).values(v);
export const insertFourniture = (v: typeof mFourniture.$inferInsert) => db.insert(mFourniture).values(v);
export const insertGamme = (v: typeof mGamme.$inferInsert) => db.insert(mGamme).values(v);
export const insertBr = (v: typeof mBr.$inferInsert) => db.insert(mBr).values(v);
export const insertBl = (v: typeof mBl.$inferInsert) => db.insert(mBl).values(v);
export const insertQrqc = (v: typeof mQrqc.$inferInsert) => db.insert(mQrqc).values(v);
export const insertAction = (v: typeof mAction.$inferInsert) => db.insert(mAction).values(v);

export const insertManyClients = (v: (typeof mClient.$inferInsert)[]) => db.insert(mClient).values(v);
export const insertManyCommandes = (v: (typeof mCommande.$inferInsert)[]) => db.insert(mCommande).values(v);

export const countClients = () => db.$count(mClient);
export const countCommandes = () => db.$count(mCommande);
export const countBr = () => db.$count(mBr);
export const countBl = () => db.$count(mBl);
