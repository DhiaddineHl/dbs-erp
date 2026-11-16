import { test } from "node:test";
import assert from "node:assert/strict";
import * as pv from "./prevision-client";

test("période publiée : les deux semaines qui viennent", () => {
  // samedi 21/11/2026 → lundi 23/11 au dimanche 06/12
  assert.deepEqual(pv.periodePrevision("2026-11-21").debut, "2026-11-23");
  assert.deepEqual(pv.periodePrevision("2026-11-21").fin, "2026-12-06");
  assert.equal(pv.periodePrevision("2026-11-22").debut, "2026-11-23"); // dimanche
  assert.equal(pv.periodePrevision("2026-11-20").debut, "2026-11-23"); // vendredi
  assert.equal(pv.periodePrevision("2026-11-23").debut, "2026-11-23"); // lundi : publication tardive
  assert.equal(pv.periodePrevision("2026-11-24").debut, "2026-11-30"); // mardi
  assert.deepEqual(pv.periodePrevision("2026-11-21").semaines[1], { debut: "2026-11-30", fin: "2026-12-06" });
  assert.equal(pv.estWeekEnd("2026-11-21"), true);
  assert.equal(pv.estWeekEnd("2026-11-18"), false);
});

test("état vu du client", () => {
  assert.equal(pv.etatExport({ reste: 100, stock: 100, produit: 100, qte: 100, pret: false }), "prete");
  assert.equal(pv.etatExport({ reste: 100, stock: 0, produit: 0, qte: 100, pret: true }), "prete");
  assert.equal(pv.etatExport({ reste: 100, stock: 40, produit: 60, qte: 100, pret: false }), "emballage");
  assert.equal(pv.etatExport({ reste: 100, stock: 0, produit: 30, qte: 100, pret: false }), "production");
});

const l = (commandeId: number, date: string, qte: number) => ({
  commandeId, clientId: 1, of: `OF-${commandeId}`, modele: "M", reference: "", couleur: "", date, qte, qteCommande: 500, etat: "production" as const,
});

test("comparaison avec la publication précédente", () => {
  const avant = [l(1, "2026-11-25", 100), l(2, "2026-11-26", 200), l(3, "2026-11-27", 300), l(4, "2026-11-20", 50), l(5, "2026-11-30", 80)].map((x) => ({ ...x }));
  const apres = [l(1, "2026-11-25", 100), l(2, "2026-12-02", 200), l(3, "2026-11-27", 250), l(6, "2026-11-24", 60)];
  const c = pv.comparerPrevision(apres, avant, { debut: "2026-11-23", fin: "2026-12-06" });
  const vu = Object.fromEntries(c.map((x) => [x.of, [x.changement, x.dateAvant, x.qteAvant]]));
  assert.deepEqual(vu["OF-1"], ["inchangee", null, null]);
  assert.deepEqual(vu["OF-2"], ["reportee", "2026-11-26", null]);
  assert.deepEqual(vu["OF-3"], ["quantite", null, 300]);
  assert.deepEqual(vu["OF-6"], ["nouvelle", null, null]);
  assert.deepEqual(vu["OF-5"], ["retiree", "2026-11-30", 80]); // annoncée dans la période, disparue
  assert.equal(vu["OF-4"], undefined); // partie avant la période : rien à dire
  // la première publication ne marque rien comme « nouvelle »
  assert.equal(pv.comparerPrevision(apres, null, { debut: "2026-11-23", fin: "2026-12-06" })[0].changement, "inchangee");
});

test("quantité modifiée à la main", () => {
  assert.equal(pv.refusQuantite(100, 500), null);
  assert.match(pv.refusQuantite(600, 500)!, /au-delà/);
  assert.match(pv.refusQuantite(1.5, 500)!, /entier/);
});
