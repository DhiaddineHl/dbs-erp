"use client";

import { useCallback, useState } from "react";

/* ═══════════════════ TYPES ═══════════════════ */
export type Ouvriere = { id: number; nom: string; poste: string; sam: number };
export type Chaine = { id: number; nom: string; chef: string; ouvrieres: Ouvriere[] };
export type Modele = { id: number; nom: string; ref: string; client: string; sam: number; qte: number };
/** cell value: number, or marker strings RI / ABS */
export type Cell = number | "RI" | "ABS";
/** one operation done within an hour (multi-poste support) */
export type OpDetail = { poste: string; sam: number; qte: number };
export type Journee = {
  id: number;
  date: string;
  chaineId: number;
  modeleId: number;
  effectif: number;
  nbHeures: number;
  cols: string[];
  sortie: Record<string, number>;
  ops: Record<number, Record<string, Cell>>;
  cloture: boolean;
  /** retouches per worker (total for the day) */
  ret?: Record<number, number>;
  /** per-worker, per-hour SAM override (single non-default poste) */
  opsSam?: Record<number, Record<string, number>>;
  /** per-worker, per-hour poste label override */
  opsPoste?: Record<number, Record<string, string>>;
  /** per-worker, per-hour list of operations when ≥2 in the same hour */
  opsDetail?: Record<number, Record<string, OpDetail[]>>;
  /** manual chain hourly objective override (0/undefined = automatic) */
  objManuel?: number;
};
export type GpaoState = {
  modeles: Modele[];
  chaines: Chaine[];
  journees: Journee[];
  nextOuvId: number;
  tvDayId?: number | null;
};

export const SEUIL_H = 85;
export const SEUIL_B = 60;
export const SEUIL_RET = 5; // retouche alerte si > 5 %

export function uid() {
  return Date.now() + Math.floor(Math.random() * 1000);
}
export function today() {
  return new Date().toISOString().slice(0, 10);
}
export function fmtDate(d: string) {
  try {
    return new Date(d + "T00:00:00").toLocaleDateString("fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return d;
  }
}

export function defaults(): GpaoState {
  const ouvrieres: Ouvriere[] = [
    { id: 1, nom: "Fadila", poste: "Repassage parmenture", sam: 95 },
    { id: 2, nom: "Wided Gourab", poste: "Assemblage empiècement", sam: 75 },
    { id: 3, nom: "Kouloud Lemhadbi", poste: "Nervure empiècement", sam: 85 },
    { id: 4, nom: "Dalanda Gdir", poste: "Assemblage épaul", sam: 96 },
    { id: 5, nom: "Najeh Gourab", poste: "Bou + montage parmenture", sam: 100 },
    { id: 6, nom: "Houriya Ben Selim", poste: "Nervure épaul", sam: 102 },
    { id: 7, nom: "Ameni Ben Selim", poste: "Assemblage manche", sam: 120 },
    { id: 8, nom: "Imen Ktatfi", poste: "Assemblage manche", sam: 220 },
    { id: 9, nom: "Hanen Dridi", poste: "Surpiqure 0.5 manche", sam: 100 },
    { id: 10, nom: "Mariem Dridi", poste: "Montage col", sam: 105 },
    { id: 11, nom: "Najla Trabelsi", poste: "Rabattage col", sam: 107 },
    { id: 12, nom: "Houda Mamar", poste: "Côte bras", sam: 98 },
    { id: 13, nom: "Soumaya Hmidi", poste: "Côte bras", sam: 100 },
    { id: 14, nom: "Hanen Benacer", poste: "Ourlet bas", sam: 65 },
    { id: 15, nom: "Amira Souissi", poste: "Montage patte + biais", sam: 96 },
    { id: 16, nom: "Laila Bouzid", poste: "Montage patte", sam: 98 },
    { id: 17, nom: "Sabeh Baraket", poste: "Rabattage patte", sam: 96 },
    { id: 18, nom: "Fathiya Mhamdi", poste: "Montage plis", sam: 65 },
    { id: 19, nom: "Awatef Ben Selim", poste: "Assemblage poignet", sam: 75 },
    { id: 20, nom: "Salma Bourbia", poste: "Montage poignet", sam: 88 },
    { id: 21, nom: "Nacira Challouf", poste: "Rabattage poignet", sam: 95 },
    { id: 22, nom: "Rihab Belaherech", poste: "Surpiqure 0.5 poignet", sam: 80 },
  ];
  return {
    modeles: [{ id: 101, nom: "Chemise FEMME", ref: "ami", client: "Gérard Darel", sam: 1800, qte: 5000 }],
    chaines: [{ id: 201, nom: "Chaîne 3", chef: "", ouvrieres }],
    journees: [],
    nextOuvId: 23,
    tvDayId: null,
  };
}

/* ═══════════════════ STORE HOOK ═══════════════════
   DB-backed: the page server component loads the shared state from Postgres and
   passes it as `initial`. `mutate` applies an optimistic local update on a
   structural clone; persistence to the DB is triggered by the page handlers via
   the server actions in ./actions.ts (so changes are shared across all users). */
export function useGpaoStore(initial: GpaoState) {
  const [state, setState] = useState<GpaoState>(initial);

  /** Apply an optimistic mutation on a structural clone. */
  const mutate = useCallback((fn: (draft: GpaoState) => void) => {
    setState((prev) => {
      const draft: GpaoState = JSON.parse(JSON.stringify(prev));
      fn(draft);
      return draft;
    });
  }, []);

  return { state, setState, mutate };
}

/* ═══════════════════ LOOKUPS ═══════════════════ */
export const findM = (s: GpaoState, id: number) => s.modeles.find((m) => m.id === id) || null;
export const findC = (s: GpaoState, id: number) => s.chaines.find((c) => c.id === id) || null;
export const findJ = (s: GpaoState, id: number) => s.journees.find((j) => j.id === id) || null;

/* ═══════════════════ FORMULES MÉTIER CONFECTION (v2) ═══════════════════
   Obj/H chaîne     = objManuel, sinon (effectif × 3600) / SAM_total
   Rendement chaîne = (sortie totale × SAM_total) / (effectif × nbHeures × 3600) × 100
   Worker (ouvrière) — supports multi-poste per hour and per-hour SAM overrides:
     earned(h)      = Σ(qte × sam) over the operations done in hour h
     Rend. ouvrière = earned total / (heures travaillées × 3600) × 100
   Retouches : ret = pièces retouchées / jour ; %Ret = ret ÷ production. */
export function chObjH(s: GpaoState, j: Journee) {
  if (j.objManuel && j.objManuel > 0) return j.objManuel;
  const m = findM(s, j.modeleId);
  if (!m || m.sam <= 0) return 0;
  return (j.effectif * 3600) / m.sam;
}
export const chObjJour = (s: GpaoState, j: Journee) => Math.round(chObjH(s, j) * j.nbHeures);
export function chSortieTotal(j: Journee) {
  let t = 0;
  for (const c of j.cols) {
    const v = j.sortie[c];
    if (typeof v === "number") t += v;
  }
  return t;
}
export function chRend(s: GpaoState, j: Journee) {
  const m = findM(s, j.modeleId);
  if (!m) return 0;
  const dispo = j.effectif * j.nbHeures * 3600;
  if (dispo <= 0) return 0;
  return Math.round(((chSortieTotal(j) * m.sam) / dispo) * 100);
}
export function chRetTotal(j: Journee) {
  if (!j.ret) return 0;
  let t = 0;
  for (const k in j.ret) t += +j.ret[k] || 0;
  return t;
}
export const ouvObjH = (o: Ouvriere) => (o.sam > 0 ? 3600 / o.sam : 0);

/** detail operations recorded for a worker in a given hour, if any */
export const cellDetail = (j: Journee, ouvId: number, col: string): OpDetail[] | null =>
  j.opsDetail?.[ouvId]?.[col] ?? null;
/** SAM applied to a worker for a given hour (override or default) */
export function ouvSamAt(j: Journee, o: Ouvriere, col: string) {
  const m = j.opsSam?.[o.id]?.[col];
  return m && m > 0 ? m : o.sam;
}
export function ouvCellQte(j: Journee, ouvId: number, col: string) {
  const dt = cellDetail(j, ouvId, col);
  if (dt && dt.length) return dt.reduce((t, x) => t + (+x.qte || 0), 0);
  const v = (j.ops[ouvId] || {})[col];
  return typeof v === "number" ? v : 0;
}
export function ouvCellEarned(j: Journee, o: Ouvriere, col: string) {
  const dt = cellDetail(j, o.id, col);
  if (dt && dt.length) return dt.reduce((t, x) => t + (+x.qte || 0) * (+x.sam || 0), 0);
  const v = (j.ops[o.id] || {})[col];
  return typeof v === "number" ? v * ouvSamAt(j, o, col) : 0;
}
export function ouvCellWorked(j: Journee, ouvId: number, col: string) {
  const dt = cellDetail(j, ouvId, col);
  if (dt && dt.length) return true;
  return typeof (j.ops[ouvId] || {})[col] === "number";
}
export function ouvProd(j: Journee, ouvId: number) {
  let t = 0;
  for (const c of j.cols) t += ouvCellQte(j, ouvId, c);
  return t;
}
export function ouvWorked(j: Journee, ouvId: number) {
  let n = 0;
  for (const c of j.cols) if (ouvCellWorked(j, ouvId, c)) n++;
  return n;
}
export function ouvHasMulti(j: Journee, o: Ouvriere) {
  if (j.opsDetail?.[o.id]) {
    for (const k in j.opsDetail[o.id]) if ((j.opsDetail[o.id][k] || []).length) return true;
  }
  return !!(j.opsSam?.[o.id] && Object.keys(j.opsSam[o.id]).length);
}
export function ouvEarned(j: Journee, o: Ouvriere) {
  let t = 0;
  for (const c of j.cols) t += ouvCellEarned(j, o, c);
  return t;
}
export function ouvObjAjuste(j: Journee, o: Ouvriere) {
  const worked = ouvWorked(j, o.id) * 3600;
  const earned = ouvEarned(j, o);
  const prod = ouvProd(j, o.id);
  if (earned > 0 && prod > 0) return (prod * worked) / earned;
  return o.sam > 0 ? worked / o.sam : 0;
}
export function ouvRend(j: Journee, o: Ouvriere): number | null {
  const worked = ouvWorked(j, o.id) * 3600;
  if (worked <= 0) return null;
  return Math.round((ouvEarned(j, o) / worked) * 100);
}
export const ouvRet = (j: Journee, ouvId: number) => (j.ret ? +j.ret[ouvId] || 0 : 0);
export function ouvRetPct(j: Journee, ouvId: number): number | null {
  const p = ouvProd(j, ouvId);
  if (p <= 0) return null;
  return Math.round((ouvRet(j, ouvId) / p) * 1000) / 10;
}
export const rcls = (r: number | null) => (r === null ? "" : r >= SEUIL_H ? "c-g" : r >= SEUIL_B ? "c-a" : "c-r");
export const rbarCls = (r: number | null) => (r === null ? "" : r >= SEUIL_H ? "b-g" : r >= SEUIL_B ? "b-a" : "b-r");
export const rcol = (r: number) => (r >= SEUIL_H ? "#19b27b" : r >= SEUIL_B ? "#c4861a" : "#e04545");
export const retcol = (p: number | null) => (p === null ? "#aab" : p <= 2 ? "#19b27b" : p <= SEUIL_RET ? "#c4861a" : "#e04545");
export const findOuvAny = (s: GpaoState, id: number) => {
  for (const c of s.chaines) {
    const o = c.ouvrieres.find((x) => x.id === id);
    if (o) return { ouv: o, chaine: c };
  }
  return null;
};
export function cumulModele(s: GpaoState, mId: number) {
  let t = 0;
  for (const j of s.journees) if (j.modeleId === mId) t += chSortieTotal(j);
  return t;
}
