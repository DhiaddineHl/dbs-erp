import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { champsHorsCloture, erreurJournee, modifieProduction } from "./journee";

/* Ce qui protège une journée clôturée et bannit une production incohérente.
 *
 * Le rendement, le cumul et la capacité se lisent sur ces chiffres : une
 * quantité négative ou une journée clôturée modifiée en douce ne se voit pas à
 * l'écran, elle se voit dans les indicateurs, plus tard. */

describe("modifieProduction", () => {
  it("laisse passer un patch qui ne fait que (dé)clôturer", () => {
    assert.equal(modifieProduction({ cloture: true }), false);
    assert.equal(modifieProduction({ cloture: false }), false);
    assert.deepEqual(champsHorsCloture({ cloture: true }), []);
  });

  it("détecte toute modification de production", () => {
    assert.equal(modifieProduction({ sortie: { H1: 10 } }), true);
    assert.equal(modifieProduction({ cloture: true, sortie: { H1: 10 } }), true);
    assert.equal(modifieProduction({ effectif: 18 }), true);
  });
});

describe("erreurJournee", () => {
  it("accepte une saisie normale", () => {
    assert.equal(erreurJournee({ sortie: { H1: 40, H2: 55 }, effectif: 18, nbHeures: 8.5 }), null);
    assert.equal(erreurJournee({ ops: { 12: { H1: 5, H2: "RI", H3: "ABS" } } }), null);
    assert.equal(erreurJournee({ cloture: true }), null);
  });

  it("refuse une production négative", () => {
    assert.match(String(erreurJournee({ sortie: { H1: -3 } })), /négative/);
    assert.match(String(erreurJournee({ ops: { 7: { H1: -1 } } })), /négative/);
    assert.match(String(erreurJournee({ ret: { 7: -2 } })), /négatif/);
  });

  it("refuse un effectif ou des heures invalides", () => {
    assert.match(String(erreurJournee({ effectif: -1 })), /Effectif/);
    assert.match(String(erreurJournee({ nbHeures: 0 })), /Heures/);
    assert.match(String(erreurJournee({ nbHeures: 30 })), /Heures/);
  });

  it("tolère les marqueurs RI / ABS qui ne sont pas des quantités", () => {
    assert.equal(erreurJournee({ ops: { 3: { H1: "RI" }, 4: { H1: "ABS" } } }), null);
  });

  it("ne valide que les champs présents", () => {
    assert.equal(erreurJournee({ cloture: false }), null);
    assert.equal(erreurJournee({}), null);
  });
});
