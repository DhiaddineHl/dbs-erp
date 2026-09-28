import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bilanCoutUsine,
  coutHoraireStandard,
  joursPeriode,
  moisPeriode,
  normaliserParams,
  type ParamsUsine,
} from "./cout-usine";

const DBS: ParamsUsine = { chargesMensuelles: 44_000, effectifDirect: 45, heuresMois: 195, rendementCible: 80, margeCible: 15, minutesRetouche: 0 };
const proche = (a: number | null, b: number, eps = 0.005) => assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≉ ${b}`);

describe("coût horaire standard", () => {
  it("44 000 € ÷ (45 × 195 h) ≈ 5,01 €/h", () => {
    proche(coutHoraireStandard(DBS), 44_000 / 8_775);
    proche(coutHoraireStandard(DBS), 5.014);
  });
  it("inconnu tant qu'un paramètre manque", () => {
    assert.equal(coutHoraireStandard({ ...DBS, effectifDirect: 0 }), null);
    assert.equal(coutHoraireStandard({ ...DBS, chargesMensuelles: 0 }), null);
  });
});

describe("période", () => {
  it("compte les jours bornes incluses", () => {
    assert.equal(joursPeriode("2026-09-01", "2026-09-30"), 30);
    assert.equal(joursPeriode("2026-09-01", "2026-09-01"), 1);
    assert.equal(joursPeriode("2026-02-01", "2026-02-28"), 28);
  });
  it("période invalide ou inversée → 0", () => {
    assert.equal(joursPeriode("", "2026-09-30"), 0);
    assert.equal(joursPeriode("2026-09-30", "2026-09-01"), 0);
  });
  it("une année pleine = 12 mois", () => {
    proche(moisPeriode("2026-01-01", "2026-12-31"), 365 / (365.25 / 12), 0.01);
  });
});

describe("bilan de période", () => {
  it("saisie GPAO complète → coût réel = coût standard", () => {
    // Un mois moyen, toutes les heures payées saisies.
    const mois = 365.25 / 12;
    const b = bilanCoutUsine(DBS, { from: "2026-01-01", to: "2026-01-31", heuresSaisies: 8_775 * (31 / mois), ca: 60_000, pieces: 10_000 });
    proche(b.tauxSaisie, 1);
    proche(b.coutHoraireReel, b.coutHoraireStandard ?? 0);
  });

  it("saisie incomplète → coût réel plus élevé, charges toujours couvertes", () => {
    const b = bilanCoutUsine(DBS, { from: "2026-09-01", to: "2026-09-30", heuresSaisies: 7_000, ca: 50_000, pieces: 8_000 });
    // 30 jours ≈ 0,986 mois → ≈ 43 368 € de charges.
    proche(b.chargesPeriode, 44_000 * (30 / (365.25 / 12)), 0.01);
    proche(b.coutHoraireReel, b.chargesPeriode / 7_000);
    assert.ok((b.coutHoraireReel ?? 0) > (b.coutHoraireStandard ?? 0));
    assert.ok((b.tauxSaisie ?? 1) < 1);
    // Coût réel × heures saisies = charges de la période, rien ne se perd.
    proche((b.coutHoraireReel ?? 0) * b.heuresSaisies, b.chargesPeriode, 0.01);
    proche(b.marge, 50_000 - b.chargesPeriode, 0.01);
    proche(b.coutPiece, b.chargesPeriode / 8_000);
  });

  it("sans heures ni pièces : pas de division par zéro", () => {
    const b = bilanCoutUsine(DBS, { from: "2026-09-01", to: "2026-09-30", heuresSaisies: 0, ca: 0, pieces: 0 });
    assert.equal(b.coutHoraireReel, null);
    assert.equal(b.coutPiece, null);
    assert.equal(b.tauxMarge, null);
  });
});

describe("normaliserParams", () => {
  it("accepte la virgule décimale et écarte le reste", () => {
    assert.deepEqual(normaliserParams({ chargesMensuelles: "44000,5", effectifDirect: 45, heuresMois: "abc" }), {
      chargesMensuelles: 44000.5,
      effectifDirect: 45,
      heuresMois: 0,
      rendementCible: 80,
      margeCible: 15,
      minutesRetouche: 0,
    });
    assert.deepEqual(normaliserParams(null), {
      chargesMensuelles: 0,
      effectifDirect: 0,
      heuresMois: 0,
      rendementCible: 80,
      margeCible: 15,
      minutesRetouche: 0,
    });
  });
  it("borne les objectifs", () => {
    const p = normaliserParams({ rendementCible: "0", margeCible: 120, minutesRetouche: "4,5" });
    assert.equal(p.rendementCible, 1);
    assert.equal(p.margeCible, 90);
    assert.equal(p.minutesRetouche, 4.5);
  });
});
