import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { appliquerSaisie, avancementHeure, heureASaisir, lireCellule, type Matrices, type Saisie } from "./saisie-gpao";

const roster = [
  { id: 1, nom: "Fadila", poste: "Repassage", sam: 90 },
  { id: 2, nom: "Wided", poste: "Assemblage", sam: 75 },
];
const vide = (): Matrices => ({ cols: ["H1", "H2", "H3"], cloture: false, sortie: {}, ops: {}, ret: {}, opsSam: {}, opsPoste: {}, opsDetail: {}, arrets: {} });
const appliquer = (m: Matrices, ...ss: Saisie[]) => {
  for (const s of ss) {
    const r = appliquerSaisie(m, roster, s);
    if (!r.ok) throw new Error(r.error);
    m = r.matrices;
  }
  return m;
};

describe("saisie case par case", () => {
  it("deux saisies sur des cases différentes s'additionnent (plus d'écrasement)", () => {
    // La tablette saisit Fadila, le bureau saisit Wided, sur la même journée.
    const m = appliquer(vide(), { type: "op", ouvId: 1, col: "H1", valeur: 40 }, { type: "op", ouvId: 2, col: "H1", valeur: 48 });
    assert.deepEqual(m.ops, { 1: { H1: 40 }, 2: { H1: 48 } });
  });
  it("RI / ABS et effacement", () => {
    let m = appliquer(vide(), { type: "op", ouvId: 1, col: "H2", valeur: "ABS" });
    assert.equal(m.ops[1].H2, "ABS");
    m = appliquer(m, { type: "op", ouvId: 1, col: "H2", valeur: null });
    assert.deepEqual(m.ops, {});
  });
  it("sortie de chaîne et retouches", () => {
    const m = appliquer(vide(), { type: "sortie", col: "H1", valeur: 35 }, { type: "ret", ouvId: 2, valeur: 3 });
    assert.deepEqual(m.sortie, { H1: 35 });
    assert.deepEqual(m.ret, { 2: 3 });
  });
  it("refus : journée clôturée, heure ou ouvrière inconnue, quantité absurde", () => {
    assert.equal(appliquerSaisie({ ...vide(), cloture: true }, roster, { type: "sortie", col: "H1", valeur: 3 }).ok, false);
    assert.equal(appliquerSaisie(vide(), roster, { type: "sortie", col: "H9", valeur: 3 }).ok, false);
    assert.equal(appliquerSaisie(vide(), roster, { type: "op", ouvId: 99, col: "H1", valeur: 3 }).ok, false);
    assert.equal(appliquerSaisie(vide(), roster, { type: "op", ouvId: 1, col: "H1", valeur: -2 }).ok, false);
  });
  it("seule la réouverture est permise sur une journée clôturée", () => {
    assert.equal(appliquerSaisie({ ...vide(), cloture: true }, roster, { type: "cloture", valeur: false }).ok, true);
  });
  it("lit ce que tape l'agent", () => {
    assert.deepEqual(lireCellule(" 42,5 "), { ok: true, valeur: 42.5 });
    assert.deepEqual(lireCellule("abs"), { ok: true, valeur: "ABS" });
    assert.deepEqual(lireCellule(""), { ok: true, valeur: null });
    assert.equal(lireCellule("12a").ok, false);
  });
});

describe("changement de poste dans l'heure", () => {
  it("une ligne sur un autre poste : quantité + poste + SAM de l'heure", () => {
    const m = appliquer(vide(), { type: "posteHeure", ouvId: 1, col: "H2", lignes: [{ poste: "Ourlet", sam: 60, qte: 50 }] });
    assert.equal(m.ops[1].H2, 50);
    assert.equal(m.opsPoste[1].H2, "Ourlet");
    assert.equal(m.opsSam[1].H2, 60);
    assert.deepEqual(m.opsDetail, {});
  });
  it("deux postes dans l'heure : détail multi-postes, quantité = somme", () => {
    const m = appliquer(vide(), {
      type: "posteHeure",
      ouvId: 1,
      col: "H3",
      lignes: [
        { poste: "Repassage", sam: 90, qte: 20 },
        { poste: "Ourlet", sam: 60, qte: 15 },
      ],
    });
    assert.equal(m.ops[1].H3, 35);
    assert.equal(m.opsDetail[1].H3.length, 2);
  });
  it("retour au poste habituel : plus de surcharge", () => {
    let m = appliquer(vide(), { type: "posteHeure", ouvId: 1, col: "H2", lignes: [{ poste: "Ourlet", sam: 60, qte: 50 }] });
    m = appliquer(m, { type: "posteHeure", ouvId: 1, col: "H2", lignes: [{ poste: "Repassage", sam: 90, qte: 38 }] });
    assert.deepEqual(m.opsPoste, {});
    assert.deepEqual(m.opsSam, {});
    assert.equal(m.ops[1].H2, 38);
  });
  it("une quantité simple remplace le détail multi-postes de l'heure", () => {
    let m = appliquer(vide(), { type: "posteHeure", ouvId: 1, col: "H1", lignes: [{ poste: "A", sam: 60, qte: 1 }, { poste: "B", sam: 60, qte: 2 }] });
    m = appliquer(m, { type: "op", ouvId: 1, col: "H1", valeur: 30 });
    assert.deepEqual(m.opsDetail, {});
    assert.equal(m.ops[1].H1, 30);
  });
  it("fenêtre du bureau : heures vidées, RI conservé", () => {
    let m = appliquer(vide(), { type: "op", ouvId: 1, col: "H1", valeur: 10 }, { type: "op", ouvId: 1, col: "H2", valeur: "RI" });
    m = appliquer(m, { type: "postesJour", ouvId: 1, heures: { H3: [{ poste: "Ourlet", sam: 60, qte: 9 }] } });
    assert.deepEqual(m.ops[1], { H2: "RI", H3: 9 });
  });
});

describe("arrêts", () => {
  it("ajout et retrait", () => {
    let m = appliquer(vide(), { type: "arretAjout", ouvId: 2, motif: "Panne machine", secondes: 600 }, { type: "arretAjout", ouvId: 2, motif: "Manque de fil", secondes: 120 });
    assert.equal(m.arrets[2].length, 2);
    m = appliquer(m, { type: "arretRetrait", ouvId: 2, index: 0 });
    assert.deepEqual(m.arrets[2], [{ motif: "Manque de fil", secondes: 120 }]);
  });
  it("durée ou motif invalide refusés", () => {
    assert.equal(appliquerSaisie(vide(), roster, { type: "arretAjout", ouvId: 2, motif: "", secondes: 60 }).ok, false);
    assert.equal(appliquerSaisie(vide(), roster, { type: "arretAjout", ouvId: 2, motif: "X", secondes: 0 }).ok, false);
  });
});

describe("avancement de la saisie", () => {
  it("heure complète = toutes les ouvrières + sortie ; on propose la première incomplète", () => {
    const m = appliquer(vide(), { type: "op", ouvId: 1, col: "H1", valeur: 10 }, { type: "op", ouvId: 2, col: "H1", valeur: "ABS" }, { type: "sortie", col: "H1", valeur: 8 }, { type: "op", ouvId: 1, col: "H2", valeur: 9 });
    assert.equal(avancementHeure(m, roster, "H1").complete, true);
    assert.deepEqual(avancementHeure(m, roster, "H2"), { faites: 1, total: 2, sortie: false, complete: false });
    assert.equal(heureASaisir(m, roster), "H2");
  });
  it("retirer une ouvrière retire sa saisie", () => {
    const m = appliquer(vide(), { type: "op", ouvId: 1, col: "H1", valeur: 10 }, { type: "ret", ouvId: 1, valeur: 1 }, { type: "retirerOuvriere", ouvId: 1 });
    assert.deepEqual(m.ops, {});
    assert.deepEqual(m.ret, {});
  });
});
