"use client";

import { useCallback, useState } from "react";
import { cleNom } from "@/lib/domain/atelier";

/* ═══════════════════ TYPES ═══════════════════ */
export type Ouvriere = {
  id: number;
  nom: string;
  poste: string;
  sam: number;
  /** Rattachement au registre du personnel, quand il est connu. */
  personnelId?: number | null;
};
export type Chaine = { id: number; nom: string; chef: string; ouvrieres: Ouvriere[] };
export type Modele = {
  id: number;
  nom: string;
  ref: string;
  client: string;
  sam: number;
  qte: number;
  archive: boolean;
  estimEff: number;
};
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
  /** Effectif figé du jour. Vide = journée antérieure au champ : la lecture
   * retombe sur l'effectif courant de la chaîne (voir `dayOuvrieres`). */
  ouvrieres: Ouvriere[];
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
/** Registre du personnel, tel que l'écran GPAO en a besoin : de quoi proposer
 * un nom et le relier à sa fiche. Le reste de la fiche vit dans /personnel. */
export type Personne = { id: number; matricule: string; nom: string; fonction: string };
/** Opération du catalogue : sert à proposer un libellé et son temps standard. */
export type OperationRef = { id: number; nom: string; sam: number };

export type GpaoState = {
  modeles: Modele[];
  chaines: Chaine[];
  journees: Journee[];
  personnes: Personne[];
  operations: OperationRef[];
  reglages: Reglages;
  nextOuvId: number;
  tvDayId?: number | null;
};

export const SEUIL_H = 85;
export const SEUIL_B = 60;
export const SEUIL_RET = 5; // retouche alerte si > 5 %

/* SEUIL_B ne fait que colorer une cellule ; l'alerte, elle, désigne des
 * personnes nommément et déclenche une conversation en atelier. Les deux
 * chiffres n'ont pas la même portée et n'ont donc pas à être le même. */
export const SEUIL_ALERTE_DEFAUT = 65;
/** Secondes d'affichage par chaîne avant rotation sur l'écran d'atelier. */
export const TV_ROTATION_DEFAUT = 12;

export type Reglages = { seuilAlerte: number; tvRotSec: number };
export const REGLAGES_DEFAUT: Reglages = {
  seuilAlerte: SEUIL_ALERTE_DEFAUT,
  tvRotSec: TV_ROTATION_DEFAUT,
};

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
    modeles: [
      { id: 101, nom: "Chemise FEMME", ref: "ami", client: "Gérard Darel", sam: 1800, qte: 5000, archive: false, estimEff: 0 },
    ],
    personnes: [],
    operations: [],
    reglages: REGLAGES_DEFAUT,
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

/* ═══════════════════ EFFECTIF DE LA JOURNÉE ═══════════════════
   Point de passage unique : toute lecture des ouvrières d'une journée doit
   passer par ici, jamais par `chaine.ouvrieres` directement. C'est ce qui
   garantit qu'une journée close ne se réécrit pas quand la chaîne évolue. */

/** Effectif de la journée : celui qu'elle a figé, sinon celui de sa chaîne. */
export function dayOuvrieres(s: GpaoState, j: Journee): Ouvriere[] {
  if (j.ouvrieres && j.ouvrieres.length) return j.ouvrieres;
  return findC(s, j.chaineId)?.ouvrieres ?? [];
}

export const findDayOuv = (s: GpaoState, j: Journee, id: number) =>
  dayOuvrieres(s, j).find((o) => o.id === id) ?? null;

/** Effectif figé prêt à être modifié : recopie la chaîne au premier passage.
 * Toute écriture sur l'effectif d'une journée commence par là — modifier une
 * journée qui n'a pas encore d'effectif propre ne doit pas toucher la chaîne. */
export function rosterPourEdition(s: GpaoState, j: Journee): Ouvriere[] {
  return dayOuvrieres(s, j).map((o) => ({ ...o }));
}

/** Identifiant d'une ouvrière ajoutée pour cette journée seulement.
 * Négatif, donc sans collision possible avec un `ouvriere.id` (serial). */
export function nextDayOuvId(roster: Ouvriere[]): number {
  let min = 0;
  for (const o of roster) if (o.id < min) min = o.id;
  return min - 1;
}

/** Clé d'identité d'une ouvrière à travers les chaînes et les journées.
 *
 * Le matricule (via la fiche personnel) fait foi ; à défaut, le nom normalisé.
 * C'est cette clé qui permet à l'historique de suivre quelqu'un qui change de
 * chaîne — l'identifiant de ligne, lui, change à chaque réaffectation. */
export const ouvKey = (o: { personnelId?: number | null; nom: string }) =>
  o.personnelId != null ? `P:${o.personnelId}` : `N:${cleNom(o.nom)}`;

/** Version de `ouvKey` qui sait aussi reconnaître une ouvrière non rattachée
 * dont le nom coïncide exactement avec une fiche du registre.
 *
 * Même prudence que `rapprocherParNom` : en cas d'homonyme au registre, on
 * refuse de trancher et on retombe sur la clé par nom. Sans cela, deux
 * personnes différentes finiraient dans le même historique. */
export function makeOuvKey(s: GpaoState) {
  const parNom = new Map<string, number | null>();
  for (const p of s.personnes) {
    const c = cleNom(p.nom);
    if (!c) continue;
    parNom.set(c, parNom.has(c) ? null : p.id);
  }
  return (o: { personnelId?: number | null; nom: string }) => {
    if (o.personnelId != null) return `P:${o.personnelId}`;
    const c = cleNom(o.nom);
    const pid = parNom.get(c);
    return pid != null ? `P:${pid}` : `N:${c}`;
  };
}

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
/** Objectif horaire d'un poste. Ne demande que le SAM : l'historique s'en sert
 * pour une personne agrégée, qui n'a pas d'identifiant de ligne. */
export const ouvObjH = (o: { sam: number }) => (o.sam > 0 ? 3600 / o.sam : 0);

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
/** Une personne telle que l'historique la connaît, toutes chaînes confondues. */
export type OuvriereConnue = { cle: string; nom: string; poste: string; sam: number; matricule: string };

/** Recense tout le monde une seule fois : registre du personnel, effectifs de
 * chaîne et effectifs figés des journées, dédoublonnés par `ouvKey`.
 *
 * Une ouvrière passée de la chaîne 1 à la chaîne 3, ou saisie un seul jour en
 * renfort, apparaît une fois et une seule — c'est la liste que propose l'écran
 * Historique, et la raison pour laquelle il n'est plus lié à une chaîne. */
export function ouvrieresConnues(s: GpaoState): OuvriereConnue[] {
  const cleDe = makeOuvKey(s);
  const par = new Map<string, OuvriereConnue>();
  const add = (nom: string, poste: string, sam: number, cle: string, matricule: string) => {
    if (!nom.trim()) return;
    const vu = par.get(cle);
    if (!vu) {
      par.set(cle, { cle, nom, poste, sam, matricule });
      return;
    }
    // Déjà vue : on ne remplace rien, on comble seulement ce qui manque.
    if (!vu.poste && poste) vu.poste = poste;
    if (!vu.sam && sam) vu.sam = sam;
    if (!vu.matricule && matricule) vu.matricule = matricule;
  };

  for (const p of s.personnes) add(p.nom, p.fonction, 0, `P:${p.id}`, p.matricule);
  for (const c of s.chaines) for (const o of c.ouvrieres) add(o.nom, o.poste, o.sam, cleDe(o), "");
  for (const j of s.journees) for (const o of j.ouvrieres ?? []) add(o.nom, o.poste, o.sam, cleDe(o), "");

  return [...par.values()].sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
}
export function cumulModele(s: GpaoState, mId: number) {
  let t = 0;
  for (const j of s.journees) if (j.modeleId === mId) t += chSortieTotal(j);
  return t;
}

/** Dernière date de production d'un modèle — sert au tri « activité récente ». */
export function derniereDateModele(s: GpaoState, mId: number): string {
  let d = "";
  for (const j of s.journees) if (j.modeleId === mId && j.date > d) d = j.date;
  return d;
}

/* ═══════════════════ ALERTE RENDEMENT ═══════════════════
   Le rendement d'une ouvrière peut être bas pour de bonnes raisons (elle
   dépanne sur un poste qu'elle ne tient pas d'habitude, la machine a lâché).
   L'alerte ne juge pas : elle désigne qui aller voir avant la fin du poste. */

/** Ouvrières de la journée sous le seuil d'alerte, les plus basses d'abord. */
export function alertesRendement(s: GpaoState, j: Journee, seuil: number) {
  return dayOuvrieres(s, j)
    .map((o) => ({ ouv: o, rend: ouvRend(j, o) }))
    .filter((x): x is { ouv: Ouvriere; rend: number } => x.rend !== null && x.rend < seuil)
    .sort((a, b) => a.rend - b.rend);
}

/** Ouvrières dont le taux de retouche dépasse le seuil. */
export function alertesRetouche(s: GpaoState, j: Journee) {
  return dayOuvrieres(s, j)
    .map((o) => ({ ouv: o, pct: ouvRetPct(j, o.id) }))
    .filter((x): x is { ouv: Ouvriere; pct: number } => x.pct !== null && x.pct > SEUIL_RET)
    .sort((a, b) => b.pct - a.pct);
}

/* ═══════════════════ CONTRÔLE SAM DU MODÈLE ═══════════════════
   Ce que l'agent de méthode vérifie avant de clôturer : le temps standard
   saisi sur les postes correspond-il encore au SAM du modèle, et combien de
   minutes de travail standard la journée a-t-elle réellement produites. */
export function bilanSam(s: GpaoState, j: Journee) {
  const roster = dayOuvrieres(s, j);
  let sommeSam = 0;
  let nbOperations = 0;
  let minutesJour = 0;
  for (const o of roster) {
    sommeSam += +o.sam || 0;
    if (o.sam > 0) nbOperations++;
    minutesJour += (ouvProd(j, o.id) * (+o.sam || 0)) / 60;
  }

  let minutesCumul = 0;
  let piecesCumul = 0;
  for (const jj of s.journees) {
    if (jj.modeleId !== j.modeleId) continue;
    for (const o of dayOuvrieres(s, jj)) minutesCumul += (ouvProd(jj, o.id) * (+o.sam || 0)) / 60;
    piecesCumul += chSortieTotal(jj);
  }

  return { sommeSam, nbOperations, minutesJour, minutesCumul, piecesCumul };
}
