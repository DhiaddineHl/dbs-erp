import assert from "node:assert/strict";
import { test } from "node:test";
import {
  anneesDisponibles,
  clePeriodeLibre,
  controleNumero,
  dansPeriode,
  lirePeriode,
  memePeriodeAnPasse,
  moisDeLaPeriode,
  prochainNumero,
  variation,
} from "./periode";
import { grandLivrePeriode } from "./finance";

const AUJ = "2027-01-15";

test("exercice en cours et précédent suivent l'année civile", () => {
  assert.deepEqual([lirePeriode("exercice", AUJ).du, lirePeriode("exercice", AUJ).au], ["2027-01-01", "2027-12-31"]);
  assert.equal(lirePeriode("precedent", AUJ).label, "Exercice 2026");
  assert.equal(lirePeriode("precedent", AUJ).du, "2026-01-01");
});

test("mois, trimestre, année, libre", () => {
  assert.deepEqual([lirePeriode("m:2026-02", AUJ).du, lirePeriode("m:2026-02", AUJ).au], ["2026-02-01", "2026-02-28"]);
  assert.equal(lirePeriode("m:2028-02", AUJ).au, "2028-02-29");
  assert.deepEqual([lirePeriode("t:2026-4", AUJ).du, lirePeriode("t:2026-4", AUJ).au], ["2026-10-01", "2026-12-31"]);
  assert.equal(lirePeriode("t:2026-1", AUJ).label, "1er trimestre 2026");
  assert.equal(lirePeriode("a:2025", AUJ).label, "Exercice 2025");
  const l = lirePeriode(clePeriodeLibre("2026-06-30", "2026-03-01"), AUJ);
  assert.deepEqual([l.du, l.au], ["2026-03-01", "2026-06-30"], "bornes remises dans l'ordre");
  assert.equal(lirePeriode("l:2026-03-01~", AUJ).label, "depuis le 01/03/2026");
});

test("une clé abîmée donne l'exercice en cours, jamais rien", () => {
  for (const c of ["", "n'importe quoi", "m:2026-13", "l:~", null, undefined]) {
    assert.equal(lirePeriode(c, AUJ).cle, "exercice");
  }
  assert.equal(lirePeriode("tout", AUJ).du, "");
});

test("dansPeriode : bornes incluses, date vide exclue d'une période bornée", () => {
  const p = lirePeriode("exercice", AUJ);
  assert.equal(dansPeriode("2027-01-01", p), true);
  assert.equal(dansPeriode("2027-12-31", p), true);
  assert.equal(dansPeriode("2026-12-31", p), false);
  assert.equal(dansPeriode("", p), false);
  assert.equal(dansPeriode("", lirePeriode("tout")), true);
  assert.equal(dansPeriode("2027-05-02T10:00:00Z", p), true);
});

test("même période l'an passé", () => {
  assert.equal(memePeriodeAnPasse(lirePeriode("exercice", AUJ))!.label, "Exercice 2026");
  const f = memePeriodeAnPasse(lirePeriode("m:2028-02", AUJ))!;
  assert.deepEqual([f.du, f.au], ["2027-02-01", "2027-02-28"], "29 février → 28");
  assert.equal(memePeriodeAnPasse(lirePeriode("tout")), null);
  assert.equal(memePeriodeAnPasse(lirePeriode("t:2027-1", AUJ))!.label, "1er trimestre 2026");
  assert.equal(memePeriodeAnPasse(lirePeriode("m:2027-03", AUJ))!.label, "Mars 2026");
  assert.equal(memePeriodeAnPasse(lirePeriode("l:2027-01-10~2027-02-10", AUJ))!.du, "2026-01-10");
  assert.equal(variation(110, 100), 10);
  assert.equal(variation(5, 0), null);
});

test("années proposées et mois d'une période", () => {
  assert.deepEqual(anneesDisponibles(["2025-03-01", "2026-01-09", "", "x"], AUJ), [2027, 2026, 2025]);
  assert.deepEqual(moisDeLaPeriode(lirePeriode("t:2026-4")), ["2026-10", "2026-11", "2026-12"]);
  assert.deepEqual(moisDeLaPeriode({ du: "", au: "" }, ["2026-11-03", "2027-01-10"]), ["2026-11", "2026-12", "2027-01"]);
});

test("numérotation : chaque année repart à 01, selon l'année de la date", () => {
  const nums = ["01/2026", "02/2026", "79/2026", "PP-004/2026"];
  assert.equal(prochainNumero(nums, 2026), "80/2026");
  assert.equal(prochainNumero(nums, 2027), "01/2027");
  assert.equal(prochainNumero([...nums, "01/2027", "09/2027"], 2027), "10/2027");
  assert.equal(prochainNumero(Array.from({ length: 99 }, (_, i) => `${i + 1}/2027`), 2027), "100/2027");
});

test("contrôle d'un numéro tapé : année de la date et trou dans la série", () => {
  const nums = ["01/2027", "02/2027"];
  assert.match(controleNumero("03/2026", "2027-01-04", nums)!, /année 2026.*datée de 2027/);
  assert.match(controleNumero("05/2027", "2027-01-04", nums)!, /trou/);
  assert.match(controleNumero("02/2028", "2028-01-04", nums)!, /commence à 01\/2028/);
  assert.equal(controleNumero("03/2027", "2027-01-04", nums), null);
  assert.equal(controleNumero("PP-001/2027", "2027-01-04", nums), null);
});

test("grand livre sur une période : report à nouveau exact", () => {
  const tx = [
    { id: 1, date: "2026-11-02", libelle: "Facture F1", debit: 0, credit: 1000 },
    { id: 2, date: "2026-12-20", libelle: "Règlement", debit: 600, credit: 0 },
    { id: 3, date: "2027-01-10", libelle: "Facture F2", debit: 0, credit: 250.5 },
    { id: 4, date: "2027-02-01", libelle: "Règlement", debit: 400, credit: 0 },
    { id: 5, date: "2028-01-05", libelle: "Échéance future", debit: 100, credit: 0 },
  ];
  const n1 = grandLivrePeriode(tx, "2026-01-01", "2026-12-31");
  const n = grandLivrePeriode(tx, "2027-01-01", "2027-12-31");
  assert.equal(n1.ouverture, 0);
  assert.equal(n1.fin, 400);
  assert.equal(n.ouverture, n1.fin, "l'ouverture 2027 reprend la fin 2026");
  assert.deepEqual([n.credit, n.debit, n.fin], [250.5, 400, 250.5]);
  assert.deepEqual(n.lignes.map((l) => l.soldeCumule), [650.5, 250.5]);
  assert.equal(n.apres, 1);
  const tout = grandLivrePeriode(tx, "", "");
  assert.equal(tout.fin, 150.5);
  assert.equal(tout.lignes.length, 5);
});
