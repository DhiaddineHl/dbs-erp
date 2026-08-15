import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { apercuCommande, montantSaisi, quantiteSaisie } from "./commande";

/* Les règles de saisie du carnet de commandes.
 *
 * Ce qui est vérifié ici est ce qui décide d'un prix : la marge affichée
 * pendant la frappe et la règle DBS. Une erreur de virgule ou une marge
 * fantôme sur de l'interne se voit dans les KPI de la page. */

describe("montantSaisi", () => {
  it("lit les écritures françaises et anglaises", () => {
    assert.equal(montantSaisi("12,40"), 12.4);
    assert.equal(montantSaisi("12.40"), 12.4);
    assert.equal(montantSaisi("12,40 €"), 12.4);
  });

  it("supporte les séparateurs de milliers, espace fine comprise", () => {
    assert.equal(montantSaisi("1 200,50"), 1200.5);
    assert.equal(montantSaisi("1 200,50"), 1200.5);
    assert.equal(montantSaisi("1 200,50"), 1200.5);
  });

  it("distingue « pas de prix » de « prix nul »", () => {
    assert.equal(montantSaisi(""), null);
    assert.equal(montantSaisi("   "), null);
    assert.equal(montantSaisi(null), null);
    assert.equal(montantSaisi(undefined), null);
    assert.equal(montantSaisi("0"), 0);
  });

  it("refuse ce qui n'est pas un nombre plutôt que de rendre NaN", () => {
    assert.equal(montantSaisi("abc"), null);
    assert.equal(montantSaisi("12,4,5"), null);
  });
});

describe("quantiteSaisie", () => {
  it("fait primer la grille de tailles sur la quantité globale", () => {
    const grille = JSON.stringify([
      { taille: "S", qte: 100 },
      { taille: "M", qte: 250 },
      { taille: "L", qte: 50 },
    ]);
    assert.equal(quantiteSaisie(grille, "999"), 400);
  });

  it("retombe sur la quantité globale quand la grille est vide", () => {
    assert.equal(quantiteSaisie(JSON.stringify([{ taille: "S", qte: 0 }]), "800"), 800);
    assert.equal(quantiteSaisie("", "800"), 800);
    assert.equal(quantiteSaisie(null, null), 0);
  });

  it("ne casse pas sur une grille illisible", () => {
    assert.equal(quantiteSaisie("{pas du json", "120"), 120);
  });
});

describe("apercuCommande — sous-traitance", () => {
  const st = { faconnier: "ATELIER SUD", prixVente: "18,50", prixFacon: "6,20", qte: "1200" };

  it("calcule marge, CA et taux sur le prix façon saisi", () => {
    const a = apercuCommande(st);
    assert.equal(a.interne, false);
    assert.equal(a.qte, 1200);
    assert.equal(a.margeUnitaire, 12.3);
    assert.equal(a.margeTotale, 14760);
    assert.equal(a.ca, 22200);
    assert.equal(a.tauxPct, 66);
  });

  it("signale une marge négative sans la tronquer", () => {
    const a = apercuCommande({ ...st, prixVente: "5,00", prixFacon: "6,20" });
    assert.equal(a.margeUnitaire, -1.2);
    assert.equal(a.margeTotale, -1440);
    assert.equal(a.tauxPct, -24);
  });

  it("arrondit au centime plutôt que de laisser filer le flottant", () => {
    // 8,60 − 2,90 = 5,699999999999999 en double précision.
    const a = apercuCommande({ faconnier: "X", prixVente: "8,60", prixFacon: "2,90", qte: "2000" });
    assert.equal(a.margeUnitaire, 5.7);
    assert.equal(a.margeTotale, 11400);
  });
});

describe("apercuCommande — règle DBS", () => {
  it("traite un façonnier vide comme de l'interne, marge nulle", () => {
    const a = apercuCommande({ faconnier: "", prixVente: "18,50", prixFacon: "6,20", qte: "1000" });
    assert.equal(a.interne, true);
    assert.equal(a.prixFacon, 18.5, "le prix façon suit le prix de vente");
    assert.equal(a.margeUnitaire, 0);
    assert.equal(a.margeTotale, 0);
    assert.equal(a.tauxPct, 0);
    assert.equal(a.ca, 18500, "le CA reste celui de la vente");
  });

  it("reconnaît DBS et INTERNE quelle que soit la casse", () => {
    for (const f of ["DBS", "dbs", "Dbs", "INTERNE", "interne"]) {
      assert.equal(apercuCommande({ faconnier: f, prixVente: "10", prixFacon: "4" }).interne, true, f);
    }
  });

  it("traite une chaîne interne comme de l'interne, même avec un façonnier", () => {
    /* Le cas existe dans la base reprise : une commande portait à la fois une
     * chaîne et un façonnier. La chaîne tranche. */
    const a = apercuCommande({ faconnier: "ATELIER SUD", chaineId: "3", prixVente: "10", prixFacon: "4" });
    assert.equal(a.interne, true);
    assert.equal(a.margeUnitaire, 0);
  });

  it("ne confond pas un façonnier dont le nom contient DBS", () => {
    const a = apercuCommande({ faconnier: "DBS CONFECTION", prixVente: "10", prixFacon: "4" });
    assert.equal(a.interne, false);
    assert.equal(a.margeUnitaire, 6);
  });
});

describe("apercuCommande — bandeau vide", () => {
  it("se tait tant qu'aucun prix n'est saisi", () => {
    assert.equal(apercuCommande({}).vide, true);
    assert.equal(apercuCommande({ faconnier: "X", qte: "500" }).vide, true);
  });

  it("s'affiche dès qu'un prix apparaît", () => {
    assert.equal(apercuCommande({ faconnier: "X", prixVente: "10" }).vide, false);
    assert.equal(apercuCommande({ faconnier: "X", prixFacon: "4" }).vide, false);
  });

  it("un CA sans quantité vaut zéro, pas NaN", () => {
    const a = apercuCommande({ faconnier: "X", prixVente: "18,50" });
    assert.equal(a.qte, 0);
    assert.equal(a.ca, 0);
    assert.equal(a.margeTotale, 0);
    assert.equal(a.tauxPct, 100, "le taux reste celui du prix unitaire");
  });
});
