"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { appliquerIdentites, fusionnerFichesPersonnel, verifierIdentites } from "./actions";
import type { BilanIdentites } from "@/lib/services/identite-ouvrieres";
import {
  type GpaoState,
  SEUIL_B,
  SEUIL_H,
  findC,
  findM,
  joursParPersonne,
  ouvObjAjuste,
  ouvObjH,
  ouvrieresConnues,
  rcol,
  retcol,
  today,
} from "./store";
import { periodeGenerale, synthese, PERIODE_GENERALE_JOURS } from "@/lib/domain/rendement-personne";

type HRow = {
  date: string;
  /** Secondes standard gagnées : sert à la moyenne exacte de la période. */
  gagne: number;
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

/* L'historique suit une PERSONNE, pas une ligne de chaîne.
 *
 * Tout passe par la règle unique (joursParPersonne → lib/domain/
 * rendement-personne) : même identité et même calcul que l'écran TV, la carte
 * QR et le portail QR. Un jour = exactement le rendement affiché à la TV ; une
 * période = Σ minutes gagnées ÷ Σ heures, arrondi une seule fois. */
function computeHisto(state: GpaoState, cle: string, from: string, to: string) {
  const info = ouvrieresConnues(state).find((x) => x.cle === cle);
  if (!info) return null;
  const jours = (joursParPersonne(state).get(cle) ?? []).filter((j) => j.date >= from && j.date <= to);

  const rows: HRow[] = jours.map((jp) => {
    const j = jp.meta;
    const c = findC(state, j.chaineId);
    const m = findM(state, j.modeleId);
    return {
      date: jp.date,
      gagne: jp.gagne,
      chaine: c?.nom ?? "?",
      modele: m ? `${m.nom} (${m.ref})` : "?",
      prod: jp.pieces,
      obj: Math.round(jp.lignes.reduce((t, o) => t + ouvObjAjuste(j, o), 0)),
      rend: jp.rendement,
      heures: jp.heures,
      ret: jp.retouches,
      retPct: jp.pieces > 0 ? Math.round((jp.retouches / jp.pieces) * 1000) / 10 : null,
      jId: j.id,
    };
  });
  const bilan = synthese(jours);
  return { ouv: info, from, to, rows, bilan };
}

/* Recherche transversale : toutes les personnes dont le rendement de la
 * période tombe dans [min, max]. Même règle et même moyenne que l'historique
 * et le QR : une personne = une ligne, un jour compté une fois. */
function computeSeuil(state: GpaoState, from: string, to: string, min: number, max: number) {
  const connues = new Map(ouvrieresConnues(state).map((o) => [o.cle, o]));
  const rows = [...joursParPersonne(state).entries()]
    .map(([cle, jours]) => {
      const b = synthese(jours, { from, to });
      const info = connues.get(cle);
      const dernier = jours.filter((j) => j.date >= from && j.date <= to).at(-1)?.lignes[0];
      return {
        nom: info?.nom ?? dernier?.nom ?? cle,
        matricule: info?.matricule ?? "",
        poste: info?.poste || dernier?.poste || "",
        worked: b.heures,
        jours: b.jours,
        prod: b.pieces,
        rendMoyen: b.rendement,
      };
    })
    .filter((e): e is typeof e & { rendMoyen: number } => e.rendMoyen !== null)
    .filter((e) => e.rendMoyen >= min && e.rendMoyen <= max)
    .sort((a, b) => b.rendMoyen - a.rendMoyen || a.nom.localeCompare(b.nom, "fr"));
  return { from, to, min, max, rows };
}

export function HistoView({ state, onOpenDay }: { state: GpaoState; onOpenDay: (id: number) => void }) {
  const connues = useMemo(() => ouvrieresConnues(state), [state]);
  const [cle, setCle] = useState<string>(() => connues[0]?.cle ?? "");
  // Même période par défaut que la carte et le portail QR (30 derniers jours).
  const defaultFrom = useMemo(() => periodeGenerale(today()).from, []);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(today());
  const [query, setQuery] = useState<{ cle: string; from: string; to: string } | null>(null);

  // Recherche par seuil de rendement (point 2).
  const [seuilMin, setSeuilMin] = useState("80");
  const [seuilMax, setSeuilMax] = useState("200");
  const [seuilQuery, setSeuilQuery] = useState<{ from: string; to: string; min: number; max: number } | null>(null);
  const seuilData = seuilQuery ? computeSeuil(state, seuilQuery.from, seuilQuery.to, seuilQuery.min, seuilQuery.max) : null;

  const data = query ? computeHisto(state, query.cle, query.from, query.to) : null;

  const print = () => {
    if (!data || !data.rows.length) return;
    printHisto(data);
  };

  return (
    <div className="page">
      <PanneauIdentites />
      <h2 className="sec">🕓 Historique de rendement par ouvrière</h2>
      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)" }}>
        <div className="fld" style={{ margin: 0, minWidth: 230 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Ouvrière</label>
          <br />
          <select
            value={cle}
            onChange={(e) => setCle(e.target.value)}
            style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8, minWidth: 230 }}
          >
            {connues.map((o) => (
              <option key={o.cle} value={o.cle}>
                {o.nom}
                {o.matricule ? ` [${o.matricule}]` : ""}
                {o.poste ? ` — ${o.poste}` : ""}
              </option>
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
          <button className="btn primary sm" disabled={!cle} onClick={() => setQuery({ cle, from, to })}>
            Afficher
          </button>
          <button className="btn amber sm" onClick={print} disabled={!data || !data.rows.length}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {!query ? (
        <div className="empty">
          Sélectionnez une ouvrière et une période, puis cliquez sur Afficher. Par défaut : les {PERIODE_GENERALE_JOURS}{" "}
          derniers jours — la même période que le rendement de sa carte et de son portail QR.
        </div>
      ) : !data ? (
        <div className="empty">Ouvrière introuvable.</div>
      ) : !data.rows.length ? (
        <div className="empty">
          Aucune donnée pour <b>{data.ouv.nom}</b> sur cette période.
        </div>
      ) : (
        <HistoContent data={data} onOpenDay={onOpenDay} />
      )}

      {/* ─── Recherche par seuil de rendement (point 2) ─── */}
      <h2 className="sec" style={{ marginTop: 24 }}>
        🏆 Ouvrières par seuil de rendement
      </h2>
      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)" }}>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Rendement min %</label>
          <br />
          <input type="number" value={seuilMin} onChange={(e) => setSeuilMin(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8, width: 110 }} />
        </div>
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Rendement max %</label>
          <br />
          <input type="number" value={seuilMax} onChange={(e) => setSeuilMax(e.target.value)} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8, width: 110 }} />
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
          <button
            className="btn primary sm"
            onClick={() =>
              setSeuilQuery({ from, to, min: Number(seuilMin) || 0, max: Number(seuilMax) || 9999 })
            }
          >
            Rechercher
          </button>
          <button
            className="btn amber sm"
            disabled={!seuilData || !seuilData.rows.length}
            onClick={() => seuilData && printSeuil(seuilData)}
          >
            🖨 Imprimer la liste
          </button>
        </div>
      </div>

      {!seuilQuery ? (
        <div className="empty">Choisissez un intervalle de rendement (ex. entre 80 et 200) et une période, puis Rechercher.</div>
      ) : !seuilData || !seuilData.rows.length ? (
        <div className="empty">Aucune ouvrière dans cet intervalle sur la période.</div>
      ) : (
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th style={{ textAlign: "left" }}>Ouvrière</th>
              <th style={{ textAlign: "left" }}>Poste</th>
              <th>Jours</th>
              <th>Heures</th>
              <th>Pièces</th>
              <th>Rend. moyen</th>
            </tr>
          </thead>
          <tbody>
            {seuilData.rows.map((r, i) => (
              <tr key={i}>
                <td>{i + 1}</td>
                <td style={{ textAlign: "left" }}>
                  {r.nom}
                  {r.matricule ? ` [${r.matricule}]` : ""}
                </td>
                <td style={{ textAlign: "left" }}>{r.poste}</td>
                <td>{r.jours}</td>
                <td>{r.worked.toFixed(1)}</td>
                <td>{r.prod}</td>
                <td style={{ fontWeight: 800, color: rcol(r.rendMoyen) }}>{r.rendMoyen}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function printSeuil(data: NonNullable<ReturnType<typeof computeSeuil>>) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const rows = data.rows
    .map(
      (r, i) =>
        `<tr><td>${i + 1}</td><td style="text-align:left">${esc(r.nom)}${
          r.matricule ? ` [${esc(r.matricule)}]` : ""
        }</td><td style="text-align:left">${esc(r.poste)}</td><td>${r.jours}</td><td>${r.worked.toFixed(
          1,
        )}</td><td>${r.prod}</td><td><b>${r.rendMoyen}%</b></td></tr>`,
    )
    .join("");
  const h = `<h1>OUVRIÈRES PAR SEUIL DE RENDEMENT</h1>
    <div class="psub">Rendement moyen entre ${data.min}% et ${data.max}% · du ${data.from} au ${data.to} · ${data.rows.length} ouvrière(s)</div>
    <table><thead><tr><th>#</th><th style="text-align:left">Ouvrière</th><th style="text-align:left">Poste</th><th>Jours</th><th>Heures</th><th>Pièces</th><th>Rend. moyen</th></tr></thead><tbody>${rows}</tbody></table>
    <div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString("fr-FR")} — GPAO DBS Fashion</div>`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Ouvrières par seuil</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:12px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}
    .psub{text-align:center;font-size:11px;color:#444;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:11px}
    th,td{border:1px solid #555;padding:4px 6px;text-align:center}th{background:#e6e6e6}
    @page{size:A4 portrait;margin:10mm}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}

function HistoContent({ data, onOpenDay }: { data: NonNullable<ReturnType<typeof computeHisto>>; onOpenDay: (id: number) => void }) {
  // Même calcul que le QR : Σ gagné ÷ Σ heures sur la période, arrondi une fois.
  const tProd = data.bilan.pieces;
  const tRet = data.bilan.retouches;
  const tH = data.bilan.heures;
  const avgR = data.bilan.rendement ?? 0;
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
  // Identique à l'écran et au QR (moyenne pondérée par les heures).
  const tProd = data.bilan.pieces;
  const tRet = data.bilan.retouches;
  const tH = data.bilan.heures;
  const avgR = data.bilan.rendement ?? 0;
  const retPctG = tProd > 0 ? Math.round((tRet / tProd) * 1000) / 10 : 0;
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  let h = `<h1>HISTORIQUE DE RENDEMENT — OUVRIÈRE</h1><div class="psub">DBS Fashion — Agent de méthode</div>`;
  h += `<div class="pmeta"><span><b>Ouvrière :</b> ${esc(data.ouv.nom)}</span><span><b>Matricule :</b> ${esc(
    data.ouv.matricule || "—",
  )}</span><span><b>Poste :</b> ${esc(data.ouv.poste || "—")}</span><span><b>SAM :</b> ${
    data.ouv.sam || 0
  } s (Obj/H ${ouvObjH(data.ouv).toFixed(1)})</span><span><b>Chaîne :</b> toutes chaînes</span><span><b>Période :</b> du ${
    data.from
  } au ${data.to}</span></div>`;
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

/* ─────────── identités : une personne = une fiche ───────────
 *
 * Vérifier = bilan sans rien écrire. Fusionner = fiches en double réunies,
 * journées reliées à la bonne fiche, journées anciennes figées. Après quoi TV,
 * historique, classement et QR donnent le même chiffre. Admin + resp. */
function PanneauIdentites() {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [bilan, setBilan] = useState<{ b: BilanIdentites; applique: boolean } | null>(null);

  const verifier = () =>
    start(async () => {
      const r = await verifierIdentites();
      if (!r.ok) return void toast.error(r.error);
      setBilan({ b: r.bilan, applique: false });
    });
  const appliquer = () =>
    start(async () => {
      if (!confirm("Fusionner les fiches en double et relier toutes les journées à la bonne fiche ?")) return;
      const r = await appliquerIdentites();
      if (!r.ok) return void toast.error(r.error);
      setBilan({ b: r.bilan, applique: true });
      toast.success("Identités réparées — tous les écrans affichent désormais le même rendement");
      router.refresh();
    });

  const fusionner = (gardeId: number, autres: number[], nom: string, matricule: string) =>
    start(async () => {
      if (!confirm(`Fusionner toutes les fiches « ${nom} » dans la fiche ${matricule} ?`)) return;
      const r = await fusionnerFichesPersonnel(gardeId, autres);
      if (!r.ok) return void toast.error(r.error);
      setBilan({ b: r.bilan, applique: true });
      toast.success(`${nom} : fiches fusionnées dans ${matricule}`);
      router.refresh();
    });

  const b = bilan?.b;
  const aFaire =
    !!b &&
    (b.fichesFusionnees.length > 0 || b.lignesChaineReliees > 0 || b.journeesCorrigees > 0 || b.journeesFigees > 0 || b.homonymes.length > 0);

  return (
    <div style={{ background: "#fff", border: "1px solid var(--border)", borderRadius: 13, padding: 14, marginBottom: 16 }}>
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 10 }}>
        <b style={{ fontSize: 14 }}>🧬 Identités des ouvrières</b>
        <span style={{ fontSize: 12, color: "var(--muted)" }}>
          Une personne = une fiche : même rendement à la TV, dans l&apos;historique, le classement et le QR.
        </span>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="btn sm" disabled={pending} onClick={verifier}>
            {pending ? "…" : "Vérifier"}
          </button>
          <button className="btn primary sm" disabled={pending || (!!bilan && !bilan.applique && !aFaire)} onClick={appliquer}>
            Fusionner et réparer
          </button>
        </div>
      </div>

      {b && (
        <div style={{ marginTop: 10, fontSize: 12.5 }}>
          <div style={{ fontWeight: 700, marginBottom: 6, color: bilan!.applique ? "#0d7a52" : "var(--navy)" }}>
            {bilan!.applique
              ? aFaire
                ? "✅ Réparation appliquée :"
                : "✅ Réparation appliquée — toutes les identités sont cohérentes."
              : aFaire
                ? "À corriger :"
                : "✅ Rien à corriger — toutes les identités sont cohérentes."}
          </div>
          <ul style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            {b.fichesFusionnees.length > 0 && (
              <li>
                <b>{b.fichesFusionnees.length}</b> personne(s) en double fusionnée(s) :{" "}
                {b.fichesFusionnees
                  .map((f) => `${f.garde.nom} [${f.garde.matricule}] ← ${f.absorbees.map((a) => a.matricule).join(", ")}`)
                  .join(" · ")}
              </li>
            )}
            {b.journeesCorrigees > 0 && (
              <li>
                <b>{b.journeesCorrigees}</b> journée(s) reliée(s) à la bonne fiche ({b.lignesJourReliees} ligne(s))
              </li>
            )}
            {b.journeesFigees > 0 && (
              <li>
                <b>{b.journeesFigees}</b> journée(s) ancienne(s) dont l&apos;équipe est désormais mémorisée
              </li>
            )}
            {b.lignesChaineReliees > 0 && (
              <li>
                <b>{b.lignesChaineReliees}</b> ouvrière(s) de chaîne reliée(s) à leur fiche
              </li>
            )}
            {b.homonymes.length > 0 && (
              <li style={{ color: "#9a6c0a" }}>
                ⚠ Même nom sous plusieurs vrais matricules — s&apos;il s&apos;agit de la même personne, choisissez la
                fiche à garder :
                {b.homonymes.map((h) => (
                  <div key={h.nom} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, margin: "4px 0 2px", color: "var(--txt)" }}>
                    <b>{h.nom}</b>
                    {h.fiches.map((f) => (
                      <button
                        key={f.id}
                        className="btn sm"
                        disabled={pending}
                        title={`Garder la fiche ${f.matricule} et y fusionner ${h.fiches.filter((x) => x.id !== f.id).map((x) => x.matricule).join(", ")}`}
                        onClick={() => fusionner(f.id, h.fiches.filter((x) => x.id !== f.id).map((x) => x.id), h.nom, f.matricule)}
                      >
                        Garder [{f.matricule}] · {f.journees} j
                      </button>
                    ))}
                  </div>
                ))}
              </li>
            )}
            {b.doublonsJour.length > 0 && (
              <li style={{ color: "#9a6c0a" }}>
                ⚠ Même personne sur deux lignes d&apos;une journée ({b.doublonsJour.length}) :{" "}
                {b.doublonsJour.slice(0, 8).map((d) => `${d.nom} le ${d.date}`).join(" · ")}
                {b.doublonsJour.length > 8 ? " …" : ""}
              </li>
            )}
            {b.sansFiche.length > 0 && (
              <li style={{ color: "var(--muted)" }}>
                Sans fiche au registre (pas de QR possible) : {b.sansFiche.slice(0, 12).join(", ")}
                {b.sansFiche.length > 12 ? ` … (+${b.sansFiche.length - 12})` : ""} — à relier dans Personnel
              </li>
            )}
            {b.saisiesOrphelines > 0 && (
              <li style={{ color: "var(--muted)" }}>
                {b.saisiesOrphelines} saisie(s) d&apos;une ouvrière supprimée depuis — conservées, sans nom
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
