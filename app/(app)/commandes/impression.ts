import type { CommandeRow } from "@/lib/services/commandes";
import type { CleColonne } from "./colonnes";

/* Liste de commandes imprimable.
 *
 * Le point important : elle respecte les colonnes masquées à l'écran. C'est ce
 * qui permet de donner la liste à l'atelier sans les prix ni les marges — sans
 * cela, chacun réimprime depuis un tableur et la liste diverge. */

const esc = (s: unknown) =>
  String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dateFr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");

type Colonne = {
  cle: CleColonne;
  titre: string;
  droite?: boolean;
  valeur: (c: CommandeRow) => string;
};

const COLONNES: Colonne[] = [
  /* Une part est décalée sous sa mère plutôt que numérotée à part : sur
     papier il n'y a ni accordéon ni couleur de fond, et l'indentation est le
     seul signe qui reste pour dire « ces 400 pièces sont prises sur les
     1 200 du dessus » et non « voici 400 pièces de plus ». */
  { cle: "of", titre: "N° OF", valeur: (c) => (c.parentId != null ? "↳ " : "") + (c.of || "—") },
  { cle: "modele", titre: "Modèle", valeur: (c) => c.modele + (c.couleur ? ` — ${c.couleur}` : "") },
  { cle: "client", titre: "Client", valeur: (c) => c.client || "—" },
  { cle: "assigne", titre: "Assigné", valeur: (c) => c.faconnier || (c.chaine ? `${c.chaine} (interne)` : "Non assigné") },
  { cle: "qte", titre: "Qté", droite: true, valeur: (c) => nb.format(c.qte) },
  { cle: "prixVente", titre: "P. vente", droite: true, valeur: (c) => (c.prixVente == null ? "—" : `${dec.format(c.prixVente)} €`) },
  { cle: "prixFacon", titre: "P. façon", droite: true, valeur: (c) => (c.prixFacon == null ? "—" : `${dec.format(c.prixFacon)} €`) },
  { cle: "margeTotale", titre: "Marge", droite: true, valeur: (c) => `${dec.format(c.margeUnitaire)} €` },
  { cle: "dateExport", titre: "Export", valeur: (c) => dateFr(c.dateExport) },
  { cle: "retard", titre: "Retard", droite: true, valeur: (c) => c.retard[1] },
  { cle: "av", titre: "Avancement", droite: true, valeur: (c) => `${c.av} %` },
  { cle: "statut", titre: "Statut", valeur: (c) => c.statut[1] + (c.statutManuel ? " (forcé)" : "") },
];

export function imprimerSelection(lignes: CommandeRow[], masquees: ReadonlySet<CleColonne>): boolean {
  if (!lignes.length) return false;
  const cols = COLONNES.filter((c) => !masquees.has(c.cle));
  if (!cols.length) return false;

  /* Totaux en quantités et montants PROPRES : quand une commande découpée est
     imprimée avec ses parts, la mère ne compte que ce qu'elle produit
     elle-même. Sans cela le pied de page annoncerait deux fois les pièces
     réparties. Sur une liste sans découpe, le propre est le tout. */
  const totalQte = lignes.reduce((s, c) => s + c.qtePropre, 0);
  const totalCa = lignes.reduce((s, c) => s + c.caPropre, 0);
  const totalMarge = lignes.reduce((s, c) => s + c.margePropre, 0);
  const nbMeres = lignes.filter((c) => c.parentId == null).length;
  const nbParts = lignes.length - nbMeres;
  const montreQte = cols.some((c) => c.cle === "qte");
  const montrePrix = cols.some((c) => c.cle === "prixVente" || c.cle === "prixFacon" || c.cle === "margeTotale");

  const entetes = cols
    .map((c) => `<th style="text-align:${c.droite ? "right" : "left"}">${esc(c.titre)}</th>`)
    .join("");
  const corps = lignes
    .map(
      (l) =>
        `<tr${l.parentId != null ? ' class="part"' : ""}>` +
        cols.map((c) => `<td style="${c.droite ? "text-align:right" : ""}">${esc(c.valeur(l))}</td>`).join("") +
        "</tr>",
    )
    .join("");
  const totaux = cols
    .map((c) => {
      if (c.cle === "qte") return `<td style="text-align:right">${nb.format(totalQte)}</td>`;
      if (c.cle === "modele")
        return `<td>TOTAL ${nbMeres} commande(s)${nbParts ? ` + ${nbParts} sous-commande(s)` : ""}</td>`;
      return "<td></td>";
    })
    .join("");

  const sousTitre = [
    `Édité le ${new Date().toLocaleDateString("fr-FR")}`,
    `${nbMeres} commande(s)` + (nbParts ? ` · ${nbParts} sous-commande(s)` : ""),
    montreQte ? `${nb.format(totalQte)} pièces` : "",
    montrePrix ? `CA ${eur.format(totalCa)} €` : "",
    montrePrix ? `Marge ${eur.format(totalMarge)} €` : "",
  ]
    .filter(Boolean)
    .join(" · ");

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>Commandes sélectionnées — DBS Fashion</title><style>
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    body{font-family:Arial,Helvetica,sans-serif;color:#141b2d;margin:24px;font-size:12px}
    .top{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #141b2d;padding-bottom:10px;margin-bottom:14px}
    .co{font-size:15px;font-weight:800}h1{font-size:16px;margin:0}.sub{color:#667;font-size:11px}
    table{width:100%;border-collapse:collapse}
    th{background:#e8edf5;color:#000;border:1px solid #444;padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.4px}
    td{padding:5px 8px;border-bottom:1px solid #e3e8f0}
    tr:nth-child(even) td{background:#f7f9fc}
    tr.part td{color:#556;font-style:italic}
    tr.tot td{border-top:2px solid #000;background:#eef2f8;font-weight:700}
    @media print{@page{size:A4 landscape;margin:10mm}}
  </style></head><body>
    <div class="top">
      <div><div class="co">STE DBS FASHION</div><div class="sub">Diar Ben Salem, Beni Khiar, Nabeul</div></div>
      <div style="text-align:right"><h1>Liste de commandes</h1><div class="sub">${esc(sousTitre)}</div></div>
    </div>
    <table><thead><tr>${entetes}</tr></thead><tbody>${corps}<tr class="tot">${totaux}</tr></tbody></table>
    <p style="color:#889;font-size:10px;margin-top:16px">Document généré par PilotPro — DBS Fashion.</p>
  </body></html>`;

  const w = window.open("", "_blank");
  if (!w) return false;
  w.document.write(html);
  w.document.close();
  setTimeout(() => {
    w.focus();
    w.print();
  }, 350);
  return true;
}
