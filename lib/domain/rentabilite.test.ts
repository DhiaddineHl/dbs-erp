import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { ParamsUsine } from "./cout-usine";
import {
  analyserModeles,
  comparerSousTraitance,
  pertesPeriode,
  pointMort,
  prixPlancher,
  rapportRentabilite,
  type ProductionModele,
} from "./rentabilite";

const proche = (a: number | null | undefined, b: number, eps = 0.01) =>
  assert.ok(a != null && Math.abs(a - b) < eps, `${a} ≉ ${b}`);

const DBS: ParamsUsine = { chargesMensuelles: 44_000, effectifDirect: 45, heuresMois: 195, joursOuvresMois: 26, rendementCible: 80, margeCible: 15, minutesRetouche: 0 };
const H = 44_000 / 8_775; // ≈ 5,014 €/h

const modele = (o: Partial<ProductionModele>): ProductionModele => ({
  modeleId: 1,
  nom: "M",
  ref: "",
  client: "",
  samSec: 1800,
  heures: 100,
  pieces: 100,
  prixVente: 10,
  prixFacon: null,
  commande: "",
  arretsSec: 0,
  retouches: 0,
  ...o,
});

describe("prix plancher", () => {
  it("SAM 30 min à 100 % : 2,51 € de coût", () => {
    const p = prixPlancher({ samSec: 1800, coutHoraire: H, rendement: 1, marge: 0 });
    proche(p?.cout, 2.507);
    proche(p?.prix, 2.507);
  });
  it("au rendement 69 % le coût monte à 3,63 €, et la marge 15 % s'applique sur le prix", () => {
    const p = prixPlancher({ samSec: 1800, coutHoraire: H, rendement: 0.69, marge: 0.15 });
    proche(p?.cout, 3.633);
    proche(p?.prix, 3.633 / 0.85);
    proche(p?.minutesPayees, 30 / 0.69);
  });
  it("données manquantes → null", () => {
    assert.equal(prixPlancher({ samSec: 0, coutHoraire: H, rendement: 1, marge: 0 }), null);
    assert.equal(prixPlancher({ samSec: 1800, coutHoraire: H, rendement: 0, marge: 0 }), null);
  });
});

describe("marge par modèle", () => {
  const opts = { coutHoraireReel: 6, coutHoraireStandard: H, rendementCible: 0.8, margeCible: 0.15 };
  it("coût = heures × coût réel ; classe les perdants en premier", () => {
    const r = analyserModeles(
      [
        modele({ modeleId: 1, nom: "Gagnant", heures: 100, pieces: 200, prixVente: 10 }), // CA 2000, coût 600
        modele({ modeleId: 2, nom: "Perdant", heures: 100, pieces: 50, prixVente: 10 }), // CA 500, coût 600
        modele({ modeleId: 3, nom: "Sans prix", heures: 10, pieces: 10, prixVente: null }),
      ],
      opts,
    );
    assert.equal(r[0].nom, "Perdant");
    assert.equal(r[0].verdict, "perd");
    proche(r[0].marge, -100);
    const g = r.find((x) => x.nom === "Gagnant")!;
    assert.equal(g.verdict, "gagne");
    proche(g.coutPiece, 3);
    proche(g.minutesReellesPiece, 30);
    proche(g.rendement, 1); // 200 × 30 min = 100 h standard / 100 h
    assert.equal(r.find((x) => x.nom === "Sans prix")!.verdict, "sans-prix");
  });
  it("marge positive mais sous la cible → « juste »", () => {
    const [m] = analyserModeles([modele({ heures: 100, pieces: 100, prixVente: 6.6 })], opts); // CA 660, coût 600 → 9 %
    assert.equal(m.verdict, "juste");
  });
  it("compare au prix façon connu", () => {
    const [m] = analyserModeles([modele({ heures: 100, pieces: 200, prixFacon: 3.5 })], opts);
    proche(m.ecartFacon, 3 - 3.5); // interne moins cher de 0,50 €/pc
  });
});

describe("pertes", () => {
  it("chiffre heures non saisies, sous-rendement, dont arrêts", () => {
    const p = pertesPeriode({
      heuresTheoriques: 1000,
      heuresSaisies: 900,
      heuresStandard: 630, // rendement 70 % pour une cible de 80 %
      arretsSec: 20 * 3600,
      retouches: 120,
      coutHoraire: 5,
      rendementCible: 0.8,
      minutesRetouche: 0,
    });
    proche(p.heuresNonSaisies, 100);
    proche(p.eurosNonSaisies, 500);
    proche(p.heuresSousRendement, 90); // 900 × 0,8 − 630
    proche(p.eurosSousRendement, 450);
    proche(p.eurosArrets, 100);
    proche(p.eurosAutresCauses, 350);
    assert.equal(p.eurosRetouches, null);
    proche(p.total, 950);
  });
  it("un arrêt ne dépasse jamais l'écart de rendement ; retouches chiffrées si réglées", () => {
    const p = pertesPeriode({
      heuresTheoriques: 100,
      heuresSaisies: 100,
      heuresStandard: 79,
      arretsSec: 50 * 3600,
      retouches: 60,
      coutHoraire: 5,
      rendementCible: 0.8,
      minutesRetouche: 3,
    });
    proche(p.heuresArrets, 1);
    proche(p.eurosAutresCauses, 0);
    proche(p.eurosRetouches, 15); // 60 × 3 min = 3 h × 5 €
  });
});

describe("point mort", () => {
  it("répartit les charges sur les jours produits et cumule", () => {
    const pm = pointMort(
      [
        { date: "2026-09-02", ca: 1500, pieces: 150 },
        { date: "2026-09-01", ca: 900, pieces: 90 },
      ],
      2000,
    );
    proche(pm.caJour, 1000);
    proche(pm.piecesJour, 100); // prix moyen 10 €
    assert.equal(pm.joursAtteints, 1);
    assert.equal(pm.jours[0].date, "2026-09-01");
    assert.equal(pm.jours[0].atteint, false);
    proche(pm.jours[1].cumulCa, 2400);
    proche(pm.jours[1].cumulCharges, 2000);
  });
});

describe("interne ou sous-traitance", () => {
  it("interne moins cher", () => {
    const c = comparerSousTraitance({ samSec: 1800, qte: 1000, prixFacon: 4, coutHoraire: H, rendement: 0.8, effectifDirect: 45, heuresJour: 8 })!;
    proche(c.heuresNecessaires, 625);
    proche(c.coutInternePiece, 0.625 * H);
    assert.equal(c.choix, "interne");
    proche(c.joursUsine, 625 / 360);
  });
  it("sous-traitance moins chère", () => {
    const c = comparerSousTraitance({ samSec: 1800, qte: 1000, prixFacon: 2.5, coutHoraire: H, rendement: 0.7, effectifDirect: 45, heuresJour: 8 })!;
    assert.equal(c.choix, "sous-traitance");
  });
});

describe("rapport complet", () => {
  it("la somme des marges des modèles = marge de la période", () => {
    const r = rapportRentabilite({
      from: "2026-09-01",
      to: "2026-09-30",
      params: DBS,
      modeles: [
        modele({ modeleId: 1, heures: 3000, pieces: 5000, prixVente: 8 }),
        modele({ modeleId: 2, heures: 3500, pieces: 4000, prixVente: 7, arretsSec: 36_000 }),
      ],
      jours: [{ date: "2026-09-01", ca: 68_000, pieces: 9000 }],
    });
    const somme = r.modeles.reduce((s, m) => s + m.marge, 0);
    proche(somme, r.bilan.marge);
    proche(r.heuresStandard, 4500);
    proche(r.rendementGlobal, 4500 / 6500);
    proche(r.valeurPointRendement, 65 * H);
  });
});
