import { test } from "node:test";
import assert from "node:assert/strict";
import * as pf from "./performance-client";

const j = (o: Partial<pf.Jalons>): pf.Jalons => ({
  commande: "", tissu: "", coupeDebut: "", coupeFin: "", finitionDebut: "", finitionFin: "", controleFinal: "", exportContractuel: "", exportReel: "", ...o,
});

test("cycle d'une commande partie", () => {
  const c = pf.cycleCommande(
    j({ commande: "2026-09-01", tissu: "2026-09-11", coupeDebut: "2026-09-15", finitionFin: "2026-10-10", exportContractuel: "2026-10-15", exportReel: "2026-10-13" }),
    "2026-11-19",
  );
  assert.deepEqual(c, { total: 42, attenteTissu: 10, avantCoupe: 4, fabrication: 25, expedition: 3, delaiUsine: 32, ecartExport: -2, enCours: false });
});

test("commande en cours : cycle jusqu'à aujourd'hui, pas d'écart", () => {
  const c = pf.cycleCommande(j({ commande: "2026-11-09", exportContractuel: "2026-12-01" }), "2026-11-19");
  assert.equal(c.total, 10);
  assert.equal(c.ecartExport, null);
  assert.equal(c.enCours, true);
  assert.equal(c.attenteTissu, null);
});

test("statistiques : à l'heure, retards, moyennes, points forts", () => {
  const l = (exportContractuel: string, exportReel: string, pieces: number, tds: boolean | null, qc: boolean | null): pf.LigneStats => ({
    jalons: j({ commande: "2026-09-01", tissu: "2026-09-10", exportContractuel, exportReel }),
    pieces,
    premiereTdsOk: tds,
    controleOk: qc,
  });
  const s = pf.statsPerformance(
    [l("2026-10-15", "2026-10-13", 500, true, true), l("2026-10-20", "2026-10-20", 300, true, true), l("2026-10-20", "2026-10-26", 200, false, true), l("2026-12-01", "", 0, null, null)],
    "2026-11-19",
  );
  assert.equal(s.expediees, 3);
  assert.equal(s.aLHeure, 2);
  assert.equal(s.pctALHeure, 67);
  assert.equal(s.ecartMoyen, 1.3);
  assert.equal(s.retardMoyen, 6);
  assert.equal(s.piecesLivrees, 1000);
  assert.equal(s.pctTdsOk, 67);
  assert.equal(s.pctControleOk, 100);
  assert.equal(pf.statsPerformance([], "2026-11-19").pctALHeure, null);
});

test("libellés du délai", () => {
  assert.deepEqual(pf.libelleEcart(-2), { texte: "2 j d'avance", ton: "vert" });
  assert.deepEqual(pf.libelleEcart(0), { texte: "le jour prévu", ton: "vert" });
  assert.equal(pf.libelleEcart(2).ton, "orange");
  assert.equal(pf.libelleEcart(9).ton, "rouge");
  assert.deepEqual(pf.trierEvenements([{ date: "2026-10-02", quoi: "b", detail: "" }, { date: "", quoi: "x", detail: "" }, { date: "2026-10-01", quoi: "a", detail: "" }]).map((e) => e.quoi), ["a", "b"]);
});
