"use client";

import { useMemo, useState } from "react";
import {
  type GpaoState,
  SEUIL_B,
  SEUIL_H,
  findC,
  findM,
  findOuvAny,
  ouvObjAjuste,
  ouvObjH,
  ouvProd,
  ouvRend,
  ouvRet,
  ouvRetPct,
  ouvWorked,
  rcol,
  retcol,
  today,
} from "./store";

type HRow = {
  date: string;
  chaine: string;
  modele: string;
  prod: number;
  obj: number;
  rend: number | null;
  heures: number;
  ret: number;
  retPct: number | null;
  jId: number;
};

function computeHisto(state: GpaoState, ouvId: number, from: string, to: string) {
  const info = findOuvAny(state, ouvId);
  if (!info) return null;
  const rows: HRow[] = [];
  const jours = state.journees.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (const j of jours) {
    if (j.date < from || j.date > to) continue;
    const c = findC(state, j.chaineId);
    const o = c?.ouvrieres.find((x) => x.id === ouvId);
    if (!c || !o) continue;
    const worked = ouvWorked(j, ouvId);
    const hasData = worked > 0 || (j.ops[ouvId] && Object.keys(j.ops[ouvId]).length > 0) || ouvRet(j, ouvId) > 0;
    if (!hasData) continue;
    const m = findM(state, j.modeleId);
    rows.push({
      date: j.date,
      chaine: c.nom,
      modele: m ? `${m.nom} (${m.ref})` : "?",
      prod: ouvProd(j, ouvId),
      obj: Math.round(ouvObjAjuste(j, o)),
      rend: ouvRend(j, o),
      heures: worked,
      ret: ouvRet(j, ouvId),
      retPct: ouvRetPct(j, ouvId),
      jId: j.id,
    });
  }
  return { ouv: info.ouv, chaine: info.chaine, from, to, rows };
}

export function HistoView({ state, onOpenDay }: { state: GpaoState; onOpenDay: (id: number) => void }) {
  const firstOuv = state.chaines[0]?.ouvrieres[0]?.id ?? 0;
  const [ouvId, setOuvId] = useState<number>(firstOuv);
  const defaultFrom = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 30);
    return d.toISOString().slice(0, 10);
  }, []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today());
  const [query, setQuery] = useState<{ ouvId: number; from: string; to: string } | null>(null);

  const data = query ? computeHisto(state, query.ouvId, query.from, query.to) : null;

  const print = () => {
    if (!data || !data.rows.length) return;
    printHisto(data);
  };

  return (
    <div className="page">
      <h2 className="sec">🕓 Historique de rendement par ouvrière</h2>
      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)" }}>
        <div className="fld" style={{ margin: 0, minWidth: 230 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Ouvrière</label>
          <br />
          <select
            value={ouvId}
            onChange={(e) => setOuvId(+e.target.value)}
            style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8, minWidth: 230 }}
          >
            {state.chaines.map((c) => (
              <optgroup key={c.id} label={c.nom}>
                {c.ouvrieres.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.nom} — {o.poste}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Du</label>
          <br />
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Au</label>
          <br />
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }} />
        </div>
        <div className="dright">
          <button className="btn primary sm" onClick={() => setQuery({ ouvId, from, to })}>
            Afficher
          </button>
          <button className="btn amber sm" onClick={print} disabled={!data || !data.rows.length}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {!query ? (
        <div className="empty">Sélectionnez une ouvrière et une période, puis cliquez sur Afficher.</div>
      ) : !data ? (
        <div className="empty">Ouvrière introuvable.</div>
      ) : !data.rows.length ? (
        <div className="empty">
          Aucune donnée pour <b>{data.ouv.nom}</b> sur cette période.
        </div>
      ) : (
        <HistoContent data={data} onOpenDay={onOpenDay} />
      )}
    </div>
  );
}

function HistoContent({ data, onOpenDay }: { data: NonNullable<ReturnType<typeof computeHisto>>; onOpenDay: (id: number) => void }) {
  let tProd = 0;
  let tRet = 0;
  let sumR = 0;
  let nR = 0;
  let tH = 0;
  for (const row of data.rows) {
    tProd += row.prod;
    tRet += row.ret;
    tH += row.heures;
    if (row.rend !== null) {
      sumR += row.rend;
      nR++;
    }
  }
  const avgR = nR ? Math.round(sumR / nR) : 0;
  const retPctG = tProd > 0 ? Math.round((tRet / tProd) * 1000) / 10 : 0;

  return (
    <>
      <div className="kpis">
        <div className="kpi">
          <div className="l">Journées</div>
          <div className="v">{data.rows.length}</div>
          <div className="s">{tH} heures travaillées</div>
        </div>
        <div className="kpi">
          <div className="l">Production totale</div>
          <div className="v" style={{ color: "var(--blue)" }}>
            {tProd}
          </div>
          <div className="s">pièces</div>
        </div>
        <div className={`kpi ${avgR >= SEUIL_H ? "g" : avgR >= SEUIL_B ? "a" : "r"}`}>
          <div className="l">Rendement moyen</div>
          <div className="v" style={{ color: rcol(avgR) }}>
            {avgR}%
          </div>
          <div className="s">sur la période</div>
        </div>
        <div className="kpi">
          <div className="l">Retouches</div>
          <div className="v" style={{ color: retcol(retPctG) }}>
            {tRet}
          </div>
          <div className="s">{retPctG}% de la production</div>
        </div>
      </div>

      <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 13, padding: 16, marginBottom: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--navy)", marginBottom: 10 }}>
          Évolution du rendement — {data.ouv.nom}
        </div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 6, height: 120, overflowX: "auto", paddingBottom: 4 }}>
          {data.rows.map((row) => {
            const rr = row.rend || 0;
            return (
              <div key={row.jId} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 3, minWidth: 42 }}>
                <div style={{ fontSize: 10, fontWeight: 800, color: rcol(rr) }}>{rr}%</div>
                <div style={{ width: 22, borderRadius: "4px 4px 0 0", background: rcol(rr), height: Math.max(Math.min(rr, 120) * 0.75, 3) }} />
                <div style={{ fontSize: 9, color: "var(--muted)" }}>{row.date.slice(5)}</div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="twrap">
        <table>
          <thead>
            <tr>
              <th style={{ textAlign: "left" }}>Date</th>
              <th>Chaîne</th>
              <th style={{ textAlign: "left" }}>Modèle</th>
              <th>Heures</th>
              <th>Production</th>
              <th>Objectif</th>
              <th>Rendement</th>
              <th>Ret.</th>
              <th>% Ret.</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {data.rows.map((row) => (
              <tr key={row.jId}>
                <td className="lft">{row.date}</td>
                <td>{row.chaine}</td>
                <td className="lft">{row.modele}</td>
                <td>{row.heures}</td>
                <td style={{ fontWeight: 800 }}>{row.prod}</td>
                <td style={{ color: "var(--muted)" }}>{row.obj}</td>
                <td>
                  <span className="rendpct" style={{ color: rcol(row.rend || 0) }}>
                    {row.rend === null ? "—" : `${row.rend}%`}
                  </span>
                </td>
                <td>{row.ret}</td>
                <td style={{ color: retcol(row.retPct), fontWeight: 700 }}>{row.retPct === null ? "—" : `${row.retPct}%`}</td>
                <td>
                  <button className="btn sm" onClick={() => onOpenDay(row.jId)}>
                    Ouvrir
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

function printHisto(data: NonNullable<ReturnType<typeof computeHisto>>) {
  let tProd = 0;
  let tRet = 0;
  let sumR = 0;
  let nR = 0;
  let tH = 0;
  for (const row of data.rows) {
    tProd += row.prod;
    tRet += row.ret;
    tH += row.heures;
    if (row.rend !== null) {
      sumR += row.rend;
      nR++;
    }
  }
  const avgR = nR ? Math.round(sumR / nR) : 0;
  const retPctG = tProd > 0 ? Math.round((tRet / tProd) * 1000) / 10 : 0;
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let h = `<h1>HISTORIQUE DE RENDEMENT — OUVRIÈRE</h1><div class="psub">DBS Fashion — Agent de méthode</div>`;
  h += `<div class="pmeta"><span><b>Ouvrière :</b> ${esc(data.ouv.nom)}</span><span><b>Poste :</b> ${esc(
    data.ouv.poste,
  )}</span><span><b>SAM :</b> ${data.ouv.sam} s (Obj/H ${ouvObjH(data.ouv).toFixed(1)})</span><span><b>Chaîne :</b> ${esc(
    data.chaine.nom,
  )}</span><span><b>Période :</b> du ${data.from} au ${data.to}</span></div>`;
  h += `<table><thead><tr><th>Journées</th><th>Heures travaillées</th><th>Production totale</th><th>Rendement moyen</th><th>Retouches</th><th>% Retouche</th></tr></thead><tbody><tr><td>${
    data.rows.length
  }</td><td>${tH}</td><td><b>${tProd}</b></td><td style="font-size:13px"><b>${avgR} %</b></td><td>${tRet}</td><td>${retPctG} %</td></tr></tbody></table>`;
  h += `<table><thead><tr><th>Date</th><th>Chaîne</th><th>Modèle</th><th>Heures</th><th>Production</th><th>Objectif ajusté</th><th>Rendement %</th><th>Retouches</th><th>% Ret.</th></tr></thead><tbody>`;
  for (const r of data.rows) {
    h += `<tr><td>${r.date}</td><td>${esc(r.chaine)}</td><td>${esc(r.modele)}</td><td>${r.heures}</td><td><b>${
      r.prod
    }</b></td><td>${r.obj}</td><td>${r.rend === null ? "—" : r.rend + "%"}</td><td>${r.ret}</td><td>${
      r.retPct === null ? "—" : r.retPct + "%"
    }</td></tr>`;
  }
  h += `</tbody></table><div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString(
    "fr-FR",
  )} — GPAO DBS Fashion</div>`;

  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Historique ouvrière</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:11px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}
    .psub{text-align:center;font-size:11px;color:#444;margin-bottom:10px}
    .pmeta{display:flex;justify-content:space-between;border:1.5px solid #000;padding:6px 12px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;gap:8px}
    table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
    th,td{border:1px solid #555;padding:3px 4px;text-align:center}th{background:#e6e6e6;font-size:9px}
    @page{size:A4 landscape;margin:8mm}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
