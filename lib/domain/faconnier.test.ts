import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { bilansFaconniers } from "./faconnier";

describe("bilan factuel par façonnier", () => {
  it("rassemble confié, reçu, conforme et le CA façon", () => {
    const [b] = bilansFaconniers(
      [
        { faconnierId: 1, commandeId: 10, qteConfiee: 500, qteExpediee: 500, prixFacon: 2, dateRetourPrevue: "2026-09-10" },
        { faconnierId: 1, commandeId: 11, qteConfiee: 300, qteExpediee: 300, prixFacon: 3, dateRetourPrevue: "2026-09-05" },
      ],
      [
        { faconnierId: 1, commandeId: 10, date: "2026-09-12", qteRecue: 500, qteOk: 480, qteNc: 20 },
        { faconnierId: 1, commandeId: 11, date: "2026-09-05", qteRecue: 300, qteOk: 300, qteNc: 0 },
      ],
    );
    assert.equal(b.ofConfies, 2);
    assert.equal(b.qteConfiee, 800);
    assert.equal(b.qteRecue, 800);
    assert.equal(b.qteConforme, 780);
    assert.equal(b.qteNonConforme, 20);
    assert.equal(b.tauxConformite, Math.round((780 / 800) * 100));
    assert.equal(b.caConfie, 500 * 2 + 300 * 3);
    // Retards : OF10 +2 j, OF11 0 j → moyenne 1.
    assert.equal(b.retardMoyenJours, 1);
  });

  it("laisse le taux et le retard à null quand la donnée manque", () => {
    const [b] = bilansFaconniers(
      [{ faconnierId: 2, commandeId: 1, qteConfiee: 100, qteExpediee: 100 }],
      [],
    );
    assert.equal(b.tauxConformite, null);
    assert.equal(b.retardMoyenJours, null);
    assert.equal(b.qteEnCours, 100);
  });

  it("classe les façonniers par volume confié", () => {
    const bilans = bilansFaconniers(
      [
        { faconnierId: 1, commandeId: 1, qteConfiee: 100, qteExpediee: 100 },
        { faconnierId: 2, commandeId: 2, qteConfiee: 500, qteExpediee: 500 },
      ],
      [],
    );
    assert.equal(bilans[0].faconnierId, 2);
  });
});
