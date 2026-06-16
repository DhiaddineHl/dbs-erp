"use client";

import { useCallback, useRef, useState } from "react";
import "./facturation.css";
import {
  CLIENT_NAMES,
  type Facture,
  type FactStore,
  caNet,
  clientAnalysis,
  factureMarge,
  fdate,
  fid,
  getLine,
  nb,
  nbI,
  typeLabel,
  typeTagClass,
  useFactStore,
} from "@/lib/facturation/store";
import { DetailModal } from "./detail-modal";
import { Generateur } from "./generateur";
import { buildReportHTML, printDocument } from "@/lib/facturation/print";

type Tab = "dashboard" | "registre" | "generateur" | "marges" | "stats" | "rapports";

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "dashboard", label: "Tableau de bord", icon: "◈" },
  { id: "registre", label: "Registre", icon: "≡" },
  { id: "generateur", label: "Nouvelle facture", icon: "+" },
  { id: "marges", label: "Marges par facture", icon: "◎" },
  { id: "stats", label: "Stats Interne/Façon", icon: "▤" },
  { id: "rapports", label: "Rapports", icon: "🖨" },
];

const BAR_COLORS = ["#0F1F3D", "#C9A227", "#2A5C45", "#6B7589", "#C0392B", "#1A6B8A", "#8B5E3C", "#444"];

export default function FacturesPage() {
  const store = useFactStore();
  const [tab, setTab] = useState<Tab>("dashboard");
  const [detail, setDetail] = useState<Facture | null>(null);
  const [seed, setSeed] = useState<{ facture: Facture | null; key: number }>({ facture: null, key: 0 });
  const importRef = useRef<HTMLInputElement>(null);

  // toast
  const [toastMsg, setToastMsg] = useState("");
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const toast = useCallback((m: string) => {
    setToastMsg(m);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToastMsg(""), 2200);
  }, []);

  const viewFacture = useCallback((f: Facture) => {
    setSeed((s) => ({ facture: f, key: s.key + 1 }));
    setTab("generateur");
  }, []);

  if (!store.ready) return <div className="fac" style={{ padding: 28 }} />;

  return (
    <div className="fac -mx-7 -my-6 min-h-[calc(100vh-60px)]">
      <div className="topbar">
        <div className="topbar-title">{TABS.find((t) => t.id === tab)?.label}</div>
        <div className="topbar-actions">
          <button className="btn btn-outline btn-sm" onClick={store.exportData}>
            💾 Sauvegarde
          </button>
          <button className="btn btn-outline btn-sm" onClick={() => importRef.current?.click()}>
            📂 Importer
          </button>
          <input
            ref={importRef}
            type="file"
            accept=".json"
            style={{ display: "none" }}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) store.importData(file, (ok) => toast(ok ? "Sauvegarde importée ✓" : "Fichier invalide"));
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="tabbar">
        {TABS.map((t) => (
          <div
            key={t.id}
            className={`tab${tab === t.id ? " active" : ""}`}
            onClick={() => {
              if (t.id === "generateur") setSeed((s) => ({ facture: null, key: s.key + 1 }));
              setTab(t.id);
            }}
          >
            <span className="icon">{t.icon}</span>
            {t.label}
          </div>
        ))}
      </div>

      {tab === "dashboard" && <Dashboard store={store} onSeeAll={() => setTab("registre")} />}
      {tab === "registre" && <Registre store={store} onView={viewFacture} onMarges={setDetail} toast={toast} />}
      {tab === "generateur" && <Generateur key={seed.key} store={store} seed={seed.facture} toast={toast} />}
      {tab === "marges" && <Marges store={store} onOpen={setDetail} />}
      {tab === "stats" && <Stats store={store} />}
      {tab === "rapports" && <Rapports store={store} />}

      {detail && (
        <DetailModal
          facture={detail}
          couts={store.couts}
          setLine={store.setLine}
          onClose={() => setDetail(null)}
          toast={toast}
        />
      )}

      {toastMsg && <div className="fac-toast show">{toastMsg}</div>}
    </div>
  );
}

/* ═══════════════════ DASHBOARD ═══════════════════ */
function Dashboard({ store, onSeeAll }: { store: FactStore; onSeeAll: () => void }) {
  const all = store.all();
  const fs = all.filter((f) => f.type === "facture");
  const avsArr = all.filter((f) => f.type === "avoir");
  const ca = fs.reduce((s, f) => s + f.total, 0);
  const av = avsArr.reduce((s, f) => s + f.total, 0);
  const net = ca - av;
  const pcs = fs.reduce((s, f) => s + f.pieces, 0);
  const fourn = fs.reduce((s, f) => s + (f.fournitures || 0), 0);

  let nC = 0;
  let nP = 0;
  all
    .filter((f) => f.type !== "proforma" && f.lignes.length)
    .forEach((f) => {
      const m = factureMarge(store.couts, f);
      if (m.statut === "complete") nC++;
      else if (m.statut === "partielle") nP++;
    });

  const byClient: Record<string, number> = {};
  fs.forEach((f) => (byClient[f.client] = (byClient[f.client] || 0) + f.total));
  avsArr.forEach((f) => {
    if (byClient[f.client] !== undefined) byClient[f.client] -= f.total;
  });
  const sorted = Object.entries(byClient).sort((a, b) => b[1] - a[1]);
  const maxCA = sorted[0]?.[1] || 1;

  const mois: Record<string, number> = {};
  fs.forEach((f) => {
    const k = f.date.substring(0, 7);
    mois[k] = (mois[k] || 0) + f.total;
  });
  avsArr.forEach((f) => {
    const k = f.date.substring(0, 7);
    if (mois[k]) mois[k] -= f.total;
  });
  const maxM = Math.max(...Object.values(mois), 1);
  const MOIS_FR_S = ["Jan", "Fév", "Mar", "Avr", "Mai", "Juin", "Juil", "Août", "Sep", "Oct", "Nov", "Déc"];

  const ana = clientAnalysis(all);
  const recent = [...all].sort((a, b) => b.date.localeCompare(a.date)).slice(0, 8);

  return (
    <div className="page">
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">CA export net 2026</div>
          <div className="kpi-value">{nb(net)} €</div>
          <div className="kpi-sub">
            {fs.length} factures − {avsArr.length} avoirs ({nb(av)} €)
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Pièces livrées</div>
          <div className="kpi-value gold">{nbI(pcs)}</div>
          <div className="kpi-sub">PMP global {nb(net / pcs)} €/pièce</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Fournitures facturées</div>
          <div className="kpi-value" style={{ color: "var(--slate)" }}>
            {nb(fourn)} €
          </div>
          <div className="kpi-sub">{((fourn / net) * 100).toFixed(1)}% du CA net</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Saisie des marges</div>
          <div className="kpi-value green">
            {nC} ✓ {nP ? `· ${nP} ◐` : ""}
          </div>
          <div className="kpi-sub">factures complètes / partielles</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">CA net par client (€ HT)</div>
          {sorted.map(([k, v], i) => (
            <div className="bar-row" key={k}>
              <div className="bar-label">{CLIENT_NAMES[k] || k}</div>
              <div className="bar-track">
                <div
                  className="bar-fill"
                  style={{ width: `${((v / maxCA) * 100).toFixed(1)}%`, background: BAR_COLORS[i % BAR_COLORS.length] }}
                />
              </div>
              <div className="bar-value">{nb(v)} €</div>
            </div>
          ))}
        </div>
        <div className="chart-card">
          <div className="chart-title">CA net par mois 2026</div>
          {Object.entries(mois)
            .sort()
            .map(([k, v]) => (
              <div className="bar-row" key={k}>
                <div className="bar-label" style={{ width: 70 }}>
                  {MOIS_FR_S[+k.substring(5) - 1] || k}
                </div>
                <div className="bar-track">
                  <div className="bar-fill" style={{ width: `${((v / maxM) * 100).toFixed(1)}%`, background: "var(--navy)" }} />
                </div>
                <div className="bar-value">{nb(v)} €</div>
              </div>
            ))}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Analyse par client — prix moyen pondéré &amp; indicateurs</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Factures</th>
              <th>Pièces</th>
              <th>CA net (€)</th>
              <th>% du CA</th>
              <th>PMP (€/pièce)</th>
              <th>CA moyen / facture</th>
              <th>Fournit. % CA</th>
            </tr>
          </thead>
          <tbody>
            {ana.rows.map((r) => (
              <tr key={r.key}>
                <td>
                  <strong>{r.name}</strong>
                </td>
                <td className="mono">{r.n}</td>
                <td className="mono">{nbI(r.pcs)}</td>
                <td className="mono" style={{ fontWeight: 700 }}>
                  {nb(r.ca)} €
                </td>
                <td>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ flex: "0 0 60px" }} className="progress-bar">
                      <div className="progress-fill" style={{ width: `${r.pctCA.toFixed(0)}%`, background: "var(--navy)" }} />
                    </div>
                    <span className="mono">{r.pctCA.toFixed(1)}%</span>
                  </div>
                </td>
                <td className="mono" style={{ fontWeight: 700, color: "var(--gold)" }}>
                  {nb(r.pmp)} €
                </td>
                <td className="mono">{nb(r.caMoyen)} €</td>
                <td className="mono">{r.fournPct.toFixed(1)}%</td>
              </tr>
            ))}
            <tr style={{ background: "var(--fac-light)" }}>
              <td>
                <strong>TOTAL</strong>
              </td>
              <td className="mono">
                <strong>{ana.tot.n}</strong>
              </td>
              <td className="mono">
                <strong>{nbI(ana.tot.pcs)}</strong>
              </td>
              <td className="mono">
                <strong>{nb(ana.tot.ca)} €</strong>
              </td>
              <td />
              <td className="mono">
                <strong>{nb(ana.tot.pmp)} €</strong>
              </td>
              <td className="mono">
                <strong>{nb(ana.tot.caMoyen)} €</strong>
              </td>
              <td className="mono">
                <strong>{ana.tot.fournPct.toFixed(1)}%</strong>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Dernières factures</div>
          <button className="btn btn-outline btn-sm" onClick={onSeeAll}>
            Voir tout
          </button>
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Client</th>
              <th>Date</th>
              <th>Pièces</th>
              <th>Type</th>
              <th>Montant HT</th>
            </tr>
          </thead>
          <tbody>
            {recent.map((f) => (
              <tr key={fid(f)}>
                <td className="mono">{fid(f)}</td>
                <td>
                  <strong>{CLIENT_NAMES[f.client] || f.client}</strong>
                </td>
                <td>{fdate(f.date)}</td>
                <td className="mono">{nbI(f.pieces)}</td>
                <td>
                  <span className={`tag ${typeTagClass(f.type)}`}>{typeLabel(f.type)}</span>
                </td>
                <td className="mono" style={{ fontWeight: 700, color: f.type === "avoir" ? "var(--red)" : undefined }}>
                  {f.type === "avoir" ? "−" : ""}
                  {nb(f.total)} €
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ REGISTRE ═══════════════════ */
function Registre({
  store,
  onView,
  onMarges,
  toast,
}: {
  store: FactStore;
  onView: (f: Facture) => void;
  onMarges: (f: Facture) => void;
  toast: (m: string) => void;
}) {
  const [q, setQ] = useState("");
  const [cl, setCl] = useState("");
  const [ty, setTy] = useState("");
  const [mo, setMo] = useState("");
  const all = store.all();
  const clients = [...new Set(all.map((f) => f.client))];

  const res = all
    .filter((f) => {
      const txt = (
        f.id +
        " " +
        f.client +
        " " +
        (CLIENT_NAMES[f.client] || "") +
        " " +
        f.lignes.map((l) => l.modele + " " + l.ref + " " + l.desig).join(" ")
      ).toLowerCase();
      return (!q || txt.includes(q.toLowerCase())) && (!cl || f.client === cl) && (!ty || f.type === ty) && (!mo || f.date.substring(5, 7) === mo);
    })
    .sort((a, b) => b.date.localeCompare(a.date));
  const tot =
    res.filter((f) => f.type === "facture").reduce((s, f) => s + f.total, 0) -
    res.filter((f) => f.type === "avoir").reduce((s, f) => s + f.total, 0);

  return (
    <div className="page">
      <div className="search-bar">
        <input placeholder="Rechercher par N°, client, modèle, référence..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cl} onChange={(e) => setCl(e.target.value)}>
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {CLIENT_NAMES[c] || c}
            </option>
          ))}
        </select>
        <select value={ty} onChange={(e) => setTy(e.target.value)}>
          <option value="">Tous types</option>
          <option value="facture">Factures</option>
          <option value="avoir">Avoirs</option>
          <option value="proforma">Proforma</option>
        </select>
        <select value={mo} onChange={(e) => setMo(e.target.value)}>
          <option value="">Tous les mois</option>
          {["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"].map((m) => (
            <option key={m} value={m}>
              {["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"][+m - 1]}
            </option>
          ))}
        </select>
      </div>
      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">
            {res.length} documents — CA net {nb(tot)} €
          </div>
          {store.deleted.length > 0 && (
            <button
              className="btn btn-outline btn-sm"
              onClick={() => {
                store.restoreDeleted();
                toast("Factures restaurées");
              }}
            >
              ↩ Restaurer {store.deleted.length} facture(s) supprimée(s)
            </button>
          )}
        </div>
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Client</th>
              <th>Pièces</th>
              <th>Fournitures</th>
              <th>Montant HT</th>
              <th>Type</th>
              <th style={{ width: 220 }} />
            </tr>
          </thead>
          <tbody>
            {res.map((f) => (
              <tr key={fid(f)}>
                <td className="mono">
                  <strong>{fid(f)}</strong>
                  {store.isOverride(f) && (
                    <span className="tag tag-green" title="Créée ou modifiée dans l'application">
                      {" "}
                      ●
                    </span>
                  )}
                </td>
                <td>{fdate(f.date)}</td>
                <td>
                  <strong>{CLIENT_NAMES[f.client] || f.client}</strong>
                </td>
                <td className="mono">{nbI(f.pieces)}</td>
                <td className="mono">{f.fournitures ? nb(f.fournitures) + " €" : "—"}</td>
                <td className="mono" style={{ fontWeight: 700, color: f.type === "avoir" ? "var(--red)" : undefined }}>
                  {f.type === "avoir" ? "−" : ""}
                  {nb(f.total)} €
                </td>
                <td>
                  <span className={`tag ${typeTagClass(f.type)}`}>{typeLabel(f.type)}</span>
                </td>
                <td style={{ whiteSpace: "nowrap" }}>
                  <button className="btn btn-outline btn-sm" onClick={() => onView(f)}>
                    Voir
                  </button>{" "}
                  {f.lignes.length > 0 && (
                    <button className="btn btn-gold btn-sm" onClick={() => onMarges(f)}>
                      Marges
                    </button>
                  )}{" "}
                  <button
                    className="btn btn-danger btn-sm"
                    onClick={() => {
                      if (confirm(`Supprimer la facture ${f.id} ?\n\n(Les factures issues du fichier Excel pourront être restaurées via le bouton «Restaurer».)`)) {
                        store.deleteFacture(f.id, f.type);
                        toast(`Facture ${f.id} supprimée`);
                      }
                    }}
                  >
                    Suppr.
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ MARGES ═══════════════════ */
function Marges({ store, onOpen }: { store: FactStore; onOpen: (f: Facture) => void }) {
  const [q, setQ] = useState("");
  const [cl, setCl] = useState("");
  const [st, setSt] = useState("");
  const all = store.all();
  const clients = [...new Set(all.map((f) => f.client))];

  const summaryFs = all.filter((f) => f.type !== "proforma" && f.lignes.length);
  let caR = 0;
  let coutR = 0;
  let fournR = 0;
  let margeR = 0;
  let n = 0;
  summaryFs.forEach((f) => {
    const m = factureMarge(store.couts, f);
    if (m.marge !== null) {
      caR += caNet(f);
      coutR += m.cout!;
      fournR += f.fournitures || 0;
      margeR += m.marge;
      n++;
    }
  });
  const pct = caR > 0 ? (margeR / caR) * 100 : 0;

  const rows = all
    .filter((f) => f.type !== "proforma")
    .filter((f) => {
      const txt = (f.id + " " + (CLIENT_NAMES[f.client] || "")).toLowerCase();
      const m = factureMarge(store.couts, f);
      return (!q || txt.includes(q.toLowerCase())) && (!cl || f.client === cl) && (!st || m.statut === st);
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return (
    <div className="page">
      <div className="info-box">
        <strong style={{ color: "var(--navy)" }}>Cliquez sur une facture pour l&apos;ouvrir</strong> et renseigner,
        article par article : où la pièce a été fabriquée (<span className="tag tag-navy">Interne DBS</span> ou{" "}
        <span className="tag tag-gold">Façonnier</span>). Pour l&apos;<strong>interne</strong>, le coût prend
        automatiquement le prix de facturation (marge nulle) ; pour un <strong>façonnier</strong>, saisissez le prix de
        façon payé. <span className="mono">Marge = CA facturé − Fournitures − Σ(Qté × Coût/pièce)</span>
      </div>

      <div className="marge-summary">
        <div className="marge-card">
          <div className="mc-label">Factures renseignées</div>
          <div className="mc-val">
            {n} / {summaryFs.length}
          </div>
          <div className="mc-sub">avec au moins 1 article saisi</div>
        </div>
        <div className="marge-card">
          <div className="mc-label">CA renseigné</div>
          <div className="mc-val">{nb(caR)} €</div>
        </div>
        <div className="marge-card">
          <div className="mc-label">Coûts (production + fournitures)</div>
          <div className="mc-val" style={{ color: "var(--gold)" }}>
            {nb(coutR + fournR)} €
          </div>
        </div>
        <div className="marge-card">
          <div className="mc-label">Marge totale</div>
          <div className="mc-val" style={{ color: margeR >= 0 ? "var(--green)" : "var(--red)" }}>
            {nb(margeR)} €
          </div>
          <div className="mc-sub">{pct.toFixed(1)}% du CA renseigné</div>
          <div className="progress-bar">
            <div className="progress-fill" style={{ width: `${Math.min(100, Math.max(0, pct))}%`, background: "var(--green)" }} />
          </div>
        </div>
      </div>

      <div className="search-bar">
        <input placeholder="Rechercher une facture..." value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={cl} onChange={(e) => setCl(e.target.value)}>
          <option value="">Tous les clients</option>
          {clients.map((c) => (
            <option key={c} value={c}>
              {CLIENT_NAMES[c] || c}
            </option>
          ))}
        </select>
        <select value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">Toutes</option>
          <option value="complete">✓ Complètes</option>
          <option value="partielle">◐ Partielles</option>
          <option value="vide">○ À renseigner</option>
        </select>
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>N°</th>
              <th>Date</th>
              <th>Client</th>
              <th>Articles</th>
              <th>CA HT (€)</th>
              <th>Fournit. (€)</th>
              <th>Coût production (€)</th>
              <th>Marge (€)</th>
              <th>Marge %</th>
              <th>Saisie</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((f) => {
              const m = factureMarge(store.couts, f);
              const isAv = f.type === "avoir";
              const clickable = f.lignes.length > 0;
              return (
                <tr key={fid(f)} className="fact-row" onClick={clickable ? () => onOpen(f) : undefined}>
                  <td className="mono">
                    <strong>{fid(f)}</strong>
                  </td>
                  <td>{fdate(f.date)}</td>
                  <td>
                    {CLIENT_NAMES[f.client] || f.client} {isAv && <span className="tag tag-red">Avoir</span>}
                  </td>
                  <td className="mono">{f.lignes.length}</td>
                  <td className="mono" style={{ fontWeight: 600, color: isAv ? "var(--red)" : undefined }}>
                    {nb(caNet(f))} €
                  </td>
                  <td className="mono">{f.fournitures ? nb(f.fournitures) : "—"}</td>
                  <td className="mono">{m.cout !== null ? nb(m.cout) + " €" : "—"}</td>
                  <td>
                    {m.marge !== null ? (
                      <span className={m.marge >= 0 ? "pos" : "neg"}>{nb(m.marge)} €</span>
                    ) : (
                      <span style={{ color: "var(--slate)" }}>—</span>
                    )}
                  </td>
                  <td>
                    {m.pct !== null ? (
                      <span className={m.marge! >= 0 ? "pos" : "neg"}>{m.pct.toFixed(1)}%</span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    <span className="completion">
                      <span
                        className="cdot"
                        style={{
                          background:
                            m.statut === "complete" ? "var(--green)" : m.statut === "partielle" ? "var(--gold)" : "#C5C0B6",
                        }}
                      />
                      {m.statut === "complete"
                        ? "✓ Complète"
                        : m.statut === "partielle"
                          ? `◐ ${m.nRens}/${m.nL}`
                          : "○ À saisir"}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ STATS ═══════════════════ */
function Stats({ store }: { store: FactStore }) {
  const agg = {
    interne: { ca: 0, cout: 0, pcs: 0, n: 0 },
    faconnier: { ca: 0, cout: 0, pcs: 0, n: 0 },
    nd: { ca: 0, pcs: 0, n: 0 },
  };
  const byFacon: Record<string, { n: number; pcs: number; ca: number; cout: number }> = {};
  const byClient: Record<string, { n: number; pcs: number; ca: number; fourn: number; cout: number; hasCost: boolean }> = {};
  store
    .all()
    .filter((f) => f.type !== "proforma")
    .forEach((f) => {
      const sign = f.type === "avoir" ? -1 : 1;
      const k = f.client;
      if (!byClient[k]) byClient[k] = { n: 0, pcs: 0, ca: 0, fourn: 0, cout: 0, hasCost: false };
      byClient[k].n++;
      byClient[k].ca += caNet(f);
      if (f.type !== "avoir") {
        byClient[k].pcs += f.pieces;
        byClient[k].fourn += f.fournitures || 0;
      }
      f.lignes.forEach((l, i) => {
        const c = getLine(store.couts, f, i);
        const cp = c.lieu === "interne" ? l.pu : c.cout !== "" ? parseFloat(c.cout) : NaN;
        const lineCA = l.mt * sign;
        if (c.lieu && !isNaN(cp)) {
          const coutT = l.qte * cp;
          byClient[k].cout += coutT;
          byClient[k].hasCost = true;
          const kk = c.lieu as "interne" | "faconnier";
          agg[kk].ca += lineCA;
          agg[kk].cout += coutT;
          agg[kk].pcs += l.qte;
          agg[kk].n++;
          if (c.lieu === "faconnier" && c.fac) {
            if (!byFacon[c.fac]) byFacon[c.fac] = { n: 0, pcs: 0, ca: 0, cout: 0 };
            byFacon[c.fac].n++;
            byFacon[c.fac].pcs += l.qte;
            byFacon[c.fac].ca += lineCA;
            byFacon[c.fac].cout += coutT;
          }
        } else {
          agg.nd.ca += lineCA;
          agg.nd.pcs += l.qte;
          agg.nd.n++;
        }
      });
    });

  const maxP = Math.max(agg.interne.ca, agg.faconnier.ca, agg.nd.ca) || 1;
  const clientsM = Object.entries(byClient)
    .filter(([, v]) => v.hasCost)
    .map(([k, v]) => [k, v.ca - v.fourn - v.cout] as [string, number])
    .sort((a, b) => b[1] - a[1]);
  const maxCM = Math.max(...clientsM.map((x) => Math.abs(x[1])), 1);

  return (
    <div className="page">
      <div className="kpi-grid" style={{ gridTemplateColumns: "repeat(3,1fr)" }}>
        <div className="kpi-card">
          <div className="kpi-label">Production interne DBS</div>
          <div className="kpi-value" style={{ color: "var(--navy)" }}>
            {nb(agg.interne.ca)} €
          </div>
          <div className="kpi-sub">
            {agg.interne.n} articles · {nbI(agg.interne.pcs)} pcs · marge {nb(agg.interne.ca - agg.interne.cout)} €
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Sous-traité façonniers</div>
          <div className="kpi-value gold">{nb(agg.faconnier.ca)} €</div>
          <div className="kpi-sub">
            {agg.faconnier.n} articles · {nbI(agg.faconnier.pcs)} pcs · marge {nb(agg.faconnier.ca - agg.faconnier.cout)} €
          </div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Non renseigné</div>
          <div className="kpi-value" style={{ color: "var(--slate)" }}>
            {nb(agg.nd.ca)} €
          </div>
          <div className="kpi-sub">{agg.nd.n} articles à classer («Marges par facture»)</div>
        </div>
      </div>

      <div className="chart-grid">
        <div className="chart-card">
          <div className="chart-title">CA par lieu de production (articles renseignés)</div>
          {(
            [
              ["Interne DBS", agg.interne.ca, "var(--navy)"],
              ["Façonniers", agg.faconnier.ca, "var(--gold)"],
              ["Non renseigné", agg.nd.ca, "#C5C0B6"],
            ] as [string, number, string][]
          ).map(([label, val, color]) => (
            <div className="bar-row" key={label}>
              <div className="bar-label">{label}</div>
              <div className="bar-track">
                <div className="bar-fill" style={{ width: `${((val / maxP) * 100).toFixed(1)}%`, background: color }} />
              </div>
              <div className="bar-value">{nb(val)} €</div>
            </div>
          ))}
          {agg.interne.ca + agg.faconnier.ca > 0 && (
            <div style={{ marginTop: 10, fontSize: 11, color: "var(--slate)" }}>
              Part façonniers : {((agg.faconnier.ca / (agg.interne.ca + agg.faconnier.ca)) * 100).toFixed(1)}% du CA renseigné
            </div>
          )}
        </div>
        <div className="chart-card">
          <div className="chart-title">Marge par client (articles renseignés)</div>
          {clientsM.length ? (
            clientsM.map(([k, v]) => (
              <div className="bar-row" key={k}>
                <div className="bar-label">{CLIENT_NAMES[k] || k}</div>
                <div className="bar-track">
                  <div
                    className="bar-fill"
                    style={{ width: `${((Math.abs(v) / maxCM) * 100).toFixed(1)}%`, background: v >= 0 ? "var(--green)" : "var(--red)" }}
                  />
                </div>
                <div className="bar-value">{nb(v)} €</div>
              </div>
            ))
          ) : (
            <div style={{ fontSize: 13, color: "var(--slate)" }}>
              Ouvrez des factures dans «Marges par facture» et renseignez les coûts pour alimenter ce graphique.
            </div>
          )}
        </div>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Synthèse par façonnier</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Façonnier</th>
              <th>Articles</th>
              <th>Pièces</th>
              <th>CA facturé</th>
              <th>Coût façon payé</th>
              <th>Marge dégagée</th>
              <th>Coût moyen/pc</th>
            </tr>
          </thead>
          <tbody>
            {Object.keys(byFacon).length ? (
              Object.entries(byFacon)
                .sort((a, b) => b[1].ca - a[1].ca)
                .map(([k, v]) => (
                  <tr key={k}>
                    <td>
                      <strong>{k}</strong>
                    </td>
                    <td className="mono">{v.n}</td>
                    <td className="mono">{nbI(v.pcs)}</td>
                    <td className="mono">{nb(v.ca)} €</td>
                    <td className="mono">{nb(v.cout)} €</td>
                    <td className={`mono ${v.ca - v.cout >= 0 ? "pos" : "neg"}`}>{nb(v.ca - v.cout)} €</td>
                    <td className="mono">{v.pcs ? nb(v.cout / v.pcs) + " €" : "—"}</td>
                  </tr>
                ))
            ) : (
              <tr>
                <td colSpan={7} style={{ textAlign: "center", color: "var(--slate)", padding: 20 }}>
                  Affectez vos articles à un façonnier (SAJ, KMZ, ANIRATEX, IDEAL, TWINTEX…) dans «Marges par facture»
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-wrap">
        <div className="table-header">
          <div className="table-title">Synthèse par client</div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Client</th>
              <th>Factures</th>
              <th>Pièces</th>
              <th>CA net (€)</th>
              <th>Fournitures (€)</th>
              <th>Coûts saisis (€)</th>
              <th>Marge (€)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(byClient)
              .sort((a, b) => b[1].ca - a[1].ca)
              .map(([k, v]) => {
                const marge = v.hasCost ? v.ca - v.fourn - v.cout : null;
                return (
                  <tr key={k}>
                    <td>
                      <strong>{CLIENT_NAMES[k] || k}</strong>
                    </td>
                    <td className="mono">{v.n}</td>
                    <td className="mono">{nbI(v.pcs)}</td>
                    <td className="mono" style={{ fontWeight: 600 }}>
                      {nb(v.ca)} €
                    </td>
                    <td className="mono">{nb(v.fourn)} €</td>
                    <td className="mono">{v.hasCost ? nb(v.cout) + " €" : "—"}</td>
                    <td>
                      {marge !== null ? (
                        <span className={marge >= 0 ? "pos" : "neg"}>{nb(marge)} €</span>
                      ) : (
                        <span style={{ color: "var(--slate)" }}>à renseigner</span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ═══════════════════ RAPPORTS ═══════════════════ */
function Rapports({ store }: { store: FactStore }) {
  const all = store.all();
  const clients = [...new Set(all.map((f) => f.client))];
  const [type, setType] = useState("synthese");
  const [client, setClient] = useState(clients[0] || "");
  const [mois, setMois] = useState("");
  const [html, setHtml] = useState("");

  const generate = () => setHtml(buildReportHTML(type, mois, all, store.couts, client));

  const moisOpts = ["01", "02", "03", "04", "05", "06", "07", "08", "09", "10", "11", "12"];
  const moisNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  return (
    <div className="page">
      <div style={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 10, padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap" }}>
          <div className="form-group" style={{ minWidth: 240 }}>
            <label>Type de rapport</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="synthese">Synthèse générale</option>
              <option value="clients">Rapport par client (CA, pièces, PMP)</option>
              <option value="mensuel">Rapport mensuel</option>
              <option value="client_detail">Détail d&apos;un client (liste des factures)</option>
              <option value="faconniers">Rapport façonniers &amp; marges</option>
            </select>
          </div>
          {type === "client_detail" && (
            <div className="form-group" style={{ minWidth: 180 }}>
              <label>Client</label>
              <select value={client} onChange={(e) => setClient(e.target.value)}>
                {clients.map((c) => (
                  <option key={c} value={c}>
                    {CLIENT_NAMES[c] || c}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="form-group" style={{ minWidth: 160 }}>
            <label>Période</label>
            <select value={mois} onChange={(e) => setMois(e.target.value)}>
              <option value="">Année 2026 complète</option>
              {moisOpts.map((m, i) => (
                <option key={m} value={m}>
                  {moisNames[i]}
                </option>
              ))}
            </select>
          </div>
          <button className="btn btn-primary" onClick={generate}>
            Générer le rapport
          </button>
          <button
            className="btn btn-gold"
            disabled={!html}
            onClick={() => printDocument(html, "report", "Rapport DBS Fashion")}
          >
            🖨 Imprimer / PDF
          </button>
        </div>
      </div>
      {html ? (
        <div className="report-doc" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <div className="info-box">Choisissez un type de rapport et une période, puis cliquez sur « Générer le rapport ».</div>
      )}
    </div>
  );
}
