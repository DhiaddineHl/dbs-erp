"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth/server";
import {
  CONTROLE,
  type Opt,
  PRIO,
  STATUT_ACTION,
  STATUT_QRQC,
  STATUT_RECEP,
  ecartTone,
  toneOf,
} from "@/lib/modules/options";
import * as svc from "@/lib/services/modules";
import type { EntityName, ModuleEntityName } from "@/lib/services/modules";
import {
  deleteClientsAction,
  deleteCommandesAction,
  deleteFaconniersAction,
  updateClientRow,
  updateCommandeRow,
  updateFaconnierRow,
} from "@/lib/actions/commandes";

type Result = { ok: true } | { ok: false; error: string };
type Data = Record<string, string>;

const ok: Result = { ok: true };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});
const num = (v: string | undefined) => Number(v) || 0;

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

const ENTITY_CFG: Record<ModuleEntityName, EntityCfg> = {
  tissu: {
    path: "/tissus",
    numeric: ["recue", "prevue"],
    status: { ecart: "ecart", controle: CONTROLE, statut: STATUT_RECEP },
  },
  fourniture: { path: "/fournitures", numeric: [], status: { controle: CONTROLE, statut: STATUT_RECEP } },
  be: { path: "/be", numeric: [], status: {} },
  gamme: { path: "/gammes", numeric: ["ops"], status: {} },
  capacite: { path: "/capacite", numeric: ["eff"], status: {} },
  costing: { path: "/capacite", numeric: ["qte"], status: {} },
  ordo: { path: "/ordonnancement", numeric: ["rang", "qte"], status: { prio: PRIO } },
  of: { path: "/ofs", numeric: ["qte", "prod"], status: {} },
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

/* commande / client / façonnier are no longer generic `m_*` rows: they have
 * typed columns, foreign keys and a price journal, so <EditableTable> is routed
 * to their dedicated actions instead of the tone/label patch builder. */
export async function updateEntity(entity: EntityName, id: number, patch: Record<string, string>): Promise<Result> {
  try {
    if (entity === "commande") return await updateCommandeRow(id, patch);
    if (entity === "client") return await updateClientRow(id, patch);
    if (entity === "faconnier") return await updateFaconnierRow(id, patch);

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
    if (entity === "commande") return await deleteCommandesAction(ids);
    if (entity === "client") return await deleteClientsAction(ids);
    if (entity === "faconnier") return await deleteFaconniersAction(ids);

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

