"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  deleteFactureAction,
  restoreFacturesAction,
  saveFactureAction,
  setCostLineAction,
} from "@/lib/actions/facturation";

/* ═══════════════════ TYPES ═══════════════════ */
export type Ligne = {
  modele: string;
  desig: string;
  ref: string;
  couleur: string;
  qte: number;
  pu: number;
  mt: number;
};
export type Extra = { label: string; mt: number };
export type FactType = "facture" | "avoir" | "proforma";
export type Facture = {
  id: string;
  type: FactType;
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
/** Per-line cost entry stored in COUTS, keyed by `${id}|${type}` → lines[index] */
export type CostLine = { lieu: "" | "interne" | "faconnier"; fac: string; cout: string };
export type Couts = Record<string, { lines: Record<number, CostLine> }>;

/* ═══════════════════ REFERENCE DATA (plain module, re-exported) ═══════════════════ */
import { CLIENTS_DB, CLIENT_NAMES, FACONNIERS, MOIS_FR } from "./reference";
export { CLIENTS_DB, CLIENT_NAMES, FACONNIERS, MOIS_FR };

/* ═══════════════════ KEYS / FORMATTERS ═══════════════════ */
export const fkeyOf = (id: string, type: string) => `${id}|${type}`;
export const fkey = (f: Facture) => `${f.id}|${f.type}`;
export const nb = (n: number | null | undefined) =>
  n === null || n === undefined || isNaN(n)
    ? "—"
    : n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const nbI = (n: number) => Math.round(n || 0).toLocaleString("fr-FR");
export const fdate = (d: string) => {
  if (!d) return "—";
  const p = d.split("-");
  return `${p[2]}/${p[1]}/${p[0]}`;
};
export const fid = (f: Facture) => (f.type === "avoir" ? "AV-" : f.type === "proforma" ? "PF-" : "") + f.id;
export const caNet = (f: Facture) => (f.type === "avoir" ? -f.total : f.total);
export const typeLabel = (t: FactType) => (t === "avoir" ? "Avoir" : t === "proforma" ? "Proforma" : "Facture");
export const typeTagClass = (t: FactType) => (t === "facture" ? "tag-navy" : t === "avoir" ? "tag-red" : "tag-slate");

/* ═══════════════════ COST-LINE ACCESS ═══════════════════ */
export const getLine = (couts: Couts, f: Facture, i: number): CostLine =>
  couts[fkey(f)]?.lines?.[i] || { lieu: "", fac: "", cout: "" };

export type Marge = {
  statut: "vide" | "partielle" | "complete";
  nRens: number;
  nL: number;
  cout: number | null;
  marge: number | null;
  pct: number | null;
};
export function factureMarge(couts: Couts, f: Facture): Marge {
  let coutTotal = 0;
  let nRens = 0;
  const nL = f.lignes.length;
  f.lignes.forEach((l, i) => {
    const c = getLine(couts, f, i);
    if (c.lieu === "interne") {
      coutTotal += l.qte * l.pu;
      nRens++;
      return;
    }
    const cp = c.cout !== "" ? parseFloat(c.cout) : NaN;
    if (!isNaN(cp) && c.lieu) {
      coutTotal += l.qte * cp;
      nRens++;
    }
  });
  const statut = nL === 0 ? "vide" : nRens === nL ? "complete" : nRens > 0 ? "partielle" : "vide";
  if (nRens === 0) return { statut, nRens, nL, cout: null, marge: null, pct: null };
  const ca = caNet(f);
  const marge = ca - (f.fournitures || 0) - coutTotal;
  return { statut, nRens, nL, cout: coutTotal, marge, pct: ca !== 0 ? (marge / Math.abs(ca)) * 100 : 0 };
}

/* ═══════════════════ CLIENT ANALYSIS (dashboard + rapports) ═══════════════════ */
export function clientAnalysis(all: Facture[], moisFilter?: string | null) {
  const fs = all.filter((f) => f.type === "facture" && (!moisFilter || f.date.substring(5, 7) === moisFilter));
  const avs = all.filter((f) => f.type === "avoir" && (!moisFilter || f.date.substring(5, 7) === moisFilter));
  const by: Record<string, { n: number; pcs: number; ca: number; fourn: number; sumQP: number; sumQ: number }> = {};
  fs.forEach((f) => {
    const k = f.client;
    if (!by[k]) by[k] = { n: 0, pcs: 0, ca: 0, fourn: 0, sumQP: 0, sumQ: 0 };
    by[k].n++;
    by[k].pcs += f.pieces;
    by[k].ca += f.total;
    by[k].fourn += f.fournitures || 0;
    f.lignes.forEach((l) => {
      if (l.qte > 0 && l.pu > 0) {
        by[k].sumQP += l.qte * l.pu;
        by[k].sumQ += l.qte;
      }
    });
  });
  avs.forEach((f) => {
    if (by[f.client]) by[f.client].ca -= f.total;
  });
  const totCA = Object.values(by).reduce((s, v) => s + v.ca, 0) || 1;
  const rows = Object.entries(by)
    .map(([k, v]) => ({
      key: k,
      name: CLIENT_NAMES[k] || k,
      n: v.n,
      pcs: v.pcs,
      ca: v.ca,
      pctCA: (v.ca / totCA) * 100,
      pmp: v.sumQ > 0 ? v.sumQP / v.sumQ : 0,
      caMoyen: v.n > 0 ? v.ca / v.n : 0,
      fournPct: v.ca > 0 ? (v.fourn / v.ca) * 100 : 0,
      fourn: v.fourn,
    }))
    .sort((a, b) => b.ca - a.ca);
  const tN = rows.reduce((s, r) => s + r.n, 0);
  const tQ = rows.reduce((s, r) => s + r.pcs, 0);
  const tCA = rows.reduce((s, r) => s + r.ca, 0);
  const tF = rows.reduce((s, r) => s + r.fourn, 0);
  const tQP = Object.values(by).reduce((s, v) => s + v.sumQP, 0);
  const tQQ = Object.values(by).reduce((s, v) => s + v.sumQ, 0);
  return {
    rows,
    tot: {
      n: tN,
      pcs: tQ,
      ca: tCA,
      pmp: tQQ > 0 ? tQP / tQQ : 0,
      caMoyen: tN > 0 ? tCA / tN : 0,
      fournPct: tCA > 0 ? (tF / tCA) * 100 : 0,
    },
  };
}

/* ═══════════════════ MONTANT EN LETTRES ═══════════════════ */
export function montantEnLettres(n: number): string {
  const u = [
    "", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix", "onze", "douze", "treize",
    "quatorze", "quinze", "seize", "dix-sept", "dix-huit", "dix-neuf",
  ];
  const d = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante", "soixante", "quatre-vingt", "quatre-vingt"];
  function dix(x: number): string {
    if (x < 20) return u[x];
    const d1 = Math.floor(x / 10);
    const u1 = x % 10;
    if (d1 === 7) return d[6] + (u1 === 1 ? " et onze" : u1 > 0 ? "-" + u[10 + u1] : "-dix");
    if (d1 === 9) return d[8] + "-" + u[10 + u1 > 19 ? u1 : 10 + u1];
    return d[d1] + (u1 === 1 && d1 !== 8 ? " et un" : u1 > 0 ? "-" + u[u1] : d1 === 8 ? "s" : "");
  }
  function cent(x: number): string {
    if (x < 100) return dix(x);
    const c = Math.floor(x / 100);
    const r = x % 100;
    if (c === 1) return "cent" + (r > 0 ? " " + dix(r) : "");
    return u[c] + " cent" + (r === 0 ? "s" : " " + dix(r));
  }
  function mille(x: number): string {
    if (x < 1000) return cent(x);
    const m = Math.floor(x / 1000);
    const r = x % 1000;
    return (m === 1 ? "mille" : cent(m) + " mille") + (r > 0 ? " " + cent(r) : "");
  }
  if (!n) return "zéro euro";
  const ent = Math.floor(Math.abs(n));
  const dec = Math.round((Math.abs(n) - ent) * 100);
  let s = mille(ent) + " euro" + (ent > 1 ? "s" : "");
  if (dec > 0) s += " et " + dix(dec) + " centime" + (dec > 1 ? "s" : "");
  return s;
}

/* ═══════════════════ STORE HOOK (Postgres-backed) ═══════════════════ */
export type FactStoreData = { factures: Facture[]; couts: Couts; deleted: Facture[] };

export type FactStore = ReturnType<typeof useFactStore>;

/**
 * Client cache over the Postgres-backed Facturation data. Reads come from the
 * server component (props); writes go through server actions and trigger a
 * `router.refresh()`. Cost-line edits are applied optimistically and persisted
 * with a short debounce so typing stays responsive without a request per key.
 */
export function useFactStore(initial: FactStoreData) {
  const router = useRouter();
  const factures = initial.factures;
  const deleted = initial.deleted;

  // Optimistic copy of cost entries; re-sync when the server sends fresh data
  // after a revalidate (the derive-state-from-props pattern).
  const [couts, setCouts] = useState<Couts>(initial.couts);
  const [prevServerCouts, setPrevServerCouts] = useState(initial.couts);
  if (initial.couts !== prevServerCouts) {
    setPrevServerCouts(initial.couts);
    setCouts(initial.couts);
  }

  // Keep a ref of the latest couts so the debounced persist reads current data.
  const coutsRef = useRef(couts);
  useEffect(() => {
    coutsRef.current = couts;
  }, [couts]);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const all = useCallback(() => factures, [factures]);

  const findFact = useCallback(
    (id: string, type: string) => factures.find((x) => x.id === id && x.type === type) || null,
    [factures],
  );

  const persistLine = useCallback((f: Facture, i: number) => {
    const c = coutsRef.current[fkey(f)]?.lines?.[i] ?? { lieu: "", fac: "", cout: "" };
    void setCostLineAction(f.id, f.type, i, {
      lieu: c.lieu,
      faconnier: c.fac,
      cout: c.cout === "" ? null : Number(c.cout),
    });
  }, []);

  const setLine = useCallback(
    (f: Facture, i: number, field: keyof CostLine, val: string) => {
      const k = fkey(f);
      setCouts((prev) => {
        const lines = { ...(prev[k]?.lines ?? {}) };
        lines[i] = { ...(lines[i] ?? { lieu: "", fac: "", cout: "" }), [field]: val };
        return { ...prev, [k]: { lines } };
      });
      const tk = `${k}|${i}`;
      clearTimeout(timers.current[tk]);
      timers.current[tk] = setTimeout(() => persistLine(f, i), 350);
    },
    [persistLine],
  );

  const saveFacture = useCallback(
    async (f: Facture): Promise<boolean> => {
      const res = await saveFactureAction(f);
      if (res.ok) router.refresh();
      return res.ok ? res.existed : false;
    },
    [router],
  );

  const deleteFacture = useCallback(
    async (id: string, type: string) => {
      const res = await deleteFactureAction(id, type);
      if (res.ok) router.refresh();
    },
    [router],
  );

  const restoreDeleted = useCallback(async () => {
    const res = await restoreFacturesAction();
    if (res.ok) router.refresh();
  }, [router]);

  const exportData = useCallback(() => {
    const blob = new Blob(
      [JSON.stringify({ factures, couts, version: 4, exported: new Date().toISOString() }, null, 2)],
      { type: "application/json" },
    );
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "dbs_sauvegarde_2026_" + new Date().toISOString().split("T")[0] + ".json";
    a.click();
  }, [factures, couts]);

  return {
    ready: true,
    couts,
    deleted,
    all,
    findFact,
    setLine,
    saveFacture,
    deleteFacture,
    restoreDeleted,
    exportData,
  };
}
