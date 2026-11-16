import assert from "node:assert/strict";
import { describe, it } from "node:test";
import * as pq from "./paquet";
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

/* ═══════════ fini au poste, morceaux, découpage choisi (15/11) ═══════════ */

describe("lecture d'un scan qui contient un %", () => {
  it("ne plante pas sur un QR étranger", () => {
    assert.equal(pq.lireScanPaquet("WIFI:S:atelier;P:50%off;;"), null);
    assert.equal(pq.lireScanPaquet("Lot 80% coton"), null);
    assert.deepEqual(pq.lireScanPaquet("https://x/p/PQ-2026-000012%2F3"), { code: "PQ-2026-000012", rang: 3 });
  });
});

describe("quantité réelle et morceaux", () => {
  it("la quantité corrigée fait foi", () => {
    assert.equal(pq.qteEffective({ qte: 25, qteReelle: 23 }), 23);
    assert.equal(pq.qteEffective({ qte: 25, qteReelle: null }), 25);
    assert.equal(pq.qteEffective({ qte: 25, qteReelle: 0 }), 0);
  });
  it("un morceau annulé ne compte plus, l'étiquette garde son rang", () => {
    assert.deepEqual(pq.morceauxActifs(["Col", "Dos", "Manche"], ["dos"]), ["Col", "Manche"]);
    assert.deepEqual(pq.morceauxActifs([], []), [pq.LIASSE_UNIQUE]);
    assert.equal(pq.morceauDuRang(["Col", "Dos", "Manche"], 3), "Manche");
    assert.equal(pq.morceauDuRang(["Col"], 4), null);
  });
});

describe("découpage décidé par la coupe", () => {
  it("propose, lit, refuse une somme fausse", () => {
    assert.deepEqual(pq.proposerDecoupage(60, 25), [25, 25, 10]);
    assert.equal(pq.formatDecoupage([25, 25, 25, 10]), "3×25 + 10");
    assert.deepEqual(pq.lireDecoupage("3×25 + 10", 85), { ok: true, qtes: [25, 25, 25, 10] });
    assert.deepEqual(pq.lireDecoupage("20, 20 20", 60), { ok: true, qtes: [20, 20, 20] });
    assert.deepEqual(pq.lireDecoupage("2x30", 60), { ok: true, qtes: [30, 30] });
    const r = pq.lireDecoupage("25 25", 60);
    assert.equal(r.ok, false);
    assert.match((r as { error: string }).error, /50 pièces.*60.*-10/);
    assert.equal(pq.lireDecoupage("25 abc", 25).ok, false);
    assert.deepEqual(pq.lireDecoupage("", 0), { ok: true, qtes: [] });
  });
  it("numérote à la suite, taille après taille", () => {
    const n = pq.decouperSelonListes([{ taille: "S", qtes: [20, 20] }, { taille: "M", qtes: [30] }], 4, 100);
    assert.deepEqual(n.map((x) => [x.numero, x.taille, x.qte, x.pieceDebut, x.pieceFin]), [
      [5, "S", 20, 101, 120],
      [6, "S", 20, 121, 140],
      [7, "M", 30, 141, 170],
    ]);
  });
});

describe("fini au poste", () => {
  const base = { statutPaquet: "actif", assemble: false, morceaux: ["Col", "Manche"], deja: [] as { morceau: string; poste: string; ouvrier: string; date: string; heure: string }[] };
  it("accepte une première fois, refuse le même morceau au même poste, même un autre jour", () => {
    assert.equal(pq.refusFiniAuPoste({ ...base, morceau: "Col", poste: "Montage col" }), null);
    const deja = [{ morceau: "col", poste: "MONTAGE  COL", ouvrier: "Amel", date: "2026-11-14", heure: "h3" }];
    assert.match(pq.refusFiniAuPoste({ ...base, deja, morceau: "Col", poste: "Montage col" })!, /Amel le 14\/11\/2026 \(h3\)/);
    assert.equal(pq.refusFiniAuPoste({ ...base, deja, morceau: "Col", poste: "Surpiqûre col" }), null, "autre poste : normal");
    assert.equal(pq.refusFiniAuPoste({ ...base, deja, morceau: "Manche", poste: "Montage col" }), null, "autre morceau");
  });
  it("refuse un paquet annulé, assemblé, un morceau inconnu, un poste vide", () => {
    assert.match(pq.refusFiniAuPoste({ ...base, statutPaquet: "annule", morceau: "Col", poste: "x" })!, /annulé/);
    assert.match(pq.refusFiniAuPoste({ ...base, assemble: true, morceau: "Col", poste: "x" })!, /assemblé/);
    assert.match(pq.refusFiniAuPoste({ ...base, morceau: "Dos", poste: "x" })!, /n'est pas un morceau/);
    assert.match(pq.refusFiniAuPoste({ ...base, morceau: "Col", poste: " " })!, /poste/);
  });
  it("propose les pièces de l'heure sans compter deux fois un paquet entamé", () => {
    const cols = ["h1", "h2", "h3"];
    // 10 h : paquet 12 fini (25) → proposé 25 ; l'agent tape 35 (13 entamé).
    assert.equal(pq.propositionPieces({ cols, col: "h1", pieces: {}, finis: { h1: 25 } }), 25);
    // 11 h : paquet 13 fini (25) → 25 + 25 − 35 déjà déclarés = 15.
    assert.equal(pq.propositionPieces({ cols, col: "h2", pieces: { h1: 35 }, finis: { h1: 25, h2: 25 } }), 15);
    // ABS / RI ne comptent pas comme pièces.
    assert.equal(pq.propositionPieces({ cols, col: "h3", pieces: { h1: "ABS", h2: 20 }, finis: { h3: 25 } }), 5);
    assert.equal(pq.propositionPieces({ cols, col: "h9", pieces: {}, finis: {} }), 0);
  });
  it("recoupement : un paquet entamé par poste est toléré", () => {
    assert.equal(pq.controleFiniAuPoste({ pieces: 60, finis: 50, nbPaquets: 2, taillePaquet: 25, postes: 1 }), null);
    assert.match(pq.controleFiniAuPoste({ pieces: 90, finis: 50, nbPaquets: 2, taillePaquet: 25, postes: 1 })!.message, /40 pièces sans paquet fini/);
    assert.match(pq.controleFiniAuPoste({ pieces: 20, finis: 75, nbPaquets: 3, taillePaquet: 25, postes: 1 })!.message, /55 pièces manquent/);
    assert.equal(pq.controleFiniAuPoste({ pieces: 20, finis: 75, nbPaquets: 3, taillePaquet: 25, postes: 3 }), null);
    assert.equal(pq.controleFiniAuPoste({ pieces: 500, finis: 0, nbPaquets: 0, taillePaquet: 25, postes: 1 }), null);
  });
  it("un numéro tapé peut désigner deux OF : on rend les deux", () => {
    const p = [{ numero: 12, of: "A" }, { numero: 12, of: "B" }, { numero: 12, of: "C", statut: "annule" }, { numero: 3, of: "A" }];
    assert.deepEqual(pq.candidatsNumero(12, p).map((x) => x.of), ["A", "B"]);
  });
  it("l'état du morceau dit le dernier poste passé et par qui", () => {
    const r = (id: number, etape: string, liasse: string, x: Partial<pq.Releve> = {}): pq.Releve => ({ id, paquetId: 1, liasse, etape, qte: null, note: "", date: "2026-11-15", annuleId: null, par: "agent", ...x });
    const e = pq.etatPaquet(["Col", "Dos"], [r(1, "poste", "Col", { poste: "Montage col", ouvrier: "Amel" }), r(2, "poste", "Col", { poste: "Surpiqûre", ouvrier: "Sana" })]);
    assert.equal(e.cases[0].etat, "en_cours");
    assert.deepEqual([e.cases[0].poste, e.cases[0].ouvrier, e.cases[0].nbPostes, e.cases[0].par], ["Surpiqûre", "Sana", 2, "Sana"]);
    assert.equal(e.cases[1].etat, "vide");
    assert.equal(e.avancement, "en_cours");
  });
});
