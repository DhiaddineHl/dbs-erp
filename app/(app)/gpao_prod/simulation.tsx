"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import type { SimulationData } from "@/lib/services/gpao";
import { commandesPourLien, lierModele, majPrixManuel, rapprocherModelesCommandes, simuler } from "./actions";

type CmdLien = { id: number; of: string; modele: string; ref: string; client: string; archived?: boolean };

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
  const [coutHoraire, setCoutHoraire] = useState("");
  const [cmds, setCmds] = useState<CmdLien[] | null>(null);

  const rafraichir = () =>
    start(async () => {
      const s = await simuler(from, to);
      if (s.ok) setData(s.data);
    });

  const chargerCmds = () =>
    start(async () => {
      if (cmds) return;
      const r = await commandesPourLien();
      if (r.ok) setCmds(r.data);
    });

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

  // Modèles sans prix (à valoriser) : distincts, avec pièces cumulées.
  const modelesSansPrix = (() => {
    if (!data) return [];
    const m = new Map<number, { modeleId: number; modele: string; ref: string; pieces: number }>();
    for (const l of data.lignes) {
      if (l.prixVente != null) continue;
      const e = m.get(l.modeleId) ?? { modeleId: l.modeleId, modele: l.modele, ref: l.ref, pieces: 0 };
      e.pieces += l.pieces;
      m.set(l.modeleId, e);
    }
    return [...m.values()].sort((a, b) => b.pieces - a.pieces);
  })();

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

          {/* Bilan coût : coût horaire usine saisi à la main × heures travaillées. */}
          <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff", marginTop: 12 }}>
            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 14 }}>
              <b style={{ fontSize: 14 }}>💶 Bilan coût de la période</b>
              <label style={{ fontSize: 12, color: "var(--muted)" }}>
                Coût d&apos;1 heure à l&apos;usine (€) :{" "}
                <input
                  type="number"
                  step="0.01"
                  value={coutHoraire}
                  onChange={(e) => setCoutHoraire(e.target.value)}
                  placeholder="ex: 4,50"
                  style={{ width: 90, padding: 6, border: "1px solid var(--border)", borderRadius: 8 }}
                />
              </label>
            </div>
            {(() => {
              const cout = Number(String(coutHoraire).replace(",", ".")) || 0;
              const coutTotal = Math.round(data.heuresTravaillees * cout);
              const marge = data.totalCa - coutTotal;
              return (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(150px,1fr))", gap: 10, marginTop: 10 }}>
                  <Kpi label="Heures travaillées" val={`${nb.format(data.heuresTravaillees)} h`} />
                  <Kpi label="Pièces produites" val={nb.format(data.totalPieces)} />
                  <Kpi label="CA produit" val={`${eur.format(data.totalCa)} €`} accent />
                  {cout > 0 && <Kpi label="Coût main d'œuvre" val={`${eur.format(coutTotal)} €`} warn />}
                  {cout > 0 && <Kpi label="Marge (CA − coût)" val={`${eur.format(marge)} €`} accent={marge >= 0} warn={marge < 0} />}
                  {cout > 0 && data.totalPieces > 0 && (
                    <Kpi label="Coût / pièce" val={`${eur2.format(coutTotal / data.totalPieces)} €`} />
                  )}
                </div>
              );
            })()}
            <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 6 }}>
              Heures = cellules horaires réellement saisies (hors RI/ABS). Le coût horaire est celui que tu saisis
              (salaire chargé + charges usine ÷ heures) — l&apos;app ne le connaît pas.
            </div>
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
            <div style={{ border: "1px solid var(--gold, #C9A227)", borderRadius: 12, padding: 12, background: "#FBF7EA", marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 6 }}>
                ⚠ Modèles à valoriser ({modelesSansPrix.length}) — pièces comptées mais hors CA
              </div>
              <div style={{ fontSize: 12, color: "var(--muted)", marginBottom: 8 }}>
                Pour chacun : relie-le à sa commande (archivées incluses), ou saisis un prix à la main.
              </div>
              {modelesSansPrix.map((m) => (
                <div key={m.modeleId} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid #eadfbf" }}>
                  <div style={{ flex: 1, minWidth: 180, fontWeight: 600 }}>
                    {m.modele}
                    {m.ref ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {m.ref}</span> : null}
                    <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {nb.format(m.pieces)} pcs</span>
                  </div>
                  {/* Prix manuel */}
                  <input
                    type="number"
                    step="0.01"
                    placeholder="prix €/pc"
                    defaultValue=""
                    style={{ width: 100, padding: 6, border: "1px solid var(--border)", borderRadius: 8 }}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      const v = Number((e.target as HTMLInputElement).value.replace(",", ".")) || 0;
                      start(async () => {
                        const r = await majPrixManuel(m.modeleId, v > 0 ? v : null);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Prix enregistré");
                        rafraichir();
                      });
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--muted)" }}>Entrée pour valider</span>
                  {/* Rattachement commande (archivées incluses) */}
                  <select
                    defaultValue=""
                    onFocus={chargerCmds}
                    onChange={(e) => {
                      const id = e.target.value ? Number(e.target.value) : null;
                      if (id == null) return;
                      start(async () => {
                        const r = await lierModele(m.modeleId, id);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Modèle relié");
                        rafraichir();
                      });
                    }}
                    style={{ padding: 6, border: "1px solid var(--border)", borderRadius: 8, maxWidth: 260 }}
                  >
                    <option value="">— relier à une commande —</option>
                    {(cmds ?? []).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.modele}
                        {c.ref ? ` — ${c.ref}` : ""}
                        {c.client ? ` · ${c.client}` : ""}
                        {c.archived ? " (archivée)" : ""}
                      </option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
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
