import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bilanOf,
  decouperEnPaquets,
  etatPaquet,
  formatCodePaquet,
  LIASSE_UNIQUE,
  lireScanPaquet,
  normaliserLiasses,
  refusReleve,
  relevesValables,
  resumeScan,
  type Releve,
} from "./paquet";

const LIASSES = ["Col", "Devant", "Manches", "Dos"];
let seq = 0;
const rel = (p: Partial<Releve> = {}): Releve => ({
  id: ++seq, paquetId: 1, liasse: "", etape: "liasse", qte: null, note: "",
  date: "2026-10-12", annuleId: null, par: "Leila", ...p,
});

describe("code et scan", () => {
  it("code lisible et stable", () => {
    assert.equal(formatCodePaquet(2026, 145), "PQ-2026-000145");
  });
  it("lit l'adresse du QR, avec ou sans le rang de liasse", () => {
    assert.deepEqual(lireScanPaquet("https://app/p/PQ-2026-000145/2"), { code: "PQ-2026-000145", rang: 2 });
    assert.deepEqual(lireScanPaquet("https://app/p/PQ-2026-000145"), { code: "PQ-2026-000145", rang: null });
    assert.deepEqual(lireScanPaquet(" pq-2026-000145 "), { code: "PQ-2026-000145", rang: null });
    assert.equal(lireScanPaquet("R-2026-000145"), null); // un rouleau n'est pas un paquet
    assert.equal(lireScanPaquet(""), null);
  });
});

describe("liasses d'un modèle", () => {
  it("nettoie espaces, doublons et vides", () => {
    assert.deepEqual(normaliserLiasses([" Col ", "col", "", "  Devant  "]), ["Col", "Devant"]);
  });
  it("sans liste, le paquet voyage d'un bloc — le suivi marche quand même", () => {
    assert.deepEqual(normaliserLiasses([]), [LIASSE_UNIQUE]);
    assert.deepEqual(normaliserLiasses(null), [LIASSE_UNIQUE]);
  });
  it("plafonnée pour rester lisible", () => {
    assert.equal(normaliserLiasses(Array.from({ length: 30 }, (_, i) => `L${i}`)).length, 12);
  });
});

describe("découpage d'une coupe en paquets", () => {
  it("1 200 pièces par 25 = 48 paquets, numérotés de 1 à 48", () => {
    const p = decouperEnPaquets([{ taille: "M", qte: 1200 }], 25);
    assert.equal(p.length, 48);
    assert.deepEqual(p[0], { numero: 1, taille: "M", qte: 25, pieceDebut: 1, pieceFin: 25 });
    assert.deepEqual(p[11], { numero: 12, taille: "M", qte: 25, pieceDebut: 276, pieceFin: 300 });
    assert.equal(p[47].pieceFin, 1200);
  });
  it("jamais deux tailles dans un paquet : chaque taille finit sur son reste", () => {
    const p = decouperEnPaquets([{ taille: "36", qte: 30 }, { taille: "38", qte: 60 }], 25);
    assert.deepEqual(p.map((x) => [x.numero, x.taille, x.qte]), [
      [1, "36", 25], [2, "36", 5],
      [3, "38", 25], [4, "38", 25], [5, "38", 10],
    ]);
    // La numérotation des pièces court sur tout l'OF, sans trou ni doublon.
    assert.deepEqual(p.map((x) => [x.pieceDebut, x.pieceFin]), [[1, 25], [26, 30], [31, 55], [56, 80], [81, 90]]);
  });
  it("une recoupe continue la numérotation au lieu de la recommencer", () => {
    const p = decouperEnPaquets([{ taille: "M", qte: 30 }], 25, 48, 1200);
    assert.deepEqual(p.map((x) => x.numero), [49, 50]);
    assert.equal(p[0].pieceDebut, 1201);
  });
  it("quantité nulle ou taille absurde : rien ou pas de boucle infinie", () => {
    assert.deepEqual(decouperEnPaquets([{ taille: "M", qte: 0 }], 25), []);
    assert.equal(decouperEnPaquets([{ taille: "M", qte: 3 }], 0).length, 3);
  });
});

describe("état d'un paquet, dérivé du journal", () => {
  it("sans relevé : sans nouvelle, jamais « en retard »", () => {
    const e = etatPaquet(LIASSES, []);
    assert.equal(e.avancement, "vide");
    assert.equal(e.pret, false);
    assert.deepEqual(e.manquantes, LIASSES);
  });
  it("liasses relevées une à une", () => {
    const e = etatPaquet(LIASSES, [rel({ liasse: "Col" }), rel({ liasse: "Manches" })]);
    assert.equal(e.avancement, "en_cours");
    assert.deepEqual(e.manquantes, ["Devant", "Dos"]);
    assert.deepEqual(e.cases.map((c) => c.etat), ["fait", "vide", "fait", "vide"]);
  });
  it("toutes relevées : prêt à assembler", () => {
    const e = etatPaquet(LIASSES, LIASSES.map((l) => rel({ liasse: l })));
    assert.equal(e.avancement, "pret");
    assert.equal(e.pret, true);
  });
  it("assemblé : le paquet est fini, et il l'est même si une liasse manquait", () => {
    const e = etatPaquet(LIASSES, [rel({ liasse: "Col" }), rel({ etape: "assemble", date: "2026-10-13" })]);
    assert.equal(e.avancement, "assemble");
    assert.equal(e.assembleLe, "2026-10-13");
  });
  it("un problème signalé puis corrigé : le dernier relevé fait foi", () => {
    const e = etatPaquet(LIASSES, [rel({ liasse: "Col", etape: "probleme", note: "2 pièces manquent" }), rel({ liasse: "Col" })]);
    assert.equal(e.cases[0].etat, "fait");
    assert.equal(e.probleme, false);
  });
  it("une annulation neutralise un relevé sans l'effacer", () => {
    const pose = rel({ liasse: "Col" });
    const e = etatPaquet(LIASSES, [pose, rel({ etape: "annulation", annuleId: pose.id })]);
    assert.equal(e.cases[0].etat, "vide");
    assert.equal(relevesValables([pose, rel({ etape: "annulation", annuleId: pose.id })]).length, 0);
  });
  it("la casse et les espaces ne cassent pas le rapprochement", () => {
    assert.equal(etatPaquet(LIASSES, [rel({ liasse: " col " })]).cases[0].etat, "fait");
  });
});

describe("vue d'ensemble d'un OF", () => {
  const p = (qte: number, releves: Releve[]) => ({ qte, etat: etatPaquet(LIASSES, releves) });
  it("compte les paquets par état et les pièces assemblées", () => {
    const b = bilanOf([
      p(25, []),
      p(25, [rel({ liasse: "Col" })]),
      p(25, LIASSES.map((l) => rel({ liasse: l }))),
      p(10, [rel({ etape: "assemble" })]),
    ]);
    assert.equal(b.nbPaquets, 4);
    assert.equal(b.pieces, 85);
    assert.deepEqual([b.vides, b.enCours, b.prets, b.assembles], [1, 1, 1, 1]);
    assert.equal(b.piecesAssemblees, 10);
  });
  it("désigne la liasse qui retarde le plus d'assemblages", () => {
    const b = bilanOf([
      p(25, [rel({ liasse: "Col" }), rel({ liasse: "Devant" }), rel({ liasse: "Dos" })]),
      p(25, [rel({ liasse: "Col" }), rel({ liasse: "Dos" })]),
    ]);
    assert.equal(b.liasseEnRetard?.liasse, "Manches");
    assert.equal(b.liasseEnRetard?.manque, 2);
  });
  it("un paquet dont rien n'est relevé n'accuse aucune liasse", () => {
    assert.equal(bilanOf([p(25, [])]).liasseEnRetard, null);
  });
});

describe("ce que la tournée a le droit de faire", () => {
  const vide = etatPaquet(LIASSES, []);
  const base = { statutPaquet: "actif", liasses: LIASSES, etat: vide };
  it("relever une liasse du paquet : autorisé", () => {
    assert.equal(refusReleve({ ...base, etape: "liasse", liasse: "Col" }), null);
  });
  it("assembler sans avoir tout relevé : AUTORISÉ — la tournée peut avoir sauté des jours", () => {
    assert.equal(refusReleve({ ...base, etape: "assemble", liasse: "" }), null);
  });
  it("liasse inconnue du paquet : refusé", () => {
    assert.match(refusReleve({ ...base, etape: "liasse", liasse: "Poche" }) ?? "", /n'est pas une liasse/);
  });
  it("paquet annulé ou déjà assemblé", () => {
    assert.match(refusReleve({ ...base, statutPaquet: "annule", etape: "liasse", liasse: "Col" }) ?? "", /annulé/);
    const assemble = etatPaquet(LIASSES, [rel({ etape: "assemble" })]);
    assert.match(refusReleve({ ...base, etat: assemble, etape: "liasse", liasse: "Col" }) ?? "", /déjà assemblé/);
    assert.match(refusReleve({ ...base, etat: assemble, etape: "assemble", liasse: "" }) ?? "", /déjà marqué assemblé/);
  });
});

describe("retour affiché après un scan", () => {
  it("dit où en est le paquet, en une ligne", () => {
    const e = etatPaquet(LIASSES, [rel({ liasse: "Col" }), rel({ liasse: "Dos" })]);
    assert.equal(resumeScan(12, "M", e), "Paquet 12 · M — 2/4 liasse(s)");
  });
});
