import ExcelJS from "exceljs";
import { formatVentilation } from "@/lib/domain/stock-taille";
import type { CommandeMagasin } from "@/lib/services/magasin-vue";

/* « ÉTAT DU STOCK » du magasin produits finis, par client (Excel) : de quoi
 * l'imprimer ou l'envoyer. Aucune colonne ne nomme un atelier extérieur ; la
 * valeur en € n'apparaît que pour la direction. */

const VERT = "FFE2EFDA";
const fin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FFBFBFBF" } };
const cadre: Partial<ExcelJS.Borders> = { top: fin, left: fin, bottom: fin, right: fin };
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : "");

export async function excelEtatStock(commandes: CommandeMagasin[], o: { avecValeur: boolean; titre: string }): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("État du stock", { pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 } });
  const cols = [
    { h: "OF", w: 14 },
    { h: "Modèle", w: 22 },
    { h: "Référence", w: 16 },
    { h: "Couleur", w: 14 },
    { h: "Commandé", w: 11 },
    { h: "Expédié", w: 11 },
    { h: "En stock", w: 11 },
    { h: "Stock par taille", w: 38 },
    { h: "Départ prévu", w: 13 },
    ...(o.avecValeur ? [{ h: "Valeur (€)", w: 13 }] : []),
  ];
  cols.forEach((c, i) => (ws.getColumn(i + 1).width = c.w));
  ws.mergeCells(1, 1, 1, cols.length);
  ws.getCell(1, 1).value = o.titre;
  ws.getCell(1, 1).font = { bold: true, size: 14 };
  ws.getCell(2, 1).value = `Au ${new Date().toLocaleDateString("fr-FR")} — STE DBS FASHION`;
  ws.getCell(2, 1).font = { italic: true, color: { argb: "FF7030A0" } };

  let r = 4;
  const parClient = new Map<string, CommandeMagasin[]>();
  for (const c of commandes) parClient.set(c.client || "Sans client", [...(parClient.get(c.client || "Sans client") ?? []), c]);
  let total = 0;
  let totalValeur = 0;
  for (const [client, cs] of [...parClient].sort((a, b) => a[0].localeCompare(b[0], "fr"))) {
    ws.mergeCells(r, 1, r, cols.length);
    const t = ws.getCell(r, 1);
    t.value = client;
    t.font = { bold: true, size: 12 };
    for (let i = 1; i <= cols.length; i++) ws.getCell(r, i).fill = { type: "pattern", pattern: "solid", fgColor: { argb: VERT } };
    r++;
    cols.forEach((c, i) => {
      const x = ws.getCell(r, i + 1);
      x.value = c.h;
      x.font = { bold: true };
      x.border = cadre;
      x.alignment = { horizontal: "center" };
    });
    r++;
    let sous = 0;
    let sousValeur = 0;
    for (const c of cs) {
      const st = c.stockTaille;
      const tailles = [formatVentilation(st.parTaille), st.nonVentile > 0 ? `${st.nonVentile} sans taille` : ""].filter(Boolean).join(" · ");
      const val = Math.round(c.stockQte * (c.prixVente ?? 0) * 100) / 100;
      const ligne = [c.of, c.modele, c.refArticle, c.couleur, c.qte, c.expedieQte, c.stockQte, tailles, dateFr(c.datePlan), ...(o.avecValeur ? [val] : [])];
      ligne.forEach((v, i) => {
        const x = ws.getCell(r, i + 1);
        x.value = v;
        x.border = cadre;
        if (typeof v === "number") x.numFmt = i === 9 ? '#,##0.00 "€"' : "#,##0";
      });
      ws.getCell(r, 7).font = { bold: true };
      sous += c.stockQte;
      sousValeur += val;
      r++;
    }
    ws.getCell(r, 6).value = "Total";
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 7).value = sous;
    ws.getCell(r, 7).font = { bold: true };
    ws.getCell(r, 7).numFmt = "#,##0";
    if (o.avecValeur) {
      ws.getCell(r, 10).value = Math.round(sousValeur * 100) / 100;
      ws.getCell(r, 10).numFmt = '#,##0.00 "€"';
      ws.getCell(r, 10).font = { bold: true };
    }
    total += sous;
    totalValeur += sousValeur;
    r += 2;
  }
  if (parClient.size > 1) {
    ws.getCell(r, 6).value = "TOTAL MAGASIN";
    ws.getCell(r, 6).font = { bold: true };
    ws.getCell(r, 7).value = total;
    ws.getCell(r, 7).font = { bold: true, size: 12 };
    ws.getCell(r, 7).numFmt = "#,##0";
    if (o.avecValeur) {
      ws.getCell(r, 10).value = Math.round(totalValeur * 100) / 100;
      ws.getCell(r, 10).numFmt = '#,##0.00 "€"';
      ws.getCell(r, 10).font = { bold: true };
    }
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
