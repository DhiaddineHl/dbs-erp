import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bilanCapacite, capaciteChaineJour, capaciteChaineRendement, coutMoChaineJour } from "./capacite";

describe("capacité d'une chaîne", () => {
  it("dérive les pièces/jour du SAM et de l'effectif", () => {
    // 18 ouvrières × 8 h = 518 400 s ; SAM 1800 s/pc → 288 pièces/jour.
    assert.equal(capaciteChaineJour({ nom: "A", effectif: 18, nbHeures: 8, samSec: 1800 }), 288);
  });

  it("renvoie 0 quand le SAM est inconnu", () => {
    assert.equal(capaciteChaineJour({ nom: "A", effectif: 18, nbHeures: 8, samSec: 0 }), 0);
  });

  it("applique un rendement de référence", () => {
    assert.equal(capaciteChaineRendement({ nom: "A", effectif: 18, nbHeures: 8, samSec: 1800 }, 75), 216);
  });

  it("calcule le coût MO de la journée", () => {
    assert.equal(coutMoChaineJour({ nom: "A", effectif: 18, nbHeures: 8, samSec: 1800, coutHoraire: 8.5 }), Math.round(18 * 8 * 8.5));
  });
});

describe("bilan de capacité de l'atelier", () => {
  it("agrège théorique, attendu et coût MO", () => {
    const b = bilanCapacite(
      [
        { nom: "A", effectif: 18, nbHeures: 8, samSec: 1800, coutHoraire: 8 },
        { nom: "B", effectif: 20, nbHeures: 8, samSec: 1200, coutHoraire: 8 },
      ],
      75,
    );
    assert.equal(b.chaines, 2);
    assert.equal(b.capaciteTheoriqueJour, 288 + 480);
    assert.equal(b.capaciteAttendueJour, 216 + 360);
    assert.equal(b.coutMoJour, Math.round(18 * 8 * 8) + Math.round(20 * 8 * 8));
  });
});
