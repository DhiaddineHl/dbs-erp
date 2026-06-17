"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { assertUser } from "@/lib/auth/server";
import {
  CONTROLE,
  CONTROLE_BR,
  type Opt,
  PRIO,
  RETARD,
  STATUT_ACTION,
  STATUT_BL,
  STATUT_CMD,
  STATUT_QRQC,
  STATUT_RECEP,
  ecartTone,
  toneOf,
} from "@/lib/modules/options";
import { CLIENT_COLUMNS, COMMANDE_COLUMNS, mapRow } from "@/lib/modules/columns";
import * as svc from "@/lib/services/modules";
import type { EntityName } from "@/lib/services/modules";

type Result = { ok: true } | { ok: false; error: string };
type ImportResult = { ok: true; count: number } | { ok: false; error: string };
type Data = Record<string, string>;

const ok: Result = { ok: true };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});
const num = (v: string | undefined) => Number(v) || 0;
const seq = (prefix: string, n: number) => `${prefix}${String(n + 1).padStart(3, "0")}`;

/** Parse the tailles field (JSON string from the size-grid editor) into rows. */
function parseTailles(raw: string | undefined): { taille: string; qte: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as { taille: string; qte: number }[];
    return Array.isArray(arr)
      ? arr.filter((t) => t && t.taille).map((t) => ({ taille: String(t.taille), qte: Number(t.qte) || 0 }))
      : [];
  } catch {
    return [];
  }
}

/** Parse the first sheet of an uploaded .csv/.xlsx/.xls into header-keyed rows.
 * For CSV the delimiter is sniffed (French Excel uses `;`). */
async function parseUpload(formData: FormData): Promise<Record<string, unknown>[]> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Aucun fichier fourni");
  const buf = Buffer.from(await file.arrayBuffer());
  const opts: XLSX.ParsingOptions = { type: "buffer", raw: false };
  if (file.name.toLowerCase().endsWith(".csv")) {
    const firstLine = buf.toString("utf8").replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
    const semi = (firstLine.match(/;/g) ?? []).length;
    const comma = (firstLine.match(/,/g) ?? []).length;
    opts.FS = semi >= comma ? ";" : ",";
  }
  const wb = XLSX.read(buf, opts);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

export async function createClient(d: Data): Promise<Result> {
  try {
    await assertUser();
    const code = seq("CLI-", await svc.countClients());
    await svc.insertClient({
      code, nom: d.nom, contact: d.contact ?? "", email: d.email ?? "", ville: d.ville ?? "",
      cmd: num(d.cmd), ca: d.ca ?? "",
    });
    revalidatePath("/clients");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createCommande(d: Data): Promise<Result> {
  try {
    await assertUser();
    const of = seq("OF-2026-", await svc.countCommandes());
    const tailles = parseTailles(d.tailles);
    const taillesQte = tailles.reduce((s, t) => s + (Number(t.qte) || 0), 0);
    await svc.insertCommande({
      of, modele: d.modele, refArticle: d.refArticle ?? "", couleur: d.couleur ?? "",
      client: d.client, faconnier: d.faconnier ?? "",
      chaineId: d.chaineId ? Number(d.chaineId) : null,
      assigne: d.assigne ?? "", qte: taillesQte || num(d.qte), tailles,
      pv: d.pv ?? "", pf: d.pf ?? "", marge: d.marge ?? "",
      receptTissu: d.recept_tissu ?? "", export: d.export ?? "", dateExportReel: d.date_export_reel ?? "",
      note: d.note ?? "",
      retardTone: toneOf(RETARD, d.retard), retardLabel: d.retard ?? "", av: num(d.av),
      statutTone: toneOf(STATUT_CMD, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/commandes");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createFaconnier(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertFaconnier({
      nom: d.nom, spec: d.spec ?? "", contact: d.contact ?? "", tel: d.tel ?? "", prix: d.prix ?? "",
      cmd: num(d.cmd), charge: num(d.charge),
    });
    revalidatePath("/facon");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createTissu(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertTissu({
      date: d.date ?? "", cmd: d.cmd ?? "", design: d.design, recue: num(d.recue), prevue: num(d.prevue),
      ecartTone: ecartTone(d.ecart), ecartLabel: d.ecart ?? "",
      controleTone: toneOf(CONTROLE, d.controle), controleLabel: d.controle ?? "",
      statutTone: toneOf(STATUT_RECEP, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/tissus");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createFourniture(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertFourniture({
      date: d.date ?? "", cmd: d.cmd ?? "", type: d.type ?? "", design: d.design, qte: d.qte ?? "",
      controleTone: toneOf(CONTROLE, d.controle), controleLabel: d.controle ?? "",
      statutTone: toneOf(STATUT_RECEP, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/fournitures");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createGamme(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertGamme({ modele: d.modele, ops: num(d.ops), sam: d.sam ?? "", cout: d.cout ?? "", cap: d.cap ?? "" });
    revalidatePath("/gammes");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createBr(d: Data): Promise<Result> {
  try {
    await assertUser();
    const br = seq("BR-2026-", await svc.countBr());
    await svc.insertBr({
      br, date: d.date ?? "", facon: d.facon, cmd: d.cmd ?? "", recu: num(d.recu), oknc: d.oknc ?? "",
      controleTone: toneOf(CONTROLE_BR, d.controle), controleLabel: d.controle ?? "",
    });
    revalidatePath("/br");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createBl(d: Data): Promise<Result> {
  try {
    await assertUser();
    const bl = seq("BL-2026-", await svc.countBl());
    await svc.insertBl({
      bl, date: d.date ?? "", client: d.client, lignes: num(d.lignes), qte: num(d.qte), total: d.total ?? "",
      statutTone: toneOf(STATUT_BL, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/bl");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createQrqc(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertQrqc({
      date: d.date ?? "", pb: d.pb, cause: d.cause ?? "", cmd: d.cmd ?? "", action: d.action ?? "",
      statutTone: toneOf(STATUT_QRQC, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/qrqc");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function createAction(d: Data): Promise<Result> {
  try {
    await assertUser();
    await svc.insertAction({
      action: d.action, resp: d.resp ?? "", echeance: d.echeance ?? "",
      prioTone: toneOf(PRIO, d.prio), prioLabel: d.prio ?? "",
      statutTone: toneOf(STATUT_ACTION, d.statut), statutLabel: d.statut ?? "",
    });
    revalidatePath("/actions");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── generic inline update + delete / bulk delete ───────────
 * `patch` keys are the row display keys used by the editable table. Status
 * keys expand to `${key}Tone` + `${key}Label`; numeric keys are coerced. */
type StatusSpec = Opt[] | "ecart";
type EntityCfg = { path: string; numeric: string[]; status: Record<string, StatusSpec> };

const ENTITY_CFG: Record<EntityName, EntityCfg> = {
  client: { path: "/clients", numeric: ["cmd"], status: {} },
  commande: {
    path: "/commandes",
    numeric: ["qte", "av", "chaineId"],
    status: { retard: RETARD, statut: STATUT_CMD },
  },
  faconnier: { path: "/facon", numeric: ["cmd", "charge"], status: {} },
  tissu: {
    path: "/tissus",
    numeric: ["recue", "prevue"],
    status: { ecart: "ecart", controle: CONTROLE, statut: STATUT_RECEP },
  },
  fourniture: { path: "/fournitures", numeric: [], status: { controle: CONTROLE, statut: STATUT_RECEP } },
  coupe: { path: "/coupe", numeric: ["qte", "coupee"], status: {} },
  be: { path: "/be", numeric: [], status: {} },
  gamme: { path: "/gammes", numeric: ["ops"], status: {} },
  capacite: { path: "/capacite", numeric: ["eff"], status: {} },
  costing: { path: "/capacite", numeric: ["qte"], status: {} },
  ordo: { path: "/ordonnancement", numeric: ["rang", "qte"], status: { prio: PRIO } },
  of: { path: "/ofs", numeric: ["qte", "prod"], status: {} },
  br: { path: "/br", numeric: ["recu"], status: { controle: CONTROLE_BR } },
  magasin: { path: "/magasin", numeric: ["cmd", "recu"], status: {} },
  bl: { path: "/bl", numeric: ["lignes", "qte"], status: { statut: STATUT_BL } },
  archive: { path: "/archives", numeric: ["qte"], status: {} },
  qrqc: { path: "/qrqc", numeric: [], status: { statut: STATUT_QRQC } },
  action: { path: "/actions", numeric: [], status: { prio: PRIO, statut: STATUT_ACTION } },
};

function buildPatch(cfg: EntityCfg, patch: Record<string, string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, raw] of Object.entries(patch)) {
    const v = raw ?? "";
    if (k in cfg.status) {
      const spec = cfg.status[k];
      out[`${k}Tone`] = spec === "ecart" ? ecartTone(v) : toneOf(spec, v);
      out[`${k}Label`] = v;
    } else if (cfg.numeric.includes(k)) {
      out[k] = k === "chaineId" ? (v ? Number(v) : null) : Number(v) || 0;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export async function updateEntity(entity: EntityName, id: number, patch: Record<string, string>): Promise<Result> {
  try {
    await assertUser();
    const cfg = ENTITY_CFG[entity];
    if (!cfg) return { ok: false, error: "Entité inconnue" };
    await svc.updateEntityRow(entity, id, buildPatch(cfg, patch));
    revalidatePath(cfg.path);
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEntities(entity: EntityName, ids: number[]): Promise<Result> {
  try {
    await assertUser();
    const cfg = ENTITY_CFG[entity];
    if (!cfg) return { ok: false, error: "Entité inconnue" };
    await svc.deleteEntityRows(entity, ids);
    revalidatePath(cfg.path);
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── bulk import (Excel / CSV) ─────────── */
export async function importClients(formData: FormData): Promise<ImportResult> {
  try {
    await assertUser();
    const raw = await parseUpload(formData);
    if (!raw.length) return { ok: false, error: "Fichier vide ou illisible" };
    let base = await svc.countClients();
    const values = raw
      .map((r) => {
        const d = mapRow(CLIENT_COLUMNS, r);
        return {
          code: d.code || seq("CLI-", base++),
          nom: d.nom, contact: d.contact, email: d.email, ville: d.ville,
          cmd: num(d.cmd), ca: d.ca,
        };
      })
      .filter((v) => v.nom);
    if (!values.length) return { ok: false, error: "Aucune ligne valide (colonne « Raison sociale » requise)" };
    await svc.insertManyClients(values);
    revalidatePath("/clients");
    return { ok: true, count: values.length };
  } catch (e) {
    return fail(e);
  }
}

export async function importCommandes(formData: FormData): Promise<ImportResult> {
  try {
    await assertUser();
    const raw = await parseUpload(formData);
    if (!raw.length) return { ok: false, error: "Fichier vide ou illisible" };
    let base = await svc.countCommandes();
    const values = raw
      .map((r) => {
        const d = mapRow(COMMANDE_COLUMNS, r);
        return {
          of: d.of || seq("OF-2026-", base++),
          modele: d.modele, client: d.client, assigne: d.assigne, qte: num(d.qte),
          pv: d.pv, pf: d.pf, marge: d.marge, export: d.export,
          retardTone: toneOf(RETARD, d.retard), retardLabel: d.retard, av: num(d.av),
          statutTone: toneOf(STATUT_CMD, d.statut), statutLabel: d.statut,
        };
      })
      .filter((v) => v.modele && v.client);
    if (!values.length) return { ok: false, error: "Aucune ligne valide (colonnes « Modèle » et « Client » requises)" };
    await svc.insertManyCommandes(values);
    revalidatePath("/commandes");
    return { ok: true, count: values.length };
  } catch (e) {
    return fail(e);
  }
}
