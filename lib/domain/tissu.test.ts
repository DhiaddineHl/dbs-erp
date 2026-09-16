import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bilanLot,
  statutLot,
  couvertureCommande,
  comparerBesoinReception,
  prochainIdentifiant,
} from "./tissu";

describe("bilanLot — reçu / affecté / consommé / disponible", () => {
  it("distingue affecté et consommé (exemple AUBER-01)", () => {
    // Reçu 350, affecté 150 (robe) + 100 (chemise) = 250, consommé 140.
    const b = bilanLot(
      350,
      [{ quantite: 150 }, { quantite: 100 }],
      [{ sens: "sortie", quantite: 140 }],
    );
    assert.equal(b.recu, 350);
    assert.equal(b.affecte, 250);
    assert.equal(b.consomme, 140);
    assert.equal(b.disponible, 210); // 350 − 140 physiquement en rayon
    assert.equal(b.libre, 100); // 350 − 250 encore réservable
  });

  it("un retour diminue le consommé net", () => {
    const b = bilanLot(100, [], [{ sens: "sortie", quantite: 40 }, { sens: "retour", quantite: 10 }]);
    assert.equal(b.consomme, 30);
    assert.equal(b.disponible, 70);
  });

  it("un ajustement d'inventaire corrige le disponible", () => {
    const b = bilanLot(100, [], [{ sens: "ajustement", quantite: -5 }]);
    assert.equal(b.disponible, 95);
  });
});

describe("statutLot", () => {
  it("épuisé quand plus rien en rayon", () => {
    assert.equal(statutLot(bilanLot(100, [], [{ sens: "sortie", quantite: 100 }])).kind, "epuise");
  });
  it("entièrement réservé quand libre = 0 mais stock présent", () => {
    assert.equal(statutLot(bilanLot(100, [{ quantite: 100 }], [])).kind, "reserve");
  });
  it("libre quand rien n'est affecté", () => {
    assert.equal(statutLot(bilanLot(100, [], [])).kind, "libre");
  });
});

describe("couvertureCommande", () => {
  it("besoin non affecté", () => {
    const c = couvertureCommande(3.45, [], []);
    assert.equal(c.statut.kind, "non_affecte");
    assert.equal(c.resteAAffecter, 3.45);
  });
  it("besoin couvert et reste à affecter négatif", () => {
    const c = couvertureCommande(2.1, [{ quantite: 3 }], [{ sens: "sortie", quantite: 2.3 }]);
    assert.equal(c.statut.kind, "couvert");
    assert.equal(c.affecte, 3);
    assert.equal(c.consomme, 2.3);
    assert.equal(c.resteAAffecter, -0.9);
  });
  it("partiellement couvert", () => {
    assert.equal(couvertureCommande(10, [{ quantite: 4 }], []).statut.kind, "partiel");
  });
});

describe("comparerBesoinReception — par couleur", () => {
  it("suffisant / manquant selon le reçu", () => {
    const r = comparerBesoinReception(
      [
        { couleur: "Aubergine", besoin: 2.1 },
        { couleur: "Aubergine", besoin: 1.35 },
        { couleur: "Marine", besoin: 1.4 },
      ],
      [
        { couleur: "aubergine", recu: 350 },
        { couleur: "MARINE", recu: 180 },
      ],
    );
    const auber = r.find((x) => x.couleur.toLowerCase() === "aubergine")!;
    assert.equal(auber.besoin, 3.45);
    assert.equal(auber.recu, 350);
    assert.equal(auber.statut.kind, "suffisant");
    const marine = r.find((x) => x.couleur.toLowerCase() === "marine")!;
    assert.equal(marine.statut.kind, "suffisant");
  });

  it("manquant quand rien reçu, partiel quand insuffisant", () => {
    const r = comparerBesoinReception(
      [{ couleur: "Rouge", besoin: 350 }, { couleur: "Bleu", besoin: 100 }],
      [{ couleur: "Rouge", recu: 300 }],
    );
    assert.equal(r.find((x) => x.couleur === "Rouge")!.statut.kind, "partiel");
    assert.equal(r.find((x) => x.couleur === "Bleu")!.statut.kind, "manquant");
  });
});

describe("prochainIdentifiant", () => {
  it("dérive de la couleur et incrémente", () => {
    assert.equal(prochainIdentifiant("Aubergine", []), "AUBER-01");
    assert.equal(prochainIdentifiant("Aubergine", ["AUBER-01"]), "AUBER-02");
    assert.equal(prochainIdentifiant("Marine", ["AUBER-01"]), "MARIN-01");
  });
  it("gère les accents et les couleurs vides", () => {
    assert.equal(prochainIdentifiant("Écru", []), "ECRU-01");
    assert.equal(prochainIdentifiant("", []), "LOT-01");
  });
});
