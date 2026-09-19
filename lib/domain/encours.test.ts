import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encoursCommande, encoursTotal } from "./encours";

describe("encours d'une commande", () => {
  it("dérive chaque étape d'une soustraction de compteurs", () => {
    const e = encoursCommande({ qte: 1000, coupeQte: 800, produit: 600, magasinQte: 400, factureQte: 300 });
    assert.equal(e.aLancer, 200); // 1000 - 800
    assert.equal(e.enProduction, 200); // 800 - 600
    assert.equal(e.attenteMagasin, 200); // 600 - 400
    assert.equal(e.enMagasin, 100); // 400 - 300
    assert.equal(e.totalEnCours, 700);
  });

  it("ne produit jamais d'encours négatif", () => {
    const e = encoursCommande({ qte: 100, coupeQte: 120, produit: 130, magasinQte: 90, factureQte: 100 });
    assert.equal(e.aLancer, 0);
    assert.equal(e.enProduction, 0);
    assert.equal(e.enMagasin, 0);
  });

  it("somme l'encours d'un ensemble de commandes", () => {
    const t = encoursTotal([
      { qte: 100, coupeQte: 100, produit: 50, magasinQte: 0, factureQte: 0 },
      { qte: 200, coupeQte: 100, produit: 100, magasinQte: 100, factureQte: 50 },
    ]);
    assert.equal(t.enProduction, 50 + 0);
    assert.equal(t.aLancer, 0 + 100);
    assert.equal(t.enMagasin, 0 + 50);
  });
});
