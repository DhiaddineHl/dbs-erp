import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleModele, manques, niveauRelance, prevuNomenclature, type LigneManque } from "./fournitures";

describe("nomenclature fournitures", () => {
  it("clé modèle : référence d'abord, sans accents ni casse", () => {
    assert.equal(cleModele(" REF-12 ", "Chemise"), "ref-12");
    assert.equal(cleModele("", "Chemise  Évasée"), "chemise evasee");
  });
  it("prévu = qté/pièce × pièces × (1 + casse), arrondi au-dessus", () => {
    assert.equal(prevuNomenclature(7, 1200, 3), 8652);
    assert.equal(prevuNomenclature(1, 333, 2.5), 342); // 341,33 → 342 boutons
    assert.equal(prevuNomenclature(0.35, 100, 0, "m"), 35);
  });
});

describe("manques", () => {
  const l = (p: Partial<LigneManque>): LigneManque => ({
    ligneId: 1, commandeId: 1, of: "OF-1", modele: "M", client: "Kiabi", designation: "Bouton", unite: "pcs",
    origine: "client", fournisseur: "", qtePrevue: 100, qteRecue: 40, dateExport: "2026-10-10", ...p,
  });
  it("fourni client → demande au client ; acheté DBS → liste d'achat par fournisseur, cumulée", () => {
    const r = manques([
      l({}),
      l({ ligneId: 2, origine: "dbs", fournisseur: "Mercerie Sfax", designation: "Zip 18 cm", qtePrevue: 50, qteRecue: 0 }),
      l({ ligneId: 3, of: "OF-2", origine: "dbs", fournisseur: "Mercerie Sfax", designation: "zip 18 cm", qtePrevue: 30, qteRecue: 10 }),
      l({ ligneId: 4, qtePrevue: 10, qteRecue: 10 }),
    ]);
    assert.equal(r.demandes.length, 1);
    assert.equal(r.demandes[0].lignes[0].manque, 60);
    assert.deepEqual(r.achats[0].articles.map((a) => [a.qte, a.ofs]), [[70, ["OF-1", "OF-2"]]]);
  });
});

describe("relances", () => {
  it("fenêtre d'alerte avant l'export", () => {
    assert.equal(niveauRelance("2026-10-10", "2026-09-27", 21).niveau, "urgent");
    assert.equal(niveauRelance("2026-10-22", "2026-09-27", 21).niveau, "bientot");
    assert.equal(niveauRelance("2026-09-20", "2026-09-27", 21).niveau, "retard");
    assert.equal(niveauRelance("", "2026-09-27", 21).niveau, null);
  });
});
