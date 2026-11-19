import { test } from "node:test";
import assert from "node:assert/strict";
import * as sk from "./stock-taille";

test("ventilation saisie : vide, juste, fausse", () => {
  assert.deepEqual(sk.lireVentilation({}, ["S", "M"], 10), {});
  assert.deepEqual(sk.lireVentilation({ S: "4", M: 6 }, ["S", "M"], 10), { S: 4, M: 6 });
  assert.deepEqual(sk.lireVentilation({ S: 0, M: "" }, ["S", "M"], 10), {});
  assert.throws(() => sk.lireVentilation({ S: 4, M: 5 }, ["S", "M"], 10), /9 pièces pour 10/);
  assert.throws(() => sk.lireVentilation({ XL: 10 }, ["S", "M"], 10), /inconnue/);
  assert.throws(() => sk.lireVentilation({ S: 1.5 }, ["S"], 1.5), /entier/);
});

test("stock par taille : entrées − sorties, ordre de la grille", () => {
  const s = sk.stockParTaille(
    [
      { qte: 100, tailles: { M: 60, S: 40 } },
      { qte: 30, tailles: { S: 10, L: 20 } },
    ],
    [{ qte: 50, tailles: { S: 20, M: 30 } }],
    ["S", "M", "L"],
  );
  assert.deepEqual(s, { parTaille: { S: 30, M: 30, L: 20 }, nonVentile: 0, total: 80 });
});

test("stock ancien non ventilé : la sortie ventilée y puise", () => {
  const s = sk.stockParTaille([{ qte: 100, tailles: {} }, { qte: 20, tailles: { S: 20 } }], [{ qte: 30, tailles: { S: 25, M: 5 } }], ["S", "M"]);
  // S : 20 − 25 → 0, il manque 5 ; M : −5 → 0 ; pris sur le non ventilé (100 − 10)
  assert.deepEqual(s, { parTaille: {}, nonVentile: 90, total: 90 });
});

test("sortie non ventilée sur stock ventilé : tout devient non ventilé", () => {
  const s = sk.stockParTaille([{ qte: 50, tailles: { S: 20, M: 30 } }], [{ qte: 10, tailles: {} }], ["S", "M"]);
  assert.deepEqual(s, { parTaille: {}, nonVentile: 40, total: 40 });
});

test("ventilation automatique d'une sortie : seulement si on expédie tout le stock ventilé", () => {
  const s = { parTaille: { S: 30, M: 30 }, nonVentile: 0, total: 60 };
  assert.deepEqual(sk.ventilationAuto(s, 60), { S: 30, M: 30 });
  assert.equal(sk.ventilationAuto(s, 40), null);
  assert.equal(sk.ventilationAuto({ parTaille: { S: 30 }, nonVentile: 5, total: 35 }, 35), null);
});

test("sortie ventilée contrôlée face au stock de chaque taille", () => {
  const s = { parTaille: { S: 10, M: 5 }, nonVentile: 2, total: 17 };
  assert.equal(sk.refusSortie(s, { S: 10, M: 7 }), null); // 2 pris sur le non ventilé
  assert.match(sk.refusSortie(s, { S: 12, M: 8 })!, /3 pièce/);
  assert.equal(sk.formatVentilation({ S: 3, M: 0, L: 2 }), "S 3 · L 2");
});
