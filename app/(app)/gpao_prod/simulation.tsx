"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { SimulationData } from "@/lib/services/gpao";
import { rapprocherModelesCommandes, simuler } from "./actions";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const eur2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

/* Simulation (nouvelle fonctionnalité) : à partir des journées GPAO, voir les
 * pièces produites + références, et le CA produit = pièces × prix de vente de
 * la commande liée — par jour et sur une période. Aucune écriture : c'est une
 * lecture/analyse. Un modèle non relié à une commande compte ses pièces mais
 * pas de CA (signalé). */
export function SimulationView() {
  const [pending, start] = useTransition();
  const moisDefaut = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${moisDefaut}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [data, setData] = useState<SimulationData | null>(null);
  const [groupe, setGroupe] = useState<"jour" | "modele">("jour");

  const lancer = () =>
    start(async () => {
      const r = await simuler(from, to);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setData(r.data);
    });

  const rapprocher = () =>
    start(async () => {
      const r = await rapprocherModelesCommandes();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        `${r.lies} modèle(s) relié(s)` +
          (r.ambigus ? ` · ${r.ambigus} ambigu(s) à relier à la main` : "") +
          (r.sansMatch ? ` · ${r.sansMatch} sans commande correspondante` : ""),
      );
      // Recalcule la simulation pour refléter le CA nouvellement valorisé.
      const s = await simuler(from, to);
      if (s.ok) setData(s.data);
    });

  // Regroupement par jour ou par modèle/référence.
  const groupes = data ? regrouper(data, groupe) : [];

  return (
    <div className="page">
      <h2 className="sec">🧮 Simulation — pièces &amp; CA produits (journées GPAO)</h2>

      <div className="daybar" style={{ background: "#fff", color: "var(--txt)", border: "1px solid var(--border)", flexWrap: "wrap" }}>
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
        <div className="fld" style={{ margin: 0 }}>
          <label style={{ fontSize: 11, color: "var(--muted)", fontWeight: 700 }}>Grouper par</label>
          <br />
          <select value={groupe} onChange={(e) => setGroupe(e.target.value as "jour" | "modele")} style={{ padding: 7, border: "1px solid var(--border)", borderRadius: 8 }}>
            <option value="jour">Jour</option>
            <option value="modele">Modèle / référence</option>
          </select>
        </div>
        <div className="dright">
          <button className="btn primary sm" disabled={pending} onClick={lancer}>
            {pending ? "Calcul…" : "Calculer"}
          </button>
          <button
            className="btn sm"
            disabled={pending}
            title="Relie automatiquement les modèles GPAO à leur commande DBS (par référence, puis par nom) pour valoriser le CA de l'historique"
            onClick={rapprocher}
          >
            🔗 Relier modèles ↔ commandes
          </button>
          <button className="btn amber sm" disabled={!data || !data.lignes.length} onClick={() => data && printSimulation(data, groupe)}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {!data ? (
        <div className="empty">Choisissez une période puis « Calculer » pour voir les pièces produites et le CA.</div>
      ) : !data.lignes.length ? (
        <div className="empty">Aucune production enregistrée sur cette période.</div>
      ) : (
        <>
          <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <Kpi label="Pièces produites" val={nb.format(data.totalPieces)} />
            <Kpi label="CA produit" val={`${eur.format(data.totalCa)} €`} accent />
            <Kpi label="Jours de production" val={String(new Set(data.lignes.map((l) => l.date)).size)} />
            {data.piecesSansPrix > 0 && (
              <Kpi label="Pièces sans prix (hors CA)" val={nb.format(data.piecesSansPrix)} warn />
            )}
          </div>

          <table className="tbl" style={{ marginTop: 12 }}>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>{groupe === "jour" ? "Jour" : "Modèle / réf."}</th>
                {groupe === "jour" ? <th style={{ textAlign: "left" }}>Modèles produits</th> : <th style={{ textAlign: "left" }}>Client</th>}
                <th>Pièces</th>
                <th>Prix vente</th>
                <th>CA produit</th>
              </tr>
            </thead>
            <tbody>
              {groupes.map((g) => (
                <tr key={g.cle}>
                  <td style={{ textAlign: "left", fontWeight: 700 }}>{g.libelle}</td>
                  <td style={{ textAlign: "left", color: "var(--muted)", fontSize: 12 }}>{g.detail}</td>
                  <td>{nb.format(g.pieces)}</td>
                  <td>{g.prix == null ? "—" : `${eur2.format(g.prix)} €`}</td>
                  <td style={{ fontWeight: 800 }}>{g.ca > 0 ? `${eur.format(g.ca)} €` : "—"}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ fontWeight: 800, borderTop: "2px solid var(--border)" }}>
                <td style={{ textAlign: "left" }} colSpan={2}>
                  TOTAL
                </td>
                <td>{nb.format(data.totalPieces)}</td>
                <td>—</td>
                <td>{eur.format(data.totalCa)} €</td>
              </tr>
            </tfoot>
          </table>

          {data.piecesSansPrix > 0 && (
            <p style={{ fontSize: 12, color: "var(--muted)", marginTop: 8 }}>
              ⚠ {nb.format(data.piecesSansPrix)} pièce(s) proviennent de modèles non reliés à une commande (ou sans prix
              de vente) : elles comptent dans les pièces mais pas dans le CA. Utilisez « 🔗 Relier modèles ↔ commandes »
              pour les valoriser automatiquement, ou reliez le modèle à sa commande DBS à la main.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Kpi({ label, val, accent, warn }: { label: string; val: string; accent?: boolean; warn?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn ? "#b42318" : accent ? "#067647" : "var(--txt)" }}>{val}</div>
    </div>
  );
}

type GroupeLigne = { cle: string; libelle: string; detail: string; pieces: number; prix: number | null; ca: number };

function regrouper(data: SimulationData, mode: "jour" | "modele"): GroupeLigne[] {
  const map = new Map<string, GroupeLigne & { prixSet: Set<number> }>();
  for (const l of data.lignes) {
    const cle = mode === "jour" ? l.date : `${l.modele}|${l.ref}`;
    const e =
      map.get(cle) ??
      ({
        cle,
        libelle: mode === "jour" ? dateFr(l.date) : l.modele || "—",
        detail: "",
        pieces: 0,
        prix: null,
        ca: 0,
        prixSet: new Set<number>(),
      } as GroupeLigne & { prixSet: Set<number> });
    e.pieces += l.pieces;
    e.ca += l.ca;
    if (l.prixVente != null) e.prixSet.add(l.prixVente);
    // détail : liste des modèles/réfs du jour, ou client + réf pour un modèle.
    if (mode === "jour") {
      const tag = `${l.modele}${l.ref ? ` (${l.ref})` : ""}`;
      if (!e.detail.includes(tag)) e.detail = e.detail ? `${e.detail}, ${tag}` : tag;
    } else {
      e.detail = l.ref ? `${l.client || ""} · réf ${l.ref}` : l.client || "";
    }
    map.set(cle, e);
  }
  return [...map.values()]
    .map((e) => ({ ...e, prix: e.prixSet.size === 1 ? [...e.prixSet][0] : null }))
    .sort((a, b) => (a.cle < b.cle ? -1 : 1));
}

function printSimulation(data: SimulationData, mode: "jour" | "modele") {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const groupes = regrouper(data, mode);
  const rows = groupes
    .map(
      (g) =>
        `<tr><td style="text-align:left">${esc(g.libelle)}</td><td style="text-align:left">${esc(
          g.detail,
        )}</td><td>${g.pieces}</td><td>${g.prix == null ? "—" : eur2.format(g.prix) + " €"}</td><td><b>${
          g.ca > 0 ? eur.format(g.ca) + " €" : "—"
        }</b></td></tr>`,
    )
    .join("");
  const h = `<h1>SIMULATION — PIÈCES &amp; CA PRODUITS</h1>
    <div class="psub">Du ${dateFr(data.from)} au ${dateFr(data.to)} · groupé par ${mode === "jour" ? "jour" : "modèle"} · source : journées GPAO</div>
    <table><thead><tr><th style="text-align:left">${mode === "jour" ? "Jour" : "Modèle/réf."}</th><th style="text-align:left">${mode === "jour" ? "Modèles" : "Client"}</th><th>Pièces</th><th>Prix vente</th><th>CA</th></tr></thead>
    <tbody>${rows}</tbody>
    <tfoot><tr><td style="text-align:left" colspan="2"><b>TOTAL</b></td><td><b>${data.totalPieces}</b></td><td>—</td><td><b>${eur.format(data.totalCa)} €</b></td></tr></tfoot></table>
    <div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString("fr-FR")} — GPAO DBS Fashion</div>`;
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>Simulation</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:12px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}.psub{text-align:center;font-size:11px;color:#444;margin-bottom:12px}
    table{width:100%;border-collapse:collapse;font-size:11px}th,td{border:1px solid #555;padding:4px 6px;text-align:center}th{background:#e6e6e6}
    tfoot td{background:#f4f4f4}@page{size:A4 portrait;margin:10mm}
  </style></head><body>${h}</body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
