import { test } from "node:test";
import assert from "node:assert/strict";
import * as pv from "./pv-client";

test("laize en mètres", () => {
  assert.equal(pv.laizeMetres([148, null, 148]), "1.48");
  assert.equal(pv.laizeMetres([146, 148]), "1.46 / 1.48");
  assert.equal(pv.laizeMetres([1.5]), "1.50");
  assert.equal(pv.laizeMetres([]), "");
});

test("emploi tissu groupé par référence + coloris", () => {
  const lots = [
    { identifiant: "BLEU-01", reference: "RENO GOTS", couleur: "Bleu", unite: "m", laize: 148, recu: 1000, reste: 20 },
    { identifiant: "BLEU-02", reference: "Reno gots", couleur: "BLEU", unite: "m", laize: 148, recu: 615, reste: 12 },
  ];
  const t = pv.emploiTissu({
    conso: [
      { lot: "BLEU-01", rouleau: "R-1", consomme: 900, chute: 60 },
      { lot: "BLEU-02", rouleau: "R-2", consomme: 723, chute: 56.2 },
    ],
    lots,
    rouleauxDefaut: ["R-2", "R-9"],
    piecesParCouleur: { Bleu: 1356 },
    piecesTotal: 1356,
  });
  assert.equal(t.length, 1);
  assert.deepEqual(t[0], { ref: "RENO GOTS", coloris: "Bleu", unite: "m", recu: 1615, emploiMoyen: 1.197, utilise: 1623, chutes: 116.2, rouleauxDefaut: "R-2", total: 1739.2, stockApres: 32 });
});

test("deux coloris : emploi moyen sur les pièces de chaque couleur", () => {
  const lots = [
    { identifiant: "A", reference: "X", couleur: "Noir", unite: "m", laize: null, recu: 100, reste: 0 },
    { identifiant: "B", reference: "X", couleur: "Écru", unite: "m", laize: null, recu: 50, reste: 0 },
  ];
  const t = pv.emploiTissu({ conso: [{ lot: "A", rouleau: "1", consomme: 60, chute: 0 }, { lot: "B", rouleau: "2", consomme: 25, chute: 0 }], lots, rouleauxDefaut: [], piecesParCouleur: { noir: 50, ecru: 20 }, piecesTotal: 70 });
  assert.deepEqual(t.map((x) => [x.coloris, x.emploiMoyen]), [["Noir", 1.2], ["Écru", 1.25]]);
});

test("doublure et thermo repérés dans le plan", () => {
  const r = pv.autresMatieres([{ nom: "Tissu principal", consoPrevue: 1.2 }, { nom: "Doublure satin", consoPrevue: 0.8 }, { nom: "Thermocollant", consoPrevue: 0.11 }, { nom: "Bord-côte", consoPrevue: 0.05 }], "Tissu principal");
  assert.deepEqual(r.doublure, { libelle: "Doublure", ref: "Doublure satin", emploiMoyen: 0.8 });
  assert.deepEqual(r.thermo, { libelle: "Thermo", ref: "Thermocollant", emploiMoyen: 0.11 });
  assert.deepEqual(r.autres.map((a) => a.libelle), ["Bord-côte"]);
});

test("2e choix par taille d'après les livraisons", () => {
  assert.equal(pv.secondChoix([]), null);
  assert.deepEqual(pv.secondChoix([[{ taille: "34", second: 1 }, { taille: "36", second: 4 }], [{ taille: "34", second: 2 }]]), { "34": 3, "36": 4 });
  assert.equal(pv.total({ "34": 3, "36": 4 }, ["34", "36", "38"]), 7);
});

test("constats du coupeur : laize, 2e choix, rouleaux", () => {
  const ctx = { ofs: ["5", "6"], tailles: ["S", "M"], coupe: { "5": { S: 30, M: 10 }, "6": { S: 5 } }, rouleaux: ["R-1", "R-2"] };
  const c = pv.normaliserConstats({ laize: 148, second: { "5": { S: 2, M: 0 }, "6": { S: 1 } }, rouleaux: [{ code: "R-1", defaut: " trou à 12 m ", manquant: 0 }, { code: "R-2", defaut: "", manquant: 0 }] }, ctx);
  assert.deepEqual(c, { laize: 1.48, second: { "5": { S: 2 }, "6": { S: 1 } }, rouleaux: [{ code: "R-1", defaut: "trou à 12 m", manquant: 0 }] });
  assert.deepEqual(pv.secondDesConstats(c), { S: 3 });
  assert.equal(pv.secondDesConstats(pv.CONSTATS_VIDES), null);
  assert.equal(pv.normaliserConstats({ laize: "1,46" as unknown as number }, ctx).laize, 1.46);
  assert.throws(() => pv.normaliserConstats({ second: { "5": { M: 11 } } }, ctx), /11 pièces pour 10/);
  assert.throws(() => pv.normaliserConstats({ laize: 9 }, ctx), /vérifiez/);
  assert.throws(() => pv.normaliserConstats({ rouleaux: [{ code: "R-9", defaut: "x", manquant: 0 }] }, ctx), /inconnu/);
});

test("le manquant sur rouleau va dans « Chutes + défaut + manquant »", () => {
  const t = pv.emploiTissu({
    conso: [{ lot: "A", rouleau: "R-1", consomme: 100, chute: 4, manquant: 1.5 }],
    lots: [{ identifiant: "A", reference: "X", couleur: "Bleu", unite: "m", laize: null, recu: 120, reste: 14.5 }],
    rouleauxDefaut: [],
    piecesParCouleur: {},
    piecesTotal: 80,
  });
  assert.equal(t[0].chutes, 5.5);
  assert.equal(t[0].total, 105.5);
});
