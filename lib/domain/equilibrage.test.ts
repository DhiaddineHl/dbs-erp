import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { equilibrage, type OuvrierePoste } from "./equilibrage";

const o = (id: number, poste: string, debit: number, heures = 8): OuvrierePoste => ({
  id,
  nom: `O${id}`,
  poste,
  debit,
  heures,
});

describe("equilibrage", () => {
  it("détecte le goulot (poste au plus faible débit total)", () => {
    const e = equilibrage([o(1, "Col", 120), o(2, "Manche", 65), o(3, "Montage", 90)]);
    assert.equal(e.goulot?.poste, "Manche");
    assert.equal(e.debitChaine, 65);
  });

  it("additionne le débit de deux ouvrières sur le même poste", () => {
    const e = equilibrage([o(1, "Manche", 40), o(2, "Manche", 40), o(3, "Col", 70)]);
    const manche = e.postes.find((p) => p.poste === "Manche")!;
    assert.equal(manche.effectif, 2);
    assert.equal(manche.debit, 80);
    // Manche 80 > Col 70 → le goulot est Col.
    assert.equal(e.goulot?.poste, "Col");
  });

  it("ignore les ouvrières sans production", () => {
    const e = equilibrage([o(1, "Col", 0), o(2, "Manche", 50)]);
    assert.equal(e.postes.length, 1);
    assert.equal(e.goulot?.poste, "Manche");
  });

  it("taux d'équilibrage à 100% quand tous les postes ont le même débit", () => {
    const e = equilibrage([o(1, "A", 60), o(2, "B", 60), o(3, "C", 60)]);
    assert.equal(e.tauxEquilibrage, 100);
  });

  it("taux d'équilibrage < 100% quand déséquilibré", () => {
    const e = equilibrage([o(1, "A", 100), o(2, "B", 50)]);
    // (100+50)/(2×100) = 75%
    assert.equal(e.tauxEquilibrage, 75);
  });

  it("propose de renforcer le goulot et signale une surcapacité", () => {
    const e = equilibrage([o(1, "Rapide", 100), o(2, "Rapide", 100), o(3, "Goulot", 60)]);
    assert.ok(e.suggestions.some((s) => s.type === "renfort"));
    assert.ok(e.suggestions.some((s) => s.type === "surcapacite"));
  });

  it("retire le préfixe modèle des postes pour regrouper", () => {
    const e = equilibrage([o(1, '"Lilith" Montage', 40), o(2, "Montage", 40)]);
    assert.equal(e.postes.length, 1);
    assert.equal(e.postes[0].effectif, 2);
  });

  it("chaîne vide → pas de goulot", () => {
    const e = equilibrage([]);
    assert.equal(e.goulot, null);
    assert.equal(e.tauxEquilibrage, null);
  });
});
