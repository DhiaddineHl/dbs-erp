import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type TauxChange,
  arrondir,
  calculerTotaux,
  convertir,
  deviseOu,
  formatMontant,
  formatMontants,
  montantEnLettres,
  parseVueDevise,
  tauxA,
  tauxTvaValide,
  totaliser,
} from "./montants";

/* ─────────── arrondis & format ─────────── */

test("arrondi au centime pour l'euro, au millime pour le dinar", () => {
  assert.equal(arrondir(1.005, "EUR"), 1.01);
  assert.equal(arrondir(1.0005, "TND"), 1.001);
  assert.equal(arrondir(12.34567, "TND"), 12.346);
});

test("format par devise", () => {
  assert.equal(formatMontant(1234.5, "EUR").replace(/\s/g, " "), "1 234,50 €");
  assert.equal(formatMontant(1234.5, "TND").replace(/\s/g, " "), "1 234,500 DT");
  assert.equal(formatMontant(null, "EUR"), "—");
});

test("devise inconnue → devise par défaut", () => {
  assert.equal(deviseOu("USD"), "EUR");
  assert.equal(deviseOu("TND"), "TND");
  assert.equal(deviseOu(null, "TND"), "TND");
});

/* ─────────── TVA ─────────── */

test("taux de TVA : 0 par défaut, borné", () => {
  assert.equal(tauxTvaValide(""), 0);
  assert.equal(tauxTvaValide("19"), 19);
  assert.equal(tauxTvaValide("7,5"), 7.5);
  assert.equal(tauxTvaValide(-3), 0);
  assert.equal(tauxTvaValide(250), 100);
  assert.equal(tauxTvaValide(undefined), 0);
});

test("sans TVA, TTC = HT", () => {
  const t = calculerTotaux({ montantsHt: [100, 50.25], tauxTva: 0, devise: "EUR" });
  assert.deepEqual(t, { totalHt: 150.25, montantTva: 0, totalTtc: 150.25 });
});

test("TVA calculée sur le total HT, arrondie à la devise", () => {
  const eur = calculerTotaux({ montantsHt: [33.33, 33.33, 33.33], tauxTva: 19, devise: "EUR" });
  assert.deepEqual(eur, { totalHt: 99.99, montantTva: 19, totalTtc: 118.99 });
  const tnd = calculerTotaux({ montantsHt: [1234.567], tauxTva: 19, devise: "TND" });
  assert.deepEqual(tnd, { totalHt: 1234.567, montantTva: 234.568, totalTtc: 1469.135 });
});

test("montants non finis ignorés", () => {
  const t = calculerTotaux({ montantsHt: [10, NaN, Infinity], tauxTva: 10, devise: "EUR" });
  assert.deepEqual(t, { totalHt: 10, montantTva: 1, totalTtc: 11 });
});

/* ─────────── taux de change ─────────── */

const TAUX: TauxChange[] = [
  { devise: "EUR", date: "2026-01-01", taux: 3.3 },
  { devise: "EUR", date: "2026-06-01", taux: 3.4 },
];

test("taux en vigueur : le plus récent qui ne dépasse pas la date", () => {
  assert.equal(tauxA("EUR", "2026-03-15", TAUX), 3.3);
  assert.equal(tauxA("EUR", "2026-06-01", TAUX), 3.4);
  assert.equal(tauxA("EUR", "2026-12-31", TAUX), 3.4);
});

test("avant tout taux connu : le plus ancien ; pivot : 1 ; aucun : null", () => {
  assert.equal(tauxA("EUR", "2025-05-01", TAUX), 3.3);
  assert.equal(tauxA("TND", "2025-05-01", TAUX), 1);
  assert.equal(tauxA("EUR", "2026-05-01", []), null);
});

test("conversion dans les deux sens via le pivot", () => {
  assert.equal(convertir(100, "EUR", "TND", "2026-03-01", TAUX), 330);
  assert.equal(convertir(340, "TND", "EUR", "2026-07-01", TAUX), 100);
  assert.equal(convertir(100, "EUR", "EUR", "2026-07-01", []), 100);
  assert.equal(convertir(100, "EUR", "TND", "2026-07-01", []), null);
});

/* ─────────── agrégation ─────────── */

const ITEMS = [
  { devise: "EUR" as const, montant: 100, date: "2026-03-01" },
  { devise: "EUR" as const, montant: 50, date: "2026-07-01" },
  { devise: "TND" as const, montant: 1000, date: "2026-03-01" },
];

test("par devise : jamais d'addition entre devises", () => {
  assert.deepEqual(totaliser(ITEMS, "par-devise"), { montants: { EUR: 150, TND: 1000 }, nonConvertis: 0 });
});

test("converti : chaque montant au taux de sa date", () => {
  // 100×3,3 + 50×3,4 + 1000 = 1500
  assert.deepEqual(totaliser(ITEMS, "TND", TAUX), { montants: { TND: 1500 }, nonConvertis: 0 });
  const eur = totaliser(ITEMS, "EUR", TAUX);
  assert.equal(eur.montants.EUR, arrondir(150 + 1000 / 3.3, "EUR"));
});

test("converti sans taux : montants signalés, pas inventés", () => {
  assert.deepEqual(totaliser(ITEMS, "TND", []), { montants: { TND: 1000 }, nonConvertis: 2 });
});

test("vue invalide → par devise", () => {
  assert.equal(parseVueDevise("XYZ"), "par-devise");
  assert.equal(parseVueDevise("TND"), "TND");
});

test("formatMontants", () => {
  assert.equal(formatMontants({}), "—");
  assert.equal(formatMontants({ TND: 1, EUR: 2 }).replace(/\s/g, " "), "2,00 € · 1,000 DT");
});

/* ─────────── en lettres ─────────── */

test("montant en lettres selon la devise", () => {
  assert.equal(montantEnLettres(1234.5, "EUR"), "mille deux cent trente-quatre euros et cinquante centimes");
  assert.equal(montantEnLettres(100.5, "TND"), "cent dinars et cinq cents millimes");
  assert.equal(montantEnLettres(1, "TND"), "un dinar");
  assert.equal(montantEnLettres(0, "EUR"), "zéro euro");
  assert.equal(montantEnLettres(2_500_000, "EUR"), "deux millions cinq cent mille euros");
  assert.equal(montantEnLettres(91, "EUR"), "quatre-vingt-onze euros");
});
