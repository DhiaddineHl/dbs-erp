import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { TracePlan } from "@/lib/db/schema";
import {
  CONTRAINTES_DEFAUT,
  changerTailles,
  consoReellePiece,
  consoTotale,
  copierStructure,
  ecartsParTaille,
  estEstime,
  etatPlan,
  grilleDetaille,
  grilleDetaillee,
  grilleDifferente,
  type Matiere,
  type Plan,
  piecesParTaille,
  piecesTotales,
  planComplet,
  proposerTraces,
  totalCommande,
} from "./plan-coupe";

/* Le plan de coupe décide du métrage : combien de tissu une commande consomme
 * vraiment, et donc si le magasin en a commandé assez. Une erreur ici ne se
 * voit pas à l'écran — elle se voit en rupture de tissu au milieu d'un
 * matelas, quand le rouleau est déjà entamé.
 *
 * Ce qui est vérifié : l'arithmétique du matelassage (plis × tracé), le
 * garde-fou des longueurs estimées, et le proposeur de tracés — le seul
 * véritable algorithme du module. */

const SIZES = ["S", "M", "L", "XL"];

const trace = (o: Partial<TracePlan> = {}): TracePlan => ({
  nom: "",
  longueur: 0,
  plis: 0,
  estime: false,
  qty: Object.fromEntries(SIZES.map((s) => [s, 0])),
  ...o,
});

const matiere = (o: Partial<Matiere> = {}): Matiere => ({
  rang: 0,
  nom: "Tissu principal",
  lotId: null,
  laise: 150,
  consoPrevue: null,
  perteBout: null,
  traces: [],
  ...o,
});

const plan = (o: Partial<Plan> = {}): Plan => ({
  sizes: SIZES,
  ordre: { S: 0, M: 0, L: 0, XL: 0 },
  contraintes: CONTRAINTES_DEFAUT,
  matieres: [],
  par: "",
  date: null,
  ...o,
});

/* ═══════════ arithmétique du matelassage ═══════════ */

describe("pièces coupées", () => {
  it("multiplie le contenu du tracé par la hauteur du matelas", () => {
    const m = matiere({
      traces: [trace({ plis: 30, qty: { S: 1, M: 2, L: 1, XL: 0 } })],
    });
    assert.deepEqual(piecesParTaille(m, SIZES), { S: 30, M: 60, L: 30, XL: 0 });
    assert.equal(piecesTotales(m, SIZES), 120);
  });

  it("additionne les tracés d'une même matière", () => {
    const m = matiere({
      traces: [
        trace({ plis: 20, qty: { S: 1, M: 1, L: 0, XL: 0 } }),
        trace({ plis: 10, qty: { S: 0, M: 1, L: 2, XL: 1 } }),
      ],
    });
    assert.deepEqual(piecesParTaille(m, SIZES), { S: 20, M: 30, L: 20, XL: 10 });
  });

  it("ignore un matelas sans plis — un tracé posé n'est pas un tracé coupé", () => {
    const m = matiere({ traces: [trace({ plis: 0, qty: { S: 4, M: 4, L: 4, XL: 4 } })] });
    assert.equal(piecesTotales(m, SIZES), 0);
  });
});

describe("consommation", () => {
  it("compte la longueur du tracé sur toute la hauteur du matelas", () => {
    const m = matiere({
      traces: [trace({ longueur: 5.4, plis: 30 }), trace({ longueur: 2.5, plis: 10 })],
    });
    assert.equal(+consoTotale(m).toFixed(2), 187.0);
  });

  it("rend les mètres par pièce", () => {
    const m = matiere({
      traces: [trace({ longueur: 4, plis: 25, qty: { S: 1, M: 1, L: 0, XL: 0 } })],
    });
    // 100 m pour 50 pièces
    assert.equal(consoReellePiece(m, SIZES), 2);
  });

  it("ne rend rien quand rien n'est coupé — zéro pièce n'est pas zéro mètre", () => {
    assert.equal(consoReellePiece(matiere(), SIZES), null);
  });
});

/* ═══════════ le garde-fou des longueurs estimées ═══════════ */

describe("longueurs estimées", () => {
  it("signale une matière dont un tracé qui compte est encore estimé", () => {
    const m = matiere({ traces: [trace({ longueur: 5, plis: 20, estime: true })] });
    assert.equal(estEstime(m), true);
  });

  it("ne signale pas un tracé estimé mais vide : il ne fausse aucun métrage", () => {
    const m = matiere({ traces: [trace({ longueur: 5, plis: 0, estime: true })] });
    assert.equal(estEstime(m), false);
  });

  it("un plan encore estimé n'est jamais complet", () => {
    const m = matiere({ traces: [trace({ longueur: 5, plis: 100, estime: true, qty: { S: 1, M: 1, L: 1, XL: 1 } })] });
    const p = plan({ ordre: { S: 10, M: 10, L: 10, XL: 10 }, matieres: [m] });
    assert.equal(planComplet(p), false);
  });

  it("est complet quand les longueurs sont mesurées et la commande couverte", () => {
    const m = matiere({ traces: [trace({ longueur: 5, plis: 10, qty: { S: 1, M: 1, L: 1, XL: 1 } })] });
    const p = plan({ ordre: { S: 10, M: 10, L: 10, XL: 10 }, matieres: [m] });
    assert.equal(totalCommande(p), 40);
    assert.equal(planComplet(p), true);
  });

  it("n'est pas complet si la coupe ne couvre pas la commande", () => {
    const m = matiere({ traces: [trace({ longueur: 5, plis: 5, qty: { S: 1, M: 1, L: 1, XL: 1 } })] });
    const p = plan({ ordre: { S: 10, M: 10, L: 10, XL: 10 }, matieres: [m] });
    assert.equal(planComplet(p), false);
  });
});

/* ═══════════ écarts ═══════════ */

describe("écarts coupé / commandé", () => {
  it("rend le manque en négatif et le surplus en positif", () => {
    const m = matiere({ traces: [trace({ plis: 10, qty: { S: 1, M: 2, L: 0, XL: 0 } })] });
    const p = plan({ ordre: { S: 12, M: 20, L: 5, XL: 0 }, matieres: [m] });
    assert.deepEqual(ecartsParTaille(p, m), { S: -2, M: 0, L: -5, XL: 0 });
  });
});

/* ═══════════ le proposeur de tracés ═══════════ */

describe("proposerTraces", () => {
  it("couvre la commande sans jamais laisser de pièce derrière", () => {
    const p = plan({ ordre: { S: 40, M: 120, L: 90, XL: 30 } });
    const m = matiere({ consoPrevue: 1.35 });
    const traces = proposerTraces(p, m);
    assert.ok(traces.length > 0);

    const coupe = piecesParTaille({ ...m, traces }, SIZES);
    for (const s of SIZES) assert.ok(coupe[s] >= p.ordre[s], `${s} : ${coupe[s]} < ${p.ordre[s]}`);
  });

  it("respecte le nombre de pièces par tracé et la hauteur des matelas", () => {
    const p = plan({
      ordre: { S: 40, M: 120, L: 90, XL: 30 },
      contraintes: { maxPiecesTrace: 3, maxPlis: 40, surplusTolere: 0 },
    });
    const traces = proposerTraces(p, matiere({ consoPrevue: 1.2 }));
    for (const t of traces) {
      const places = SIZES.reduce((a, s) => a + t.qty[s], 0);
      assert.ok(places <= 3, `${places} pièces dans un tracé limité à 3`);
      assert.ok(t.plis >= 1 && t.plis <= 40, `hauteur ${t.plis} hors des bornes`);
    }
  });

  it("marque les longueurs comme estimées quand une conso prévue est connue", () => {
    const p = plan({ ordre: { S: 10, M: 10, L: 0, XL: 0 } });
    const traces = proposerTraces(p, matiere({ consoPrevue: 1.5 }));
    assert.ok(traces.every((t) => t.estime));
    assert.ok(traces.every((t) => t.longueur > 0));
  });

  it("laisse les longueurs à zéro, non estimées, sans conso prévue", () => {
    const p = plan({ ordre: { S: 10, M: 10, L: 0, XL: 0 } });
    const traces = proposerTraces(p, matiere({ consoPrevue: null }));
    assert.ok(traces.every((t) => t.longueur === 0));
    assert.ok(traces.every((t) => !t.estime));
  });

  it("sait travailler à une seule pièce par tracé", () => {
    const p = plan({
      ordre: { S: 10, M: 25, L: 0, XL: 0 },
      contraintes: { maxPiecesTrace: 1, maxPlis: 20, surplusTolere: 0 },
    });
    const m = matiere({ consoPrevue: 1 });
    const traces = proposerTraces(p, m);
    for (const t of traces) assert.equal(SIZES.reduce((a, s) => a + t.qty[s], 0), 1);
    const coupe = piecesParTaille({ ...m, traces }, SIZES);
    assert.ok(coupe.S >= 10 && coupe.M >= 25);
  });

  it("gère la taille unique", () => {
    const p = plan({ sizes: ["TU"], ordre: { TU: 500 }, contraintes: { maxPiecesTrace: 4, maxPlis: 100, surplusTolere: 0 } });
    const m = matiere({ consoPrevue: 1.1 });
    const traces = proposerTraces(p, m);
    assert.ok(piecesTotales({ ...m, traces }, ["TU"]) >= 500);
  });

  it("ne propose rien quand rien n'est commandé", () => {
    assert.deepEqual(proposerTraces(plan(), matiere({ consoPrevue: 1 })), []);
  });

  it("termine même sur une commande volumineuse et fragmentée", () => {
    const p = plan({
      sizes: ["34", "36", "38", "40", "42", "44"],
      ordre: { "34": 7, "36": 313, "38": 1204, "40": 998, "42": 271, "44": 13 },
      contraintes: { maxPiecesTrace: 5, maxPlis: 60, surplusTolere: 2 },
    });
    const m = matiere({ consoPrevue: 1.42 });
    const traces = proposerTraces(p, m);
    assert.ok(traces.length > 0 && traces.length < 800);
    const coupe = piecesParTaille({ ...m, traces }, p.sizes);
    for (const s of p.sizes) assert.ok(coupe[s] + p.contraintes.surplusTolere >= p.ordre[s]);
  });
});

/* ═══════════ report vers la commande ═══════════ */

describe("grille de tailles", () => {
  it("ne retient que les tailles réellement commandées", () => {
    const p = plan({ ordre: { S: 0, M: 120, L: 90, XL: 0 } });
    assert.deepEqual(grilleDetaillee(p), [
      { taille: "M", qte: 120 },
      { taille: "L", qte: 90 },
    ]);
  });

  it("une grille réduite à TU ne détaille rien", () => {
    assert.equal(grilleDetaille([{ taille: "TU", qte: 300 }]), false);
    assert.equal(grilleDetaille([{ taille: "M", qte: 300 }]), true);
    assert.equal(grilleDetaille([]), false);
  });

  it("compare la grille du plan à celle de la commande", () => {
    const grille = [{ taille: "M", qte: 120 }];
    assert.equal(grilleDifferente([{ taille: "M", qte: 120 }], grille), false);
    assert.equal(grilleDifferente([{ taille: "M", qte: 100 }], grille), true);
    assert.equal(grilleDifferente([], grille), true);
  });
});

/* ═══════════ manipulation du plan ═══════════ */

describe("copierStructure", () => {
  it("reprend les tailles et la hauteur, jamais les longueurs", () => {
    const source = matiere({
      traces: [trace({ nom: "Tracé 1", longueur: 5.4, plis: 30, estime: true, qty: { S: 1, M: 2, L: 1, XL: 0 } })],
    });
    const copie = copierStructure(source);
    assert.equal(copie[0].plis, 30);
    assert.deepEqual(copie[0].qty, { S: 1, M: 2, L: 1, XL: 0 });
    assert.equal(copie[0].longueur, 0);
    assert.equal(copie[0].estime, false);
  });

  it("détache les quantités de la matière d'origine", () => {
    const source = matiere({ traces: [trace({ qty: { S: 1, M: 0, L: 0, XL: 0 } })] });
    const copie = copierStructure(source);
    copie[0].qty.S = 9;
    assert.equal(source.traces[0].qty.S, 1);
  });
});

describe("changerTailles", () => {
  it("garde ce qui existait, met à zéro ce qui apparaît, oublie le reste", () => {
    const p = plan({
      ordre: { S: 10, M: 20, L: 30, XL: 40 },
      matieres: [matiere({ traces: [trace({ qty: { S: 1, M: 2, L: 3, XL: 4 } })] })],
    });
    const next = changerTailles(p, ["M", "L", "XXL"]);
    assert.deepEqual(next.sizes, ["M", "L", "XXL"]);
    assert.deepEqual(next.ordre, { M: 20, L: 30, XXL: 0 });
    assert.deepEqual(next.matieres[0].traces[0].qty, { M: 2, L: 3, XXL: 0 });
  });
});

/* ═══════════ état affiché ═══════════ */

describe("etatPlan", () => {
  it("dit « à préparer » quand il n'y a rien", () => {
    assert.equal(etatPlan(null).kind, "absent");
    assert.equal(etatPlan(plan()).kind, "absent");
  });

  it("distingue un plan estimé d'un plan mesuré", () => {
    const estimee = matiere({ traces: [trace({ longueur: 5, plis: 20, estime: true })] });
    const mesuree = matiere({ traces: [trace({ longueur: 5, plis: 20 })] });
    assert.equal(etatPlan(plan({ matieres: [estimee] })).kind, "estime");
    assert.equal(etatPlan(plan({ matieres: [mesuree] })).kind, "pret");
  });
});
