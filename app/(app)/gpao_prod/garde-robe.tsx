"use client";

import { useMemo } from "react";
import { type GpaoState, gardeRobe } from "./store";

/* Garde-robe (point 3) : la liste des modèles/références déjà produits, avec
 * leur SAM RÉEL = minutes réellement produites ÷ pièces sorties, sur toutes les
 * journées du modèle. Permet de voir, à la fin d'un modèle, combien il coûte
 * réellement en minutes/pièce, et de le comparer au SAM théorique de la fiche. */
export function GardeRobeView({ state }: { state: GpaoState }) {
  const rows = useMemo(() => gardeRobe(state), [state]);

  const imprimer = () => printGardeRobe(rows);

  return (
    <div className="page">
      <h2 className="sec">👗 Garde-robe — modèles produits &amp; SAM réel</h2>
      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)" }}>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          {rows.length} modèle(s) déjà produit(s). Le <b>SAM réel</b> = minutes réellement produites ÷ pièces sorties.
        </div>
        <div className="dright">
          <button className="btn amber sm" disabled={!rows.length} onClick={imprimer}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {!rows.length ? (
        <div className="empty">Aucun modèle n&apos;a encore de production enregistrée.</div>
      ) : (
        <table className="tbl" style={{ marginTop: 10 }}>
          <thead>
            <tr>
              <th style={{ width: 30 }}>#</th>
              <th style={{ textAlign: "left" }}>Modèle</th>
              <th style={{ textAlign: "left" }}>Référence</th>
              <th style={{ textAlign: "left" }}>Client</th>
              <th>Jours</th>
              <th>Minutes produites</th>
              <th>Pièces</th>
              <th>SAM théo.</th>
              <th>SAM réel</th>
              <th>Écart</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const ecart = r.samReelSec !== null && r.samTheo > 0 ? Math.round(r.samReelSec - r.samTheo) : null;
              const couleur = ecart === null ? "var(--muted)" : ecart > 0 ? "#b42318" : "#067647";
              return (
                <tr key={r.modeleId}>
                  <td>{i + 1}</td>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>{r.nom}</td>
                  <td style={{ textAlign: "left" }}>{r.ref || "—"}</td>
                  <td style={{ textAlign: "left" }}>{r.client || "—"}</td>
                  <td>{r.jours}</td>
                  <td>{r.minutesCumul.toFixed(0)} min</td>
                  <td>
                    <b>{r.piecesCumul}</b>
                  </td>
                  <td>{r.samTheo ? `${r.samTheo} s` : "—"}</td>
                  <td style={{ fontWeight: 800 }}>
                    {r.samReelSec === null ? "—" : `${r.samReelSec.toFixed(0)} s`}
                    {r.samReelMin !== null && (
                      <span style={{ color: "var(--muted)", fontWeight: 400 }}> ({r.samReelMin.toFixed(2)} min)</span>
                    )}
                  </td>
                  <td style={{ fontWeight: 800, color: couleur }}>
                    {ecart === null ? "—" : `${ecart > 0 ? "+" : ""}${ecart} s`}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

function printGardeRobe(rows: ReturnType<typeof gardeRobe>) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const body = rows
    .map((r, i) => {
      const ecart = r.samReelSec !== null && r.samTheo > 0 ? Math.round(r.samReelSec - r.samTheo) : null;
      return `<tr><td>${i + 1}</td><td style="text-align:left">${esc(r.nom)}</td><td style="text-align:left">${esc(
        r.ref,
      )}</td><td style="text-align:left">${esc(r.client)}</td><td>${r.jours}</td><td>${r.minutesCumul.toFixed(
        0,
      )}</td><td><b>${r.piecesCumul}</b></td><td>${r.samTheo || "—"}</td><td><b>${
        r.samReelSec === null ? "—" : r.samReelSec.toFixed(0) + " s"
      }</b></td><td>${ecart === null ? "—" : (ecart > 0 ? "+" : "") + ecart + " s"}</td></tr>`;
    })
    .join("");
  const h = `<h1>GARDE-ROBE — MODÈLES PRODUITS &amp; SAM RÉEL</h1>
    <div class="psub">SAM réel = minutes produites ÷ pièces · ${rows.length} modèle(s)</div>
    <table><thead><tr><th>#</th><th style="text-align:left">Modèle</th><th style="text-align:left">Réf.</th><th style="text-align:left">Client</th><th>Jours</th><th>Min. prod.</th><th>Pièces</th><th>SAM théo (s)</th><th>SAM réel (s)</th><th>Écart</th></tr></thead><tbody>${body}</tbody></table>
    <div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString("fr-FR")} — GPAO DBS Fashion</div>`;
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Garde-robe</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:11px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}
    .psub{text-align:center;font-size:11px;color:#444;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:10px}
    th,td{border:1px solid #555;padding:3px 5px;text-align:center}th{background:#e6e6e6}
    @page{size:A4 landscape;margin:8mm}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
