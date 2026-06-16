/* Pure HTML builders for the printable invoice document and the management
   reports. Kept framework-agnostic; rendered inline via dangerouslySetInnerHTML
   and re-used for printing in a popup window. */
import {
  CLIENT_NAMES,
  type Couts,
  type Facture,
  MOIS_FR,
  caNet,
  clientAnalysis,
  fdate,
  fid,
  getLine,
  montantEnLettres,
  nb,
  nbI,
} from "./store";

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/* ─────────── INVOICE DOCUMENT ─────────── */
export type FactureForm = {
  num: string;
  date: string;
  typeDoc: string;
  incoterm: string;
  clientNom: string;
  clientAdresse: string;
  livraison: string;
  paiement: string;
  poids: string;
  mp: string;
  colis: string;
  matieres: string;
  fournitures: number;
  shipping: number;
  lignes: { modele: string; desig: string; ref: string; couleur: string; qte: number; pu: number; mt: number }[];
};

export function buildFactureDocHTML(d: FactureForm): string {
  const rows = d.lignes.filter((r) => r.modele || r.qte);
  const totalHT = rows.reduce((s, r) => s + r.mt, 0) + d.fournitures + d.shipping;
  const pcs = rows.reduce((s, r) => s + r.qte, 0);
  const lettres = montantEnLettres(totalHT);

  let lignesHTML = rows
    .map(
      (r) =>
        `<tr><td><strong>${esc(r.modele)}</strong></td><td>${esc(r.desig)}</td><td>${esc(r.ref)}</td><td>${esc(
          r.couleur,
        )}</td><td class="c">${r.qte || ""}</td><td class="r">${r.pu ? nb(r.pu) : ""}</td><td class="r">${nb(
          r.mt,
        )} €</td></tr>`,
    )
    .join("");
  if (d.shipping > 0)
    lignesHTML += `<tr><td colspan="6" style="font-style:italic;color:#6B7589">Shipping</td><td class="r">${nb(
      d.shipping,
    )} €</td></tr>`;
  if (d.fournitures > 0)
    lignesHTML += `<tr><td colspan="6" style="font-style:italic;color:#6B7589">Fournitures Tunisie</td><td class="r">${nb(
      d.fournitures,
    )} €</td></tr>`;

  return `<div class="facture-doc"><div class="facture-stripe"></div><div class="facture-body">
    <div class="facture-header"><div class="facture-emetteur">
      <div class="company">STE DBS FASHION</div>
      <p>Diar Ben Salem - Beni Khiar 8060 - Nabeul, Tunisie<br>MF : 1802841E/A/M/000 — Tél : 20 210 211</p></div>
      <div class="facture-badge"><div class="num">${esc(d.typeDoc)} N° ${esc(d.num || "—")}</div><div class="date">Le ${fdate(
    d.date,
  )}</div><div style="font-size:9px;opacity:.6;margin-top:3px">${esc(d.incoterm)}</div></div></div>
    <div class="facture-clients">
      <div class="client-block"><div class="block-label">Facturé à</div><div class="client-name">${esc(
        d.clientNom || "—",
      )}</div><p>${esc(d.clientAdresse).replace(/\n/g, "<br>")}</p></div>
      <div class="client-block"><div class="block-label">Adresse de livraison</div><p>${esc(d.livraison).replace(
        /\n/g,
        "<br>",
      )}</p></div></div>
    <table class="facture-table"><thead><tr>
      <th style="width:130px">Nom du modèle</th><th style="width:75px">Désignation</th><th style="width:95px">Référence</th>
      <th style="width:95px">Couleur</th><th class="c" style="width:45px">Qté</th><th class="r" style="width:60px">P.U. €</th><th class="r" style="width:80px">Montant</th></tr></thead>
      <tbody>${lignesHTML}</tbody>
      <tfoot><tr><td colspan="4"><strong>TOTAL</strong></td><td class="c"><strong>${pcs}</strong></td><td></td><td class="r"><strong>${nb(
        totalHT,
      )} €</strong></td></tr></tfoot></table>
    <div class="lettres-block">LA PRÉSENTE FACTURE EST ARRÊTÉE À LA SOMME DE :<br>${esc(lettres).toUpperCase()}</div>
    <div class="facture-footer">
      <div class="footer-block"><div class="footer-title">Expédition</div><p>
        Poids : ${esc(d.poids || "—")}<br>Valeur Matière Première : ${esc(d.mp || "—")}<br>
        Nombre de colis : ${esc(d.colis || pcs + " Colis")}<br>Incoterm : ${esc(d.incoterm)}<br>Mode de paiement : ${esc(
    d.paiement,
  )}</p></div>
      <div class="footer-block"><div class="footer-title">Coordonnées bancaires</div>
        <p class="rib">RIB : TN59 0805 7021 0251 0024 8106<br>SWIFT : BIATTNTT — BANQUE BIAT</p></div></div>
    ${d.matieres ? `<div class="footer-matieres">${esc(d.matieres).split("\n").join("<br>")}</div>` : ""}
  </div></div>`;
}

/* ─────────── REPORTS ─────────── */
function reportHeader(titre: string, periode: string) {
  return (
    `<div style="display:flex;justify-content:space-between;align-items:flex-start">` +
    `<div><h1>DBS FASHION</h1><div class="r-sub">Diar Ben Salem - Beni Khiar 8060 - Nabeul — MF : 1802841E/A/M/000</div></div>` +
    `<div style="text-align:right;font-size:10px;color:#6B7589">Édité le ${fdate(
      new Date().toISOString().split("T")[0],
    )}</div></div>` +
    `<div style="font-size:15px;font-weight:800;margin-top:14px;text-transform:uppercase;letter-spacing:.5px">${esc(
      titre,
    )}</div>` +
    `<span class="r-period">${esc(periode)}</span>`
  );
}
const reportFooter = () =>
  `<div class="r-foot"><span>DBS Fashion — Document interne de gestion</span><span>Facturation export HT en euros</span></div>`;

export function buildReportHTML(
  type: string,
  mois: string,
  all: Facture[],
  couts: Couts,
  clientKey: string,
): string {
  const periode = mois ? `${MOIS_FR[mois]} 2026` : "Année 2026";
  const inPeriod = (f: Facture) => !mois || f.date.substring(5, 7) === mois;
  let html = "";

  if (type === "synthese") {
    const fs = all.filter((f) => f.type === "facture" && inPeriod(f));
    const avs = all.filter((f) => f.type === "avoir" && inPeriod(f));
    const ca = fs.reduce((s, f) => s + f.total, 0);
    const av = avs.reduce((s, f) => s + f.total, 0);
    const net = ca - av;
    const pcs = fs.reduce((s, f) => s + f.pieces, 0);
    const ana = clientAnalysis(all, mois || null);
    html =
      reportHeader("Synthèse générale de facturation", periode) +
      `<div class="r-kpis"><div class="r-kpi"><div class="l">CA net HT</div><div class="v">${nb(net)} €</div></div>` +
      `<div class="r-kpi"><div class="l">Factures / Avoirs</div><div class="v">${fs.length} / ${avs.length}</div></div>` +
      `<div class="r-kpi"><div class="l">Pièces livrées</div><div class="v">${nbI(pcs)}</div></div>` +
      `<div class="r-kpi"><div class="l">PMP global</div><div class="v">${nb(ana.tot.pmp)} €/pc</div></div></div>` +
      `<h2>Répartition par client</h2><table><thead><tr><th>Client</th><th class="r">Factures</th><th class="r">Pièces</th><th class="r">CA net €</th><th class="r">% CA</th><th class="r">PMP €/pc</th></tr></thead><tbody>` +
      ana.rows
        .map(
          (r) =>
            `<tr><td><strong>${esc(r.name)}</strong></td><td class="r">${r.n}</td><td class="r">${nbI(
              r.pcs,
            )}</td><td class="r">${nb(r.ca)}</td><td class="r">${r.pctCA.toFixed(1)}%</td><td class="r">${nb(
              r.pmp,
            )}</td></tr>`,
        )
        .join("") +
      `<tr class="total-row"><td>TOTAL</td><td class="r">${ana.tot.n}</td><td class="r">${nbI(
        ana.tot.pcs,
      )}</td><td class="r">${nb(ana.tot.ca)}</td><td class="r">100%</td><td class="r">${nb(ana.tot.pmp)}</td></tr>` +
      `</tbody></table>` +
      `<h2>Évolution mensuelle</h2><table><thead><tr><th>Mois</th><th class="r">Factures</th><th class="r">Pièces</th><th class="r">CA net €</th><th class="r">Cumul €</th></tr></thead><tbody>` +
      (() => {
        const byM: Record<string, { n: number; pcs: number; ca: number }> = {};
        all
          .filter((f) => f.type === "facture")
          .forEach((f) => {
            const mm = f.date.substring(5, 7);
            if (!byM[mm]) byM[mm] = { n: 0, pcs: 0, ca: 0 };
            byM[mm].n++;
            byM[mm].pcs += f.pieces;
            byM[mm].ca += f.total;
          });
        all
          .filter((f) => f.type === "avoir")
          .forEach((f) => {
            const mm = f.date.substring(5, 7);
            if (byM[mm]) byM[mm].ca -= f.total;
          });
        let cumul = 0;
        return Object.entries(byM)
          .sort()
          .map(([mm, v]) => {
            cumul += v.ca;
            return `<tr><td>${MOIS_FR[mm]}</td><td class="r">${v.n}</td><td class="r">${nbI(v.pcs)}</td><td class="r">${nb(
              v.ca,
            )}</td><td class="r">${nb(cumul)}</td></tr>`;
          })
          .join("");
      })() +
      `</tbody></table>` +
      reportFooter();
  }

  if (type === "clients") {
    const ana = clientAnalysis(all, mois || null);
    html =
      reportHeader("Rapport par client — CA, pièces, prix moyen pondéré", periode) +
      `<table><thead><tr><th>Client</th><th class="r">Factures</th><th class="r">Pièces</th><th class="r">CA net €</th><th class="r">% du CA</th><th class="r">PMP €/pc</th><th class="r">CA moy./facture €</th><th class="r">Fournitures €</th><th class="r">Fourn. % CA</th></tr></thead><tbody>` +
      ana.rows
        .map(
          (r) =>
            `<tr><td><strong>${esc(r.name)}</strong></td><td class="r">${r.n}</td><td class="r">${nbI(
              r.pcs,
            )}</td><td class="r">${nb(r.ca)}</td><td class="r">${r.pctCA.toFixed(1)}%</td><td class="r">${nb(
              r.pmp,
            )}</td><td class="r">${nb(r.caMoyen)}</td><td class="r">${nb(r.fourn)}</td><td class="r">${r.fournPct.toFixed(
              1,
            )}%</td></tr>`,
        )
        .join("") +
      `<tr class="total-row"><td>TOTAL</td><td class="r">${ana.tot.n}</td><td class="r">${nbI(
        ana.tot.pcs,
      )}</td><td class="r">${nb(ana.tot.ca)}</td><td class="r">100%</td><td class="r">${nb(
        ana.tot.pmp,
      )}</td><td class="r">${nb(ana.tot.caMoyen)}</td><td></td><td class="r">${ana.tot.fournPct.toFixed(1)}%</td></tr>` +
      `</tbody></table><div style="font-size:9.5px;color:#6B7589;margin-top:8px">PMP = prix moyen pondéré par les quantités : Σ(Quantité × P.U.) ÷ Σ(Quantités). Les avoirs sont déduits du CA net.</div>` +
      reportFooter();
  }

  if (type === "mensuel") {
    const fs = all.filter((f) => f.type !== "proforma" && inPeriod(f)).sort((a, b) => a.date.localeCompare(b.date));
    const tot = fs.reduce((s, f) => s + caNet(f), 0);
    const pcs = fs.filter((f) => f.type === "facture").reduce((s, f) => s + f.pieces, 0);
    html =
      reportHeader("Rapport mensuel — liste des factures", periode) +
      `<div class="r-kpis"><div class="r-kpi"><div class="l">Documents</div><div class="v">${fs.length}</div></div>` +
      `<div class="r-kpi"><div class="l">CA net</div><div class="v">${nb(tot)} €</div></div>` +
      `<div class="r-kpi"><div class="l">Pièces</div><div class="v">${nbI(pcs)}</div></div>` +
      `<div class="r-kpi"><div class="l">PMP</div><div class="v">${pcs ? nb(tot / pcs) : "—"} €/pc</div></div></div>` +
      `<table><thead><tr><th>N°</th><th>Date</th><th>Client</th><th>Type</th><th class="r">Pièces</th><th class="r">Fournitures €</th><th class="r">Montant HT €</th></tr></thead><tbody>` +
      fs
        .map(
          (f) =>
            `<tr><td>${fid(f)}</td><td>${fdate(f.date)}</td><td>${esc(
              CLIENT_NAMES[f.client] || f.client,
            )}</td><td>${f.type === "avoir" ? "Avoir" : "Facture"}</td><td class="r">${nbI(
              f.pieces,
            )}</td><td class="r">${f.fournitures ? nb(f.fournitures) : "—"}</td><td class="r">${
              f.type === "avoir" ? "−" : ""
            }${nb(f.total)}</td></tr>`,
        )
        .join("") +
      `<tr class="total-row"><td colspan="4">TOTAL NET</td><td class="r">${nbI(pcs)}</td><td></td><td class="r">${nb(
        tot,
      )}</td></tr></tbody></table>` +
      reportFooter();
  }

  if (type === "client_detail") {
    const fs = all
      .filter((f) => f.client === clientKey && f.type !== "proforma" && inPeriod(f))
      .sort((a, b) => a.date.localeCompare(b.date));
    const tot = fs.reduce((s, f) => s + caNet(f), 0);
    const pcs = fs.filter((f) => f.type === "facture").reduce((s, f) => s + f.pieces, 0);
    let sQP = 0;
    let sQ = 0;
    fs.filter((f) => f.type === "facture").forEach((f) =>
      f.lignes.forEach((l) => {
        if (l.qte > 0 && l.pu > 0) {
          sQP += l.qte * l.pu;
          sQ += l.qte;
        }
      }),
    );
    html =
      reportHeader("Relevé client — " + (CLIENT_NAMES[clientKey] || clientKey), periode) +
      `<div class="r-kpis"><div class="r-kpi"><div class="l">Documents</div><div class="v">${fs.length}</div></div>` +
      `<div class="r-kpi"><div class="l">CA net</div><div class="v">${nb(tot)} €</div></div>` +
      `<div class="r-kpi"><div class="l">Pièces</div><div class="v">${nbI(pcs)}</div></div>` +
      `<div class="r-kpi"><div class="l">PMP</div><div class="v">${sQ ? nb(sQP / sQ) : "—"} €/pc</div></div></div>` +
      `<table><thead><tr><th>N°</th><th>Date</th><th>Modèles</th><th class="r">Pièces</th><th class="r">Fournit. €</th><th class="r">Montant HT €</th></tr></thead><tbody>` +
      fs
        .map(
          (f) =>
            `<tr><td>${fid(f)}</td><td>${fdate(f.date)}</td><td style="font-size:9.5px">${esc(
              [...new Set(f.lignes.map((l) => l.modele))].slice(0, 4).join(", ") || "—",
            )}</td><td class="r">${nbI(f.pieces)}</td><td class="r">${
              f.fournitures ? nb(f.fournitures) : "—"
            }</td><td class="r">${f.type === "avoir" ? "−" : ""}${nb(f.total)}</td></tr>`,
        )
        .join("") +
      `<tr class="total-row"><td colspan="3">TOTAL NET</td><td class="r">${nbI(pcs)}</td><td></td><td class="r">${nb(
        tot,
      )}</td></tr></tbody></table>` +
      reportFooter();
  }

  if (type === "faconniers") {
    const byFacon: Record<string, { n: number; pcs: number; ca: number; cout: number }> = {};
    const agg = {
      interne: { ca: 0, cout: 0, pcs: 0 },
      faconnier: { ca: 0, cout: 0, pcs: 0 },
      nd: { ca: 0, pcs: 0 },
    };
    all
      .filter((f) => f.type !== "proforma" && inPeriod(f))
      .forEach((f) => {
        const sign = f.type === "avoir" ? -1 : 1;
        f.lignes.forEach((l, i) => {
          const c = getLine(couts, f, i);
          const cp = c.lieu === "interne" ? l.pu : c.cout !== "" ? parseFloat(c.cout) : NaN;
          if (c.lieu && !isNaN(cp)) {
            const k = c.lieu as "interne" | "faconnier";
            agg[k].ca += l.mt * sign;
            agg[k].cout += l.qte * cp;
            agg[k].pcs += l.qte;
            if (c.lieu === "faconnier" && c.fac) {
              if (!byFacon[c.fac]) byFacon[c.fac] = { n: 0, pcs: 0, ca: 0, cout: 0 };
              byFacon[c.fac].n++;
              byFacon[c.fac].pcs += l.qte;
              byFacon[c.fac].ca += l.mt * sign;
              byFacon[c.fac].cout += l.qte * cp;
            }
          } else {
            agg.nd.ca += l.mt * sign;
            agg.nd.pcs += l.qte;
          }
        });
      });
    html =
      reportHeader("Rapport façonniers & marges de sous-traitance", periode) +
      `<div class="r-kpis"><div class="r-kpi"><div class="l">CA interne</div><div class="v">${nb(agg.interne.ca)} €</div></div>` +
      `<div class="r-kpi"><div class="l">CA façonniers</div><div class="v">${nb(agg.faconnier.ca)} €</div></div>` +
      `<div class="r-kpi"><div class="l">Marge sur façon</div><div class="v">${nb(
        agg.faconnier.ca - agg.faconnier.cout,
      )} €</div></div>` +
      `<div class="r-kpi"><div class="l">Non renseigné</div><div class="v">${nb(agg.nd.ca)} €</div></div></div>` +
      `<h2>Détail par façonnier</h2>` +
      `<table><thead><tr><th>Façonnier</th><th class="r">Articles</th><th class="r">Pièces</th><th class="r">CA facturé €</th><th class="r">Coût façon €</th><th class="r">Marge €</th><th class="r">Marge %</th><th class="r">Coût moy./pc</th></tr></thead><tbody>` +
      (Object.keys(byFacon).length
        ? Object.entries(byFacon)
            .sort((a, b) => b[1].ca - a[1].ca)
            .map(([k, v]) => {
              const mg = v.ca - v.cout;
              return `<tr><td><strong>${esc(k)}</strong></td><td class="r">${v.n}</td><td class="r">${nbI(
                v.pcs,
              )}</td><td class="r">${nb(v.ca)}</td><td class="r">${nb(v.cout)}</td><td class="r">${nb(
                mg,
              )}</td><td class="r">${v.ca ? ((mg / v.ca) * 100).toFixed(1) : "—"}%</td><td class="r">${
                v.pcs ? nb(v.cout / v.pcs) : "—"
              }</td></tr>`;
            })
            .join("")
        : `<tr><td colspan="8" style="text-align:center;color:#6B7589">Aucune saisie façonnier — renseignez les articles dans «Marges par facture»</td></tr>`) +
      `</tbody></table><div style="font-size:9.5px;color:#6B7589;margin-top:8px">Basé sur vos saisies article par article. La production interne est valorisée au prix facturé (marge nulle par convention).</div>` +
      reportFooter();
  }

  return html;
}

/* ─────────── PRINT WINDOW ─────────── */
const FACTURE_CSS = `
  body{font-family:'Inter',Arial,sans-serif;background:#fff;margin:0;padding:10px;color:#0F1F3D}
  .facture-doc{background:#fff;width:794px;margin:0 auto;position:relative;overflow:hidden;font-size:11px}
  .facture-stripe{position:absolute;left:0;top:0;bottom:0;width:6px;background:#0F1F3D}
  .facture-body{padding:34px 40px 34px 46px}
  .facture-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px}
  .company{font-size:15px;font-weight:800;letter-spacing:.5px}
  .facture-emetteur p{font-size:10px;color:#6B7589;line-height:1.6;margin-top:4px}
  .facture-badge{background:#0F1F3D;color:#fff;padding:8px 18px;border-radius:6px;text-align:right}
  .facture-badge .num{font-size:16px;font-weight:800;font-family:monospace;letter-spacing:.5px}
  .facture-badge .date{font-size:10px;opacity:.7;margin-top:2px}
  .facture-clients{display:grid;grid-template-columns:1fr 1fr;gap:18px;background:#FAFAF8;border-radius:8px;padding:14px 16px;margin-bottom:20px}
  .block-label{font-size:9px;text-transform:uppercase;letter-spacing:1.5px;color:#6B7589;margin-bottom:5px;font-weight:700}
  .client-name{font-size:12px;font-weight:700;margin-bottom:3px}
  .client-block p{font-size:10px;color:#6B7589;line-height:1.5}
  .facture-table{width:100%;border-collapse:collapse;margin-bottom:18px}
  .facture-table thead tr{background:#0F1F3D}
  .facture-table thead th{padding:8px 10px;color:rgba(255,255,255,.85);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;text-align:left}
  .facture-table th.r{text-align:right}.facture-table th.c{text-align:center}
  .facture-table tbody td{padding:7px 10px;font-size:10px;border-bottom:1px solid #E2DDD5}
  .facture-table tbody tr:nth-child(even) td{background:#FAFAF8}
  .facture-table td.r{text-align:right;font-family:monospace}.facture-table td.c{text-align:center}
  .facture-table tfoot td{padding:8px 10px;font-weight:700;font-size:11px;border-top:2px solid #0F1F3D}
  .lettres-block{background:#FAFAF8;border-left:4px solid #C9A227;border-radius:0 6px 6px 0;padding:9px 14px;font-size:10px;font-style:italic;font-weight:600;margin-bottom:14px}
  .facture-footer{display:grid;grid-template-columns:1fr 1fr;gap:16px;border-top:1px solid #E2DDD5;padding-top:12px}
  .footer-title{font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#6B7589;margin-bottom:5px}
  .footer-block p{font-size:9px;color:#6B7589;line-height:1.6}
  .rib{font-family:monospace;font-size:9px;font-weight:600;color:#0F1F3D}
  .footer-matieres{font-size:8.5px;color:#6B7589;margin-top:10px;padding-top:8px;border-top:1px dashed #E2DDD5;line-height:1.6}
  @page{size:A4;margin:8mm}
`;
const REPORT_CSS = `
  body{font-family:'Inter',Arial,sans-serif;background:#fff;margin:0;padding:10px;color:#0F1F3D}
  .report-doc{background:#fff;width:794px;margin:0 auto;padding:36px 42px;font-size:12px}
  .report-doc h1{font-size:18px;font-weight:800;letter-spacing:.5px;margin:0 0 2px}
  .r-sub{font-size:11px;color:#6B7589;margin-bottom:4px}
  .r-period{display:inline-block;background:#0F1F3D;color:#fff;font-size:11px;font-weight:600;padding:4px 12px;border-radius:20px;margin:10px 0 18px}
  .report-doc h2{font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;margin:22px 0 10px;padding-bottom:6px;border-bottom:2px solid #0F1F3D}
  .report-doc table{width:100%;border-collapse:collapse;margin-bottom:8px}
  .report-doc th{background:#FAFAF8;padding:7px 9px;font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:#6B7589;border:1px solid #E2DDD5;text-align:left}
  .report-doc th.r{text-align:right}
  .report-doc td{padding:6px 9px;font-size:10.5px;border:1px solid #E2DDD5}
  .report-doc td.r{text-align:right;font-family:monospace;font-size:10px}
  .report-doc tr.total-row td{font-weight:700;background:#FAFAF8}
  .r-foot{margin-top:24px;padding-top:10px;border-top:1px solid #E2DDD5;font-size:9px;color:#6B7589;display:flex;justify-content:space-between}
  .r-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}
  .r-kpi{background:#FAFAF8;border:1px solid #E2DDD5;border-radius:8px;padding:10px 12px}
  .r-kpi .l{font-size:9px;text-transform:uppercase;letter-spacing:1px;color:#6B7589}
  .r-kpi .v{font-size:15px;font-weight:700;font-family:monospace;margin-top:2px}
  @page{size:A4;margin:8mm}
`;

export function printDocument(innerHTML: string, kind: "facture" | "report", title: string) {
  const w = window.open("", "_blank", "width=900,height=1000");
  if (!w) return;
  const css = kind === "facture" ? FACTURE_CSS : REPORT_CSS;
  const wrapped = kind === "report" ? `<div class="report-doc">${innerHTML}</div>` : innerHTML;
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${css}</style></head><body>${wrapped}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 300);
}
