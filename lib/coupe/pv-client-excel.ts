import ExcelJS from "exceljs";
import type { DonneesPvClient } from "@/lib/domain/pv-client";
import { total } from "@/lib/domain/pv-client";

/* Le fichier Excel « RÉSULTAT DE COUPE », sur le modèle de la fiche que les
 * clients nous envoient (ex. CANDICE / Claudie Pierlot) : même ordre, mêmes
 * intitulés, mêmes couleurs de bandeaux. Les cellules restent modifiables
 * (le client le reçoit, le complète au besoin et le signe). */

const VERT = "FFE2EFDA";
const BLEU = "FFDDEBF7";
const ROSE = "FFFCE4D6";
const JAUNE = "FFFFF2CC";
const VIOLET = "FF7030A0";
const BLEU_FONCE = "FF002060";
const fin: Partial<ExcelJS.Border> = { style: "thin", color: { argb: "FF000000" } };
const cadre: Partial<ExcelJS.Borders> = { top: fin, left: fin, bottom: fin, right: fin };
const plein = (argb: string): ExcelJS.Fill => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

export async function excelPvClient(d: DonneesPvClient): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = d.faconnier;
  const ws = wb.addWorksheet("Résultat de coupe", {
    pageSetup: { paperSize: 9, orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } },
  });
  const nbT = Math.max(1, d.tailles.length);
  // Colonnes : A marge, B-D libellés, E… tailles puis TOTAL ; au moins jusqu'à K.
  const derniere = Math.max(11, 5 + nbT); // 11 = K
  const largeurs: Record<number, number> = { 1: 4, 2: 11.3, 3: 23.9, 4: 10, 5: 10, 6: 10, 7: 13.7, 8: 17.6, 9: 13.4, 10: 11.7, 11: 13 };
  for (let c = 1; c <= derniere; c++) ws.getColumn(c).width = largeurs[c] ?? 11;
  ws.properties.defaultRowHeight = 15;

  const cell = (r: number, c: number) => ws.getCell(r, c);
  const fusion = (r1: number, c1: number, r2: number, c2: number) => {
    if (r1 !== r2 || c1 !== c2) ws.mergeCells(r1, c1, r2, c2);
    return cell(r1, c1);
  };
  const boite = (r: number, c1: number, c2: number, valeur: ExcelJS.CellValue, o: { gras?: boolean; centre?: boolean; fond?: string; couleur?: string; format?: string } = {}) => {
    const x = fusion(r, c1, r, c2);
    x.value = valeur;
    x.font = { name: "Calibri", size: 11, bold: !!o.gras, color: o.couleur ? { argb: o.couleur } : undefined };
    x.alignment = { horizontal: o.centre === false ? "left" : "center", vertical: "middle", wrapText: true };
    if (o.format) x.numFmt = o.format;
    for (let c = c1; c <= c2; c++) {
      cell(r, c).border = cadre;
      if (o.fond) cell(r, c).fill = plein(o.fond);
    }
    return x;
  };
  const note = (r: number, texte: string) => {
    const x = fusion(r, 2, r, 8);
    x.value = texte;
    x.font = { name: "Calibri", size: 11, bold: true, italic: true, color: { argb: VIOLET } };
  };
  const bandeau = (r: number, texte: string, centre = false) => {
    const x = fusion(r, 2, r, derniere);
    x.value = texte;
    x.font = { name: "Calibri", size: 11, bold: true };
    x.alignment = { horizontal: centre ? "center" : "left", vertical: "middle" };
    for (let c = 2; c <= derniere; c++) {
      cell(r, c).fill = plein(VERT);
      cell(r, c).border = { top: fin, bottom: fin };
    }
  };

  /* ── en-tête ── */
  const colInfo = derniere - 2; // libellés à droite (I sur le modèle)
  boite(1, colInfo, colInfo, "Façonnier", { gras: true, centre: false });
  boite(1, colInfo + 1, derniere, d.faconnier, { centre: false });
  boite(3, colInfo, colInfo, "Date Coupe", { gras: true, centre: false });
  boite(3, colInfo + 1, derniere, dateFr(d.dateCoupe), { centre: false });
  note(5, `Résultat de coupe établi par ${d.faconnier} — fiche ${d.numeroFiche}`);
  ws.getRow(1).height = 18;

  bandeau(7, "RESULTAT DE COUPE");
  boite(9, 2, 3, "Modèle", { gras: true });
  boite(9, 4, 6, d.modele, { couleur: BLEU_FONCE });
  boite(9, colInfo, colInfo, "Numéro d'OF", { gras: true, centre: false });
  boite(9, colInfo + 1, derniere, d.numeroOf, { centre: false });
  boite(10, 2, 3, "Référence", { gras: true });
  boite(10, 4, 6, d.reference, { couleur: BLEU_FONCE });

  const client = (d.client || "client").toUpperCase();
  boite(12, 2, 5, `Tissu Principal (REF TISSU ${client})`, { gras: true });
  boite(12, 6, 8, d.tissuPrincipal);
  boite(13, 2, 5, "Laize utile constatée à la coupe", { gras: true });
  boite(13, 6, 8, d.laize ? `${d.laize} m` : "");

  note(15, "Tableau des coupes effectuées");

  /* ── quantités par taille ── */
  const r0 = 17;
  d.tailles.forEach((t, i) => boite(r0, 5 + i, 5 + i, /^\d+$/.test(t) ? Number(t) : t, { gras: true }));
  boite(r0, 5 + nbT, 5 + nbT, "TOTAL", { gras: true });
  const ligneQ = (r: number, libelle: string, m: Record<string, number> | null) => {
    boite(r, 2, 4, libelle);
    d.tailles.forEach((t, i) => boite(r, 5 + i, 5 + i, m ? (m[t] ?? 0) : null, { format: "#,##0" }));
    boite(r, 5 + nbT, 5 + nbT, total(m, d.tailles), { gras: true, format: "#,##0" });
  };
  ligneQ(r0 + 1, "Quantités commandées", d.commandees);
  ligneQ(r0 + 2, "Quantités coupées", d.coupees);
  ligneQ(r0 + 3, "2ème choix", d.second);
  ws.getRow(r0 + 1).height = 14.4;
  ws.getRow(r0 + 2).height = 14.4;

  /* ── emploi tissu ── */
  bandeau(r0 + 4, "Emploi tissu pour cette coupe", true);
  const rt = r0 + 6;
  const entetes = [`Réf ${d.client || "client"}`, "Coloris", "Métrage reçu", "Emploi moyen", "Métrage utilisé", "Chutes + Défaut tissu + Manquant sur rlx", "N° Rouleau présentant défaut(s) tissu", "TOTAL", "Stock tissu après coupe"];
  entetes.forEach((h, i) => boite(rt, 3 + i, 3 + i, h, { gras: true }));
  ws.getRow(rt).height = 72;
  const m = '#,##0.00 "m"';
  let r = rt + 1;
  const tissus = d.tissus.length ? d.tissus : [null];
  tissus.forEach((t, i) => {
    boite(r, 2, 2, i === 0 ? "Tissu(s)" : "", { fond: BLEU });
    const u = t?.unite === "m" || !t ? m : `#,##0.00 "${t.unite}"`;
    const vals: [ExcelJS.CellValue, string?][] = t
      ? [[t.ref], [t.coloris], [t.recu, u], [t.emploiMoyen, "0.000"], [t.utilise, u], [t.chutes, u], [t.rouleauxDefaut], [t.total, u], [t.stockApres, u]]
      : [[null], [null], [null], [null], [null], [null], [null], [null], [null]];
    vals.forEach(([v, f], j) => boite(r, 3 + j, 3 + j, v, { fond: BLEU, format: f }));
    ws.getRow(r).height = 21.6;
    r++;
  });
  const autre = (libelle: string, a: { ref: string; emploiMoyen: number | null } | null, fond: string) => {
    boite(r, 2, 2, libelle, { fond, centre: false });
    for (let j = 0; j < 9; j++) boite(r, 3 + j, 3 + j, j === 0 ? (a?.ref ?? null) : j === 3 ? (a?.emploiMoyen ?? null) : null, { fond, format: j === 3 ? "0.000" : undefined });
    r++;
  };
  autre("Doublure", d.doublure, ROSE);
  autre("Thermo", d.thermo, JAUNE);
  for (const a of d.autres) autre(a.libelle, a, "FFFFFFFF");

  /* ── signatures ── */
  r += 1;
  boite(r, 2, 5, `Date et signature — ${d.faconnier}`, { gras: true, centre: false });
  boite(r, 6, derniere, "Visa client", { gras: true, centre: false });
  ws.getRow(r + 1).height = 45;
  boite(r + 1, 2, 5, "");
  boite(r + 1, 6, derniere, "");

  return Buffer.from(await wb.xlsx.writeBuffer());
}
