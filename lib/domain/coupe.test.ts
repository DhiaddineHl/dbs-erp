import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bilanConsommation, commandeParMembre, ecartsCoupe, prochainNumero, refusValidation, repartitionParDefaut, totalLignes } from "./coupe";

const sizes = ["36", "38", "40"];

describe("coupe — import du plan et répartition par OF", () => {
  const porteur = { id: 1, of: "OF-1", qtePropre: 300, tailles: { "36": 100, "38": 100, "40": 100 }, porteur: true };
  const membre = { id: 2, of: "OF-2", qtePropre: 150, tailles: { "36": 50, "38": 50, "40": 50 }, porteur: false };

  it("chaque OF reçoit son commandé, le surplus du plan va au porteur", () => {
    const prevu = { "36": 152, "38": 150, "40": 150 };
    const r = repartitionParDefaut(sizes, prevu, [porteur, membre]);
    assert.deepEqual(r[1], { "36": 102, "38": 100, "40": 100 });
    assert.deepEqual(r[2], { "36": 50, "38": 50, "40": 50 });
  });
  it("plan inférieur au commandé : on retire au porteur d'abord", () => {
    const r = repartitionParDefaut(sizes, { "36": 140, "38": 150, "40": 150 }, [porteur, membre]);
    assert.equal(r[1]["36"] + r[2]["36"], 140);
    assert.equal(r[2]["36"], 50);
  });
  it("OF sans grille sur un plan détaillé : au prorata du prévu", () => {
    const sansGrille = { ...membre, tailles: {} };
    const c = commandeParMembre(sizes, { "36": 100, "38": 100, "40": 100 }, [sansGrille]);
    assert.equal(Object.values(c[2]).reduce((s, x) => s + x, 0), 150);
  });
});

describe("coupe — écarts et motifs", () => {
  const prevu = { "36": 100, "38": 150, "40": 200 };
  it("prévu / coupé / écart et seuil", () => {
    const l = ecartsCoupe(sizes, prevu, prevu, { "36": 100, "38": 145, "40": 201 }, 2);
    assert.deepEqual(l.map((x) => x.ecart), [0, -5, 1]);
    assert.deepEqual(l.map((x) => x.motifRequis), [false, true, false]); // -3,33 % > 2 % ; +0,5 % < 2 %
    assert.deepEqual(totalLignes(l), { commande: 450, prevu: 450, coupe: 446, ecart: -4 });
  });
  it("motif obligatoire au-delà du seuil, « autre » à préciser", () => {
    const l = ecartsCoupe(sizes, prevu, prevu, { "36": 120, "38": 150, "40": 200 }, 2);
    assert.match(refusValidation(l, "", "") ?? "", /36 \(\+20\)/);
    assert.match(refusValidation(l, "autre", "") ?? "", /précisez/);
    assert.equal(refusValidation(l, "reassort", ""), null);
    assert.match(refusValidation(ecartsCoupe(sizes, prevu, prevu, {}, 2), "", "") ?? "", /Aucune pièce/);
  });
});

describe("coupe — consommation et numérotation", () => {
  it("théorique / réel / écart %", () => {
    assert.deepEqual(bilanConsommation(1.85, 500, 940), { theorique: 925, reel: 940, ecart: 15, pct: 1.62 });
    assert.deepEqual(bilanConsommation(null, 500, 940), { theorique: null, reel: 940, ecart: null, pct: null });
  });
  it("numéros annuels", () => {
    assert.equal(prochainNumero("PVC", 2026, ["PVC-2026-001", "PVC-2026-009", "PVC-2025-044"]), "PVC-2026-010");
    assert.equal(prochainNumero("CP", 2026, []), "CP-2026-001");
  });
});
