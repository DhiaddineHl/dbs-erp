import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ecartSamPct, proposerSamDbs, samConstateJournee, samConstateSerie, secondesProductives } from "./sam";

describe("SAM constaté d'une journée", () => {
  it("déduit les temps non productifs du temps disponible", () => {
    // 10 ouvrières × 8 h = 80 h = 288 000 s ; 60 min d'arrêt = 3 600 s déduits.
    const j = { pieces: 100, effectif: 10, nbHeures: 8, minutesArret: 60 };
    assert.equal(secondesProductives(j), 288000 - 3600);
    assert.equal(samConstateJournee(j), (288000 - 3600) / 100);
  });

  it("sans arrêt, c'est le temps plein sur les pièces", () => {
    assert.equal(samConstateJournee({ pieces: 160, effectif: 10, nbHeures: 8 }), 288000 / 160);
  });

  it("ne renvoie rien quand rien n'est produit", () => {
    assert.equal(samConstateJournee({ pieces: 0, effectif: 10, nbHeures: 8 }), null);
  });
});

describe("SAM constaté d'une série (agrégation pondérée)", () => {
  it("pondère par les pièces, pas par les jours", () => {
    // Jour A : 10 pièces, beaucoup de temps ; Jour B : 500 pièces, peu de temps.
    // Une moyenne simple des SAM journaliers serait trompeuse (audit §21).
    const serie = [
      { pieces: 10, effectif: 10, nbHeures: 8 }, // 288000/10 = 28800 s/pc
      { pieces: 500, effectif: 10, nbHeures: 8 }, // 288000/500 = 576 s/pc
    ];
    // Correct : (288000 + 288000) / (10 + 500) = 576000/510 ≈ 1129,4
    assert.equal(Math.round(samConstateSerie(serie)!), Math.round(576000 / 510));
  });

  it("renvoie null pour une série sans production", () => {
    assert.equal(samConstateSerie([{ pieces: 0, effectif: 5, nbHeures: 8 }]), null);
  });
});

describe("écart SAM", () => {
  it("mesure le dépassement en %", () => {
    assert.equal(ecartSamPct(1800, 1980), 10);
    assert.equal(ecartSamPct(1800, 1800), 0);
  });
  it("null si une valeur manque", () => {
    assert.equal(ecartSamPct(0, 1980), null);
    assert.equal(ecartSamPct(1800, null), null);
  });
});

describe("proposition de SAM DBS", () => {
  it("propose une valeur pondérée par les pièces, avec l'étendue", () => {
    const p = proposerSamDbs([
      { ref: "OF-1", samConstate: 1950, pieces: 100 },
      { ref: "OF-2", samConstate: 1880, pieces: 300 },
      { ref: "OF-3", samConstate: 1920, pieces: 200 },
    ]);
    assert.equal(p.series, 3);
    assert.equal(p.pieces, 600);
    assert.deepEqual(p.etendue, [1880, 1950]);
    // (1950*100 + 1880*300 + 1920*200) / 600 = 1907,5 → 1908
    assert.equal(p.propose, Math.round((1950 * 100 + 1880 * 300 + 1920 * 200) / 600));
  });

  it("ne propose rien sans historique exploitable", () => {
    const p = proposerSamDbs([{ ref: "x", samConstate: null, pieces: 0 }]);
    assert.equal(p.propose, null);
    assert.equal(p.series, 0);
  });
});
