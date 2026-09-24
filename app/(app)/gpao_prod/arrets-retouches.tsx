"use client";

import { useMemo, useState } from "react";
import {
  type GpaoState,
  dayOuvrieres,
  findC,
  findM,
  ouvProd,
  ouvRet,
  ouvRetPct,
} from "./store";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);
const fmtDuree = (sec: number) => {
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return s ? `${m}min${s}` : `${m}min`;
};

type Onglet = "arrets" | "retouches";

/* Onglet « Arrêts & retouches » (à côté de Garde-robe) : historique et rapports
 * des temps non productifs et des retouches, sur une période, à partir des
 * journées GPAO. Aide à voir d'où viennent les pertes (motifs) et qui/quel poste
 * retouche le plus. */
export function ArretsRetouchesView({ state }: { state: GpaoState }) {
  const moisDefaut = new Date().toISOString().slice(0, 7);
  const [from, setFrom] = useState(`${moisDefaut}-01`);
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));
  const [onglet, setOnglet] = useState<Onglet>("arrets");

  const jours = useMemo(
    () => state.journees.filter((j) => j.date >= from && j.date <= to).sort((a, b) => a.date.localeCompare(b.date)),
    [state.journees, from, to],
  );

  // ── Arrêts ──
  const arrets = useMemo(() => {
    const parMotif = new Map<string, { motif: string; secondes: number; occurrences: number }>();
    const parOuv = new Map<string, { nom: string; secondes: number; occurrences: number }>();
    const lignes: { date: string; ouvriere: string; chaine: string; motif: string; secondes: number }[] = [];
    let totalSec = 0;
    for (const j of jours) {
      const c = findC(state, j.chaineId);
      const roster = dayOuvrieres(state, j);
      for (const [ouvId, liste] of Object.entries(j.arrets ?? {})) {
        const o = roster.find((x) => x.id === Number(ouvId));
        const nom = o?.nom ?? `#${ouvId}`;
        for (const a of liste ?? []) {
          totalSec += a.secondes;
          lignes.push({ date: j.date, ouvriere: nom, chaine: c?.nom ?? "?", motif: a.motif, secondes: a.secondes });
          const pm = parMotif.get(a.motif) ?? { motif: a.motif, secondes: 0, occurrences: 0 };
          pm.secondes += a.secondes;
          pm.occurrences += 1;
          parMotif.set(a.motif, pm);
          const po = parOuv.get(nom) ?? { nom, secondes: 0, occurrences: 0 };
          po.secondes += a.secondes;
          po.occurrences += 1;
          parOuv.set(nom, po);
        }
      }
    }
    return {
      totalSec,
      lignes: lignes.sort((a, b) => a.date.localeCompare(b.date) || b.secondes - a.secondes),
      parMotif: [...parMotif.values()].sort((a, b) => b.secondes - a.secondes),
      parOuv: [...parOuv.values()].sort((a, b) => b.secondes - a.secondes),
    };
  }, [jours, state]);

  // ── Retouches ──
  const retouches = useMemo(() => {
    const parOuv = new Map<string, { nom: string; ret: number; prod: number }>();
    const parModele = new Map<string, { modele: string; ret: number; prod: number }>();
    const lignes: { date: string; ouvriere: string; modele: string; ret: number; pct: number | null }[] = [];
    let totalRet = 0;
    let totalProd = 0;
    for (const j of jours) {
      const m = findM(state, j.modeleId);
      const mNom = m ? `${m.nom}${m.ref ? ` (${m.ref})` : ""}` : "?";
      for (const o of dayOuvrieres(state, j)) {
        const ret = ouvRet(j, o.id);
        const prod = ouvProd(j, o.id);
        if (ret <= 0 && prod <= 0) continue;
        totalRet += ret;
        totalProd += prod;
        if (ret > 0) lignes.push({ date: j.date, ouvriere: o.nom, modele: mNom, ret, pct: ouvRetPct(j, o.id) });
        const po = parOuv.get(o.nom) ?? { nom: o.nom, ret: 0, prod: 0 };
        po.ret += ret;
        po.prod += prod;
        parOuv.set(o.nom, po);
        const pm = parModele.get(mNom) ?? { modele: mNom, ret: 0, prod: 0 };
        pm.ret += ret;
        pm.prod += prod;
        parModele.set(mNom, pm);
      }
    }
    return {
      totalRet,
      totalProd,
      pctGlobal: totalProd > 0 ? Math.round((totalRet / totalProd) * 1000) / 10 : 0,
      lignes: lignes.sort((a, b) => a.date.localeCompare(b.date) || b.ret - a.ret),
      parOuv: [...parOuv.values()].filter((x) => x.ret > 0).sort((a, b) => b.ret - a.ret),
      parModele: [...parModele.values()].filter((x) => x.ret > 0).sort((a, b) => b.ret - a.ret),
    };
  }, [jours, state]);

  const imprimer = () => printRapport(onglet, from, to, arrets, retouches);

  return (
    <div className="page">
      <h2 className="sec">🛠 Arrêts &amp; retouches — historique &amp; rapports</h2>

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
        <div className="dright" style={{ display: "flex", gap: 6 }}>
          <button className={`btn sm ${onglet === "arrets" ? "primary" : ""}`} onClick={() => setOnglet("arrets")}>
            ⏱ Arrêts
          </button>
          <button className={`btn sm ${onglet === "retouches" ? "primary" : ""}`} onClick={() => setOnglet("retouches")}>
            🔧 Retouches
          </button>
          <button className="btn amber sm" onClick={imprimer}>
            🖨 Imprimer
          </button>
        </div>
      </div>

      {onglet === "arrets" ? (
        <>
          <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <Kpi label="Temps d'arrêt total" val={fmtDuree(arrets.totalSec)} warn={arrets.totalSec > 0} />
            <Kpi label="Nombre d'arrêts" val={String(arrets.lignes.length)} />
            <Kpi label="Motifs distincts" val={String(arrets.parMotif.length)} />
          </div>

          {arrets.lignes.length === 0 ? (
            <div className="empty">Aucun arrêt saisi sur cette période.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
              <Bloc titre="Par motif (Pareto)">
                {arrets.parMotif.map((m) => (
                  <BarreLigne key={m.motif} label={m.motif} valeur={fmtDuree(m.secondes)} pct={pct(m.secondes, arrets.parMotif[0].secondes)} sub={`${m.occurrences}×`} />
                ))}
              </Bloc>
              <Bloc titre="Par ouvrière">
                {arrets.parOuv.map((o) => (
                  <BarreLigne key={o.nom} label={o.nom} valeur={fmtDuree(o.secondes)} pct={pct(o.secondes, arrets.parOuv[0].secondes)} sub={`${o.occurrences}×`} />
                ))}
              </Bloc>
            </div>
          )}

          {arrets.lignes.length > 0 && (
            <table className="tbl" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "left" }}>Ouvrière</th>
                  <th style={{ textAlign: "left" }}>Chaîne</th>
                  <th style={{ textAlign: "left" }}>Motif</th>
                  <th>Durée</th>
                </tr>
              </thead>
              <tbody>
                {arrets.lignes.map((l, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{dateFr(l.date)}</td>
                    <td style={{ textAlign: "left" }}>{l.ouvriere}</td>
                    <td style={{ textAlign: "left" }}>{l.chaine}</td>
                    <td style={{ textAlign: "left" }}>{l.motif}</td>
                    <td style={{ fontWeight: 700 }}>{fmtDuree(l.secondes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      ) : (
        <>
          <div className="cards" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(180px,1fr))", gap: 12, marginTop: 12 }}>
            <Kpi label="Retouches totales" val={nb.format(retouches.totalRet)} warn={retouches.totalRet > 0} />
            <Kpi label="Production totale" val={nb.format(retouches.totalProd)} />
            <Kpi label="% retouche global" val={`${retouches.pctGlobal}%`} warn={retouches.pctGlobal >= 5} />
          </div>

          {retouches.lignes.length === 0 ? (
            <div className="empty">Aucune retouche saisie sur cette période.</div>
          ) : (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 12 }}>
              <Bloc titre="Par ouvrière">
                {retouches.parOuv.map((o) => (
                  <BarreLigne
                    key={o.nom}
                    label={o.nom}
                    valeur={`${o.ret}`}
                    pct={pct(o.ret, retouches.parOuv[0].ret)}
                    sub={o.prod > 0 ? `${Math.round((o.ret / o.prod) * 1000) / 10}%` : ""}
                  />
                ))}
              </Bloc>
              <Bloc titre="Par modèle">
                {retouches.parModele.map((m) => (
                  <BarreLigne
                    key={m.modele}
                    label={m.modele}
                    valeur={`${m.ret}`}
                    pct={pct(m.ret, retouches.parModele[0].ret)}
                    sub={m.prod > 0 ? `${Math.round((m.ret / m.prod) * 1000) / 10}%` : ""}
                  />
                ))}
              </Bloc>
            </div>
          )}

          {retouches.lignes.length > 0 && (
            <table className="tbl" style={{ marginTop: 12 }}>
              <thead>
                <tr>
                  <th style={{ textAlign: "left" }}>Date</th>
                  <th style={{ textAlign: "left" }}>Ouvrière</th>
                  <th style={{ textAlign: "left" }}>Modèle</th>
                  <th>Retouches</th>
                  <th>% / prod</th>
                </tr>
              </thead>
              <tbody>
                {retouches.lignes.map((l, i) => (
                  <tr key={i}>
                    <td style={{ textAlign: "left" }}>{dateFr(l.date)}</td>
                    <td style={{ textAlign: "left" }}>{l.ouvriere}</td>
                    <td style={{ textAlign: "left" }}>{l.modele}</td>
                    <td style={{ fontWeight: 700 }}>{l.ret}</td>
                    <td>{l.pct == null ? "—" : `${l.pct}%`}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </>
      )}
    </div>
  );
}

const pct = (v: number, max: number) => (max > 0 ? Math.max(4, (v / max) * 100) : 0);

function Kpi({ label, val, warn }: { label: string; val: string; warn?: boolean }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: "10px 14px", background: "#fff" }}>
      <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color: warn ? "#b42318" : "var(--txt)" }}>{val}</div>
    </div>
  );
}

function Bloc({ titre, children }: { titre: string; children: React.ReactNode }) {
  return (
    <div style={{ border: "1px solid var(--border)", borderRadius: 12, padding: 12, background: "#fff" }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>{titre}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>{children}</div>
    </div>
  );
}

function BarreLigne({ label, valeur, pct, sub }: { label: string; valeur: string; pct: number; sub?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 12 }}>
      <div style={{ width: 150, textAlign: "right", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{label}</div>
      <div style={{ flex: 1, background: "#eef2f7", borderRadius: 6, height: 16, position: "relative" }}>
        <div style={{ position: "absolute", inset: 0, width: `${pct}%`, background: "#e11d48", borderRadius: 6, opacity: 0.75 }} />
      </div>
      <div style={{ width: 90, fontWeight: 700, whiteSpace: "nowrap" }}>
        {valeur}
        {sub ? <span style={{ color: "var(--muted)", fontWeight: 400 }}> · {sub}</span> : null}
      </div>
    </div>
  );
}

type ArretsAgg = { totalSec: number; parMotif: { motif: string; secondes: number; occurrences: number }[]; parOuv: { nom: string; secondes: number; occurrences: number }[]; lignes: { date: string; ouvriere: string; chaine: string; motif: string; secondes: number }[] };
type RetAgg = { totalRet: number; totalProd: number; pctGlobal: number; parOuv: { nom: string; ret: number; prod: number }[]; parModele: { modele: string; ret: number; prod: number }[]; lignes: { date: string; ouvriere: string; modele: string; ret: number; pct: number | null }[] };

function printRapport(onglet: Onglet, from: string, to: string, arrets: ArretsAgg, ret: RetAgg) {
  const esc = (s: unknown) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  let corps: string;
  let titre: string;
  if (onglet === "arrets") {
    titre = "RAPPORT DES ARRÊTS / TEMPS NON PRODUCTIFS";
    const motifs = arrets.parMotif.map((m) => `<tr><td style="text-align:left">${esc(m.motif)}</td><td>${m.occurrences}</td><td><b>${fmtDuree(m.secondes)}</b></td></tr>`).join("");
    const det = arrets.lignes.map((l) => `<tr><td>${dateFr(l.date)}</td><td style="text-align:left">${esc(l.ouvriere)}</td><td style="text-align:left">${esc(l.chaine)}</td><td style="text-align:left">${esc(l.motif)}</td><td><b>${fmtDuree(l.secondes)}</b></td></tr>`).join("");
    corps = `<div class="psub">Total : ${fmtDuree(arrets.totalSec)} · ${arrets.lignes.length} arrêt(s)</div>
      <h3>Par motif</h3><table><thead><tr><th style="text-align:left">Motif</th><th>Occur.</th><th>Durée</th></tr></thead><tbody>${motifs}</tbody></table>
      <h3>Détail</h3><table><thead><tr><th>Date</th><th style="text-align:left">Ouvrière</th><th style="text-align:left">Chaîne</th><th style="text-align:left">Motif</th><th>Durée</th></tr></thead><tbody>${det}</tbody></table>`;
  } else {
    titre = "RAPPORT DES RETOUCHES";
    const ouv = ret.parOuv.map((o) => `<tr><td style="text-align:left">${esc(o.nom)}</td><td>${o.ret}</td><td>${o.prod > 0 ? Math.round((o.ret / o.prod) * 1000) / 10 + "%" : "—"}</td></tr>`).join("");
    const det = ret.lignes.map((l) => `<tr><td>${dateFr(l.date)}</td><td style="text-align:left">${esc(l.ouvriere)}</td><td style="text-align:left">${esc(l.modele)}</td><td><b>${l.ret}</b></td><td>${l.pct == null ? "—" : l.pct + "%"}</td></tr>`).join("");
    corps = `<div class="psub">Retouches : ${ret.totalRet} · production ${ret.totalProd} · % global ${ret.pctGlobal}%</div>
      <h3>Par ouvrière</h3><table><thead><tr><th style="text-align:left">Ouvrière</th><th>Retouches</th><th>%/prod</th></tr></thead><tbody>${ouv}</tbody></table>
      <h3>Détail</h3><table><thead><tr><th>Date</th><th style="text-align:left">Ouvrière</th><th style="text-align:left">Modèle</th><th>Retouches</th><th>%/prod</th></tr></thead><tbody>${det}</tbody></table>`;
  }
  const w = window.open("", "_blank", "width=1000,height=800");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${titre}</title><style>
    body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:12px;color:#000}
    h1{font-size:17px;text-align:center;margin:0 0 4px}h3{font-size:13px;margin:14px 0 4px}
    .psub{text-align:center;font-size:11px;color:#444;margin-bottom:8px}
    table{width:100%;border-collapse:collapse;font-size:11px;margin-bottom:8px}th,td{border:1px solid #555;padding:4px 6px;text-align:center}th{background:#e6e6e6}
    @page{size:A4 portrait;margin:10mm}
  </style></head><body><h1>${titre}</h1><div class="psub">Du ${dateFr(from)} au ${dateFr(to)} — GPAO DBS Fashion</div>${corps}
  <div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString("fr-FR")}</div></body></html>`);
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
}
