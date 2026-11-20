import { test } from "node:test";
import assert from "node:assert/strict";
import * as dm from "./documents-modele";

test("fiches du modèle : natures, impression, tailles, nom sûr", () => {
  assert.equal(dm.estNatureDocument("fiche_technique"), true);
  assert.equal(dm.estNatureDocument("bidon"), false);
  assert.equal(dm.imprimable("application/pdf"), true);
  assert.equal(dm.imprimable("image/png"), true);
  assert.equal(dm.imprimable("application/vnd.ms-excel"), false);
  assert.equal(dm.tailleLisible(3_400_000), "3,2 Mo");
  assert.equal(dm.tailleLisible(500), "1 Ko");
  assert.equal(dm.nomTelechargement('fiche "A"/b.pdf'), "fiche _A_b.pdf");
});
