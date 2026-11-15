import assert from "node:assert/strict";
import test from "node:test";
import type { TauxChange } from "./montants";
import { prixRetenu, prixUsine } from "./prix-usine";

const TAUX: TauxChange[] = [
  { devise: "EUR", date: "2026-01-01", taux: 3.3 },
  { devise: "EUR", date: "2026-06-01", taux: 3.4 },
];

test("prixRetenu : la commande d'abord, sinon le prix manuel", () => {
  assert.deepEqual(prixRetenu({ montant: 5, devise: "EUR" }, { montant: 9, devise: "TND" }), { montant: 5, devise: "EUR" });
  assert.deepEqual(prixRetenu(null, { montant: 9, devise: "TND" }), { montant: 9, devise: "TND" });
  assert.deepEqual(prixRetenu({ montant: 0, devise: "EUR" }, { montant: 9, devise: "TND" }), { montant: 9, devise: "TND" });
  assert.equal(prixRetenu(null, null), null);
});

test("prixUsine : même devise, inchangé", () => {
  assert.deepEqual(prixUsine({ montant: 4.5, devise: "EUR" }, "EUR", "2026-03-01", []), { prix: 4.5, sansTaux: false });
});

test("prixUsine : un prix en dinars devient des euros au taux du jour de production", () => {
  assert.deepEqual(prixUsine({ montant: 33, devise: "TND" }, "EUR", "2026-03-01", TAUX), { prix: 10, sansTaux: false });
  assert.deepEqual(prixUsine({ montant: 34, devise: "TND" }, "EUR", "2026-07-01", TAUX), { prix: 10, sansTaux: false });
  assert.deepEqual(prixUsine({ montant: 10, devise: "EUR" }, "TND", "2026-07-01", TAUX), { prix: 34, sansTaux: false });
});

test("prixUsine : sans taux, le prix est signalé et non compté", () => {
  assert.deepEqual(prixUsine({ montant: 33, devise: "TND" }, "EUR", "2026-03-01", []), { prix: null, sansTaux: true });
});

test("prixUsine : pas de prix, pas d'alerte de taux", () => {
  assert.deepEqual(prixUsine(null, "EUR", "2026-03-01", []), { prix: null, sansTaux: false });
});
