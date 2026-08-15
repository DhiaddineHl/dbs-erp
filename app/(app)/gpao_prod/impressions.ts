import {
  type GpaoState,
  type Modele,
  chObjJour,
  chRend,
  chRetTotal,
  chSortieTotal,
  cumulModele,
  findC,
  fmtDate,
} from "./store";

/* Les deux documents que l'agent de méthode sort réellement : la fiche d'un
 * modèle (sa traçabilité complète) et le récapitulatif de production. Ils
 * partagent la feuille de style A4 du rapport journalier. */

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const STYLE = `
  body{font-family:'Segoe UI',Arial,sans-serif;padding:10mm;font-size:11px;color:#000}
  h1{font-size:17px;text-align:center;margin:0 0 4px}
  .psub{text-align:center;font-size:11px;color:#444;margin-bottom:10px}
  .pmeta{display:flex;justify-content:space-between;border:1.5px solid #000;padding:6px 12px;margin-bottom:8px;font-size:11px;flex-wrap:wrap;gap:8px}
  table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}
  th,td{border:1px solid #555;padding:3px 4px;text-align:center}th{background:#e6e6e6;font-size:9px}
  tr.tot td{background:#eee;font-weight:800}
  .psig{display:flex;justify-content:space-between;margin-top:18px;font-size:11px}
  .psig div{width:30%;border-top:1px solid #000;padding-top:4px;text-align:center}
  @page{size:A4 landscape;margin:8mm}
`;

function imprimer(titre: string, corps: string) {
  const w = window.open("", "_blank", "width=1100,height=800");
  if (!w) return false;
  w.document.write(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(titre)}</title><style>${STYLE}</style></head><body>${corps}</body></html>`,
  );
  w.document.close();
  w.focus();
  setTimeout(() => w.print(), 250);
  return true;
}

const piedDePage = () =>
  `<div style="text-align:right;font-size:9px;color:#666;margin-top:8px">Imprimé le ${new Date().toLocaleString(
    "fr-FR",
  )} — GPAO DBS Fashion</div>`;

/** Fiche d'un modèle : le résumé, puis TOUTES ses journées avec leur cumul
 * roulant. C'est la pièce qu'on joint à un dossier de production. */
export function imprimerFicheModele(state: GpaoState, m: Modele): boolean {
  const jours = state.journees
    .filter((j) => j.modeleId === m.id)
    .sort((a, b) => a.date.localeCompare(b.date));
  const produit = cumulModele(state, m.id);
  const pct = m.qte > 0 ? Math.round((produit / m.qte) * 100) : 0;
  const reste = Math.max(m.qte - produit, 0);

  let totalRetouches = 0;
  let sommeRend = 0;
  let nbRend = 0;
  for (const j of jours) {
    totalRetouches += chRetTotal(j);
    const r = chRend(state, j);
    if (r) {
      sommeRend += r;
      nbRend++;
    }
  }
  const statut = m.archive ? "ARCHIVÉ" : pct >= 100 ? "TERMINÉ" : "EN COURS";

  let h = `<h1>FICHE DE PRODUCTION — SUIVI PAR MODÈLE</h1>`;
  h += `<div class="psub">DBS Fashion — Traçabilité complète du modèle · GPAO Production</div>`;
  h += `<div class="pmeta"><span><b>Modèle :</b> ${esc(m.nom)}</span><span><b>Réf :</b> ${esc(
    m.ref || "—",
  )}</span><span><b>Client :</b> ${esc(m.client || "—")}</span><span><b>SAM :</b> ${
    m.sam || 0
  } s</span><span><b>Statut :</b> ${statut}</span></div>`;

  h += `<table><thead><tr><th>Commandé</th><th>Produit</th><th>Reste</th><th>Avancement</th><th>Journées</th><th>Retouches</th><th>Rendement moyen</th><th>Première journée</th><th>Dernière journée</th></tr></thead><tbody><tr>`;
  h += `<td><b>${m.qte}</b></td><td><b>${produit}</b></td><td><b>${reste}</b></td><td><b>${pct} %</b></td>`;
  h += `<td>${jours.length}</td><td>${totalRetouches}</td><td>${nbRend ? Math.round(sommeRend / nbRend) + " %" : "—"}</td>`;
  h += `<td>${jours.length ? fmtDate(jours[0].date) : "—"}</td><td>${
    jours.length ? fmtDate(jours[jours.length - 1].date) : "—"
  }</td></tr></tbody></table>`;

  if (jours.length) {
    h += `<table><thead><tr><th>Date</th><th>Chaîne</th><th>Effectif</th><th>Heures</th><th>Objectif jour</th><th>Sortie</th><th>Écart</th><th>Rendement</th><th>Retouches</th><th>Cumul</th><th>État</th></tr></thead><tbody>`;
    let cumul = 0;
    for (const j of jours) {
      const c = findC(state, j.chaineId);
      const sortie = chSortieTotal(j);
      const objectif = chObjJour(state, j);
      const ecart = sortie - objectif;
      cumul += sortie;
      h += `<tr><td>${fmtDate(j.date)}</td><td>${esc(c?.nom ?? "?")}</td><td>${j.effectif}</td><td>${
        j.nbHeures
      }</td><td>${objectif}</td><td><b>${sortie}</b></td><td>${ecart >= 0 ? "+" : ""}${ecart}</td><td>${chRend(
        state,
        j,
      )} %</td><td>${chRetTotal(j)}</td><td><b>${cumul}</b></td><td>${j.cloture ? "Clôturée" : "En cours"}</td></tr>`;
    }
    h += `</tbody></table>`;
  } else {
    h += `<div style="font-size:11px;color:#666">Aucune journée enregistrée pour ce modèle.</div>`;
  }

  h += `<div class="psig"><div>Agent de méthode</div><div>Chef de chaîne</div><div>Direction production</div></div>`;
  h += piedDePage();
  return imprimer("Fiche modèle", h);
}

/** Résumé de production : une ligne par modèle, tel que la liste est filtrée
 * à l'écran — ce qu'on voit est ce qu'on imprime. */
export function imprimerResumeProduction(
  state: GpaoState,
  modeles: Modele[],
  libelleFiltre: string,
): boolean {
  if (!modeles.length) return false;

  let h = `<h1>RÉSUMÉ DE PRODUCTION PAR MODÈLE</h1>`;
  h += `<div class="psub">DBS Fashion — ${esc(libelleFiltre)} · ${modeles.length} modèle(s) · GPAO Production</div>`;
  h += `<table><thead><tr><th style="text-align:left">Modèle</th><th>Réf</th><th style="text-align:left">Client</th><th>Commandé</th><th>Produit</th><th>Reste</th><th>%</th><th>Journées</th><th>Moy./jour</th><th>Dernière activité</th><th>État</th></tr></thead><tbody>`;

  let totQte = 0;
  let totProd = 0;
  let totReste = 0;
  for (const m of modeles) {
    const produit = cumulModele(state, m.id);
    const pct = m.qte > 0 ? Math.round((produit / m.qte) * 100) : 0;
    const reste = Math.max(m.qte - produit, 0);
    const jours = state.journees.filter((j) => j.modeleId === m.id);
    const derniere = jours.reduce((d, j) => (j.date > d ? j.date : d), "");
    totQte += m.qte;
    totProd += produit;
    totReste += reste;
    h += `<tr><td style="text-align:left"><b>${esc(m.nom)}</b></td><td>${esc(m.ref || "—")}</td><td style="text-align:left">${esc(
      m.client || "—",
    )}</td><td>${m.qte}</td><td><b>${produit}</b></td><td>${reste}</td><td><b>${pct} %</b></td><td>${
      jours.length
    }</td><td>${jours.length ? Math.round(produit / jours.length) : 0}</td><td>${
      derniere ? fmtDate(derniere) : "—"
    }</td><td>${m.archive ? "Archivé" : pct >= 100 ? "Terminé" : "En cours"}</td></tr>`;
  }

  h += `<tr class="tot"><td style="text-align:left">TOTAL</td><td></td><td></td><td>${totQte}</td><td>${totProd}</td><td>${totReste}</td><td>${
    totQte ? Math.round((totProd / totQte) * 100) : 0
  } %</td><td colspan="4"></td></tr>`;
  h += `</tbody></table>`;
  h += piedDePage();
  return imprimer("Résumé de production", h);
}
