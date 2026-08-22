import assert from "node:assert/strict";
import { test } from "node:test";
import {
  type CommandeAFacturer,
  type CommandeFaconnable,
  type LigneCoutFacture,
  comparerPrixFacon,
  estSoldee,
  preparerFacturation,
  resteAFacturer,
} from "./facturation-commande";

const cmd = (p: Partial<CommandeAFacturer> = {}): CommandeAFacturer => ({
  id: 1,
  of: "OF-2026-001",
  modele: "CARITA",
  refArticle: "SH019",
  couleur: "Blanc",
  note: "",
  client: "LAURENCE BRAS",
  faconnier: "TWINTEX",
  chaineId: null,
  qte: 800,
  factureQte: 0,
  prixVente: 12.5,
  prixFacon: 4.2,
  ...p,
});

/* ─────────── quantités ─────────── */

test("le reste à facturer ne devient jamais négatif", () => {
  assert.equal(resteAFacturer({ qte: 800, factureQte: 0 }), 800);
  assert.equal(resteAFacturer({ qte: 800, factureQte: 300 }), 500);
  assert.equal(resteAFacturer({ qte: 800, factureQte: 900 }), 0);
});

test("une commande découpée ne se facture que sur sa part", () => {
  // 800 pièces au contrat, 600 confiées à des sous-commandes : la mère ne peut
  // facturer que les 200 qu'elle produit. Les 600 autres seront facturées sur
  // leurs propres lignes — les compter ici les facturerait deux fois.
  assert.equal(resteAFacturer({ qte: 800, qtePropre: 200, factureQte: 0 }), 200);
  assert.equal(resteAFacturer({ qte: 800, qtePropre: 200, factureQte: 200 }), 0);
  // Bornes identiques quand rien n'est réparti.
  assert.equal(resteAFacturer({ qte: 800, qtePropre: 800, factureQte: 300 }), 500);
});

test("une mère est soldée dès que sa part est facturée", () => {
  const base = { archived: false, statutKey: "production" };
  assert.equal(estSoldee({ ...base, qte: 800, qtePropre: 200, factureQte: 200 }), true);
  assert.equal(estSoldee({ ...base, qte: 800, qtePropre: 200, factureQte: 100 }), false);
  assert.equal(estSoldee({ ...base, qte: 800, factureQte: 200 }), false);
});

test("la quantité facturée est bornée par le reste", () => {
  const b = preparerFacturation(cmd({ factureQte: 700 }), { qte: 500, pu: 12.5 });
  assert.equal(b?.qte, 100, "on ne facture pas au-delà du reste");
  assert.equal(b?.factureQteApres, 800);
  assert.equal(b?.complete, true);
});

test("une commande déjà soldée ne peut plus être facturée", () => {
  assert.equal(preparerFacturation(cmd({ factureQte: 800 }), { qte: 10, pu: 12.5 }), null);
});

test("une facturation partielle ne solde pas la commande", () => {
  const b = preparerFacturation(cmd(), { qte: 100, pu: 12.5 });
  assert.equal(b?.complete, false, "100 sur 800 laisse la commande active");
  assert.equal(b?.factureQteApres, 100);
});

test("le montant de ligne est arrondi au centime", () => {
  // 3 × 12,45 = 37,349999… en double précision
  const b = preparerFacturation(cmd(), { qte: 3, pu: 12.45 });
  assert.equal(b?.ligne.mt, 37.35);
});

/* ─────────── coût de production ─────────── */

test("sous-traitance : le coût est le prix façon", () => {
  const b = preparerFacturation(cmd({ faconnier: "TWINTEX" }), { qte: 10, pu: 12.5 });
  assert.deepEqual(b?.cout, { lieu: "faconnier", faconnier: "TWINTEX", cout: 4.2 });
});

test("DBS est l'atelier : le coût est le prix de vente, pas le prix façon", () => {
  const b = preparerFacturation(cmd({ faconnier: "DBS" }), { qte: 10, pu: 12.5 });
  assert.deepEqual(b?.cout, { lieu: "interne", faconnier: "", cout: 12.5 });
});

test("façonnier vide ou chaîne interne comptent comme interne", () => {
  assert.equal(preparerFacturation(cmd({ faconnier: "" }), { qte: 1, pu: 9 })?.cout.lieu, "interne");
  assert.equal(
    preparerFacturation(cmd({ faconnier: "TWINTEX", chaineId: 3 }), { qte: 1, pu: 9 })?.cout.lieu,
    "interne",
  );
});

test("la désignation retombe sur le modèle quand la note est vide", () => {
  assert.equal(preparerFacturation(cmd({ note: "" }), { qte: 1, pu: 9 })?.ligne.desig, "CARITA");
  assert.equal(preparerFacturation(cmd({ note: "Chemise ML" }), { qte: 1, pu: 9 })?.ligne.desig, "Chemise ML");
});

/* ─────────── B3 · cohérence du prix façon ─────────── */

const coutLigne = (p: Partial<LigneCoutFacture> = {}): LigneCoutFacture => ({
  numero: "79/2026",
  type: "facture",
  lineIdx: 0,
  client: "LAURENCE BRAS",
  modele: "CARITA",
  ref: "SH019",
  lieu: "faconnier",
  faconnier: "TWINTEX",
  cout: 4.2,
  ...p,
});

const faconnable = (p: Partial<CommandeFaconnable> = {}): CommandeFaconnable => ({
  id: 1,
  of: "OF-2026-001",
  client: "LAURENCE BRAS",
  modele: "CARITA",
  refArticle: "SH019",
  faconnier: "TWINTEX",
  chaineId: null,
  prixFacon: 4.2,
  archived: false,
  ...p,
});

test("aucune divergence quand les prix coïncident", () => {
  assert.deepEqual(comparerPrixFacon([coutLigne()], [faconnable()]), []);
});

test("un écart de prix façon est signalé avec son montant", () => {
  const d = comparerPrixFacon([coutLigne({ cout: 4.2 })], [faconnable({ prixFacon: 3.5 })]);
  assert.equal(d.length, 1);
  assert.equal(d[0].prixCommande, 3.5);
  assert.equal(d[0].prixFacture, 4.2);
  assert.equal(d[0].ecart, -0.7);
});

test("un écart d'un centime est ignoré — c'est un arrondi", () => {
  assert.deepEqual(comparerPrixFacon([coutLigne({ cout: 4.2 })], [faconnable({ prixFacon: 4.21 })]), []);
});

test("la production interne n'est jamais comparée", () => {
  const d = comparerPrixFacon(
    [coutLigne({ lieu: "interne", cout: 12.5 })],
    [faconnable({ faconnier: "DBS", prixFacon: 0 })],
  );
  assert.deepEqual(d, []);
});

test("les archives sont contrôlées aussi, et signalées comme telles", () => {
  const d = comparerPrixFacon([coutLigne({ cout: 5 })], [faconnable({ archived: true, prixFacon: 4 })]);
  assert.equal(d.length, 1);
  assert.equal(d[0].archivee, true);
});

test("à clé égale, la facture la plus récente sert de référence", () => {
  const d = comparerPrixFacon(
    [coutLigne({ numero: "9/2026", cout: 3 }), coutLigne({ numero: "80/2026", cout: 5 })],
    [faconnable({ prixFacon: 3 })],
  );
  assert.equal(d.length, 1);
  assert.equal(d[0].prixFacture, 5, "80/2026 est postérieure à 9/2026 malgré l'ordre alphabétique");
});

test("les divergences sortent par écart décroissant", () => {
  const d = comparerPrixFacon(
    [coutLigne({ cout: 5 }), coutLigne({ modele: "TIMI", ref: "T1", cout: 9 })],
    [faconnable({ prixFacon: 4.5 }), faconnable({ id: 2, modele: "TIMI", refArticle: "T1", prixFacon: 2 })],
  );
  assert.deepEqual(d.map((x) => x.modele), ["TIMI", "CARITA"]);
});

/* ─────────── B10 · commande soldée ─────────── */

test("une commande partiellement facturée n'est pas soldée", () => {
  assert.equal(estSoldee({ qte: 800, factureQte: 100, archived: false }), false);
});

test("une commande intégralement facturée est soldée", () => {
  assert.equal(estSoldee({ qte: 800, factureQte: 800, archived: false }), true);
});

test("une commande déjà archivée n'est plus à purger", () => {
  assert.equal(estSoldee({ qte: 800, factureQte: 800, archived: true }), false);
});

test("le statut livrée suffit à solder", () => {
  assert.equal(estSoldee({ qte: 800, factureQte: 0, archived: false, statutKey: "livree" }), true);
});

test("une commande à quantité nulle n'est pas soldée par division", () => {
  assert.equal(estSoldee({ qte: 0, factureQte: 0, archived: false }), false);
});
