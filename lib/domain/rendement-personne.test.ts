import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JourneeBrute } from "./rendement";
import {
  mesureJour,
  periodeGenerale,
  periodeMois,
  regrouperParPersonne,
  rendementDe,
  resolveurIdentite,
  synthese,
  type LigneEffectif,
} from "./rendement-personne";

const cols = ["H1", "H2", "H3", "H4", "H5", "H6", "H7", "H8"];
const jour = (date: string, ligne: LigneEffectif, q: number): { journee: JourneeBrute; lignes: LigneEffectif[]; meta: null } => ({
  journee: { date, cols, ops: { [ligne.id]: Object.fromEntries(cols.map((c) => [c, q])) } },
  lignes: [ligne],
  meta: null,
});
const olfa = (id: number, personnelId: number | null, nom = "DAOUDI OLFA"): LigneEffectif => ({ id, nom, poste: "Montage", sam: 60, personnelId });

describe("identité — une personne = une clé", () => {
  const registre = [{ id: 1, nom: "DAOUDI OLFA" }, { id: 7, nom: "BEN ALI SANA" }];
  const cleDe = resolveurIdentite(registre, [{ id: 10, nom: "DAOUDI OLFA", personnelId: 1 }]);

  it("fiche, copie de ligne de chaîne, nom seul (ordre des mots/accents ignorés) → même personne", () => {
    assert.equal(cleDe(olfa(10, 1)), "P:1");
    assert.equal(cleDe(olfa(10, null)), "P:1"); // journée figée avant le rattachement
    assert.equal(cleDe(olfa(-3, null, "Olfa Daoudi")), "P:1"); // renfort tapé à la main
  });
  it("une fiche disparue (fusionnée) retombe sur la bonne personne", () => {
    assert.equal(cleDe(olfa(-4, 99)), "P:1");
  });
  it("une ligne de chaîne réattribuée à une autre ouvrière ne vole pas le passé", () => {
    // La ligne 10 porte désormais SANA ; une vieille journée où elle s'appelait OLFA reste à OLFA.
    const r = resolveurIdentite(registre, [{ id: 10, nom: "BEN ALI SANA", personnelId: 7 }]);
    assert.equal(r(olfa(10, null)), "P:1");
  });
  it("homonymes au registre : on ne tranche pas", () => {
    const r = resolveurIdentite([{ id: 1, nom: "DAOUDI OLFA" }, { id: 2, nom: "Daoudi Olfa" }]);
    assert.equal(r(olfa(-1, null)), "N:daoudi olfa");
  });
});

describe("mesure — le chiffre de la TV", () => {
  it("un jour = Σ gagné ÷ heures, comme ouvRend", () => {
    const m = mesureJour(jour("2026-09-01", olfa(10, 1), 48).journee, [olfa(10, 1)]);
    assert.equal(m.heures, 8);
    assert.equal(m.pieces, 384);
    assert.equal(m.rendement, 80); // 48 pcs × 60 s = 2880 s / 3600 s
  });
  it("RI/ABS ne comptent pas comme heures", () => {
    const j: JourneeBrute = { date: "d", cols: ["H1", "H2"], ops: { 10: { H1: 30, H2: "ABS" } } };
    const m = mesureJour(j, [olfa(10, 1)]);
    assert.equal(m.heures, 1);
    assert.equal(m.rendement, 50);
  });
});

describe("regroupement et moyenne — même chiffre partout", () => {
  const registre = [{ id: 1, nom: "DAOUDI OLFA" }];
  const cleDe = resolveurIdentite(registre, [{ id: 10, nom: "DAOUDI OLFA", personnelId: 1 }]);
  const journees = [
    jour("2026-09-01", olfa(10, 1), 48), // 80 %
    jour("2026-09-02", olfa(10, null), 48), // 80 % — figée sans fiche
    jour("2026-09-03", olfa(-1, 55), 48), // 80 % — ancienne fiche provisoire disparue
    jour("2026-09-04", olfa(10, 1), 48), // 80 %
  ];
  const parPersonne = regrouperParPersonne(journees, cleDe);

  it("les 4 journées reviennent à UNE personne", () => {
    assert.deepEqual([...parPersonne.keys()], ["P:1"]);
    assert.equal(parPersonne.get("P:1")!.length, 4);
  });
  it("80 % chaque jour à la TV → 80 % sur la période (plus de 72 %)", () => {
    assert.equal(synthese(parPersonne.get("P:1")!).rendement, 80);
  });
  it("moyenne pondérée par les heures, arrondie une seule fois", () => {
    const s = synthese([
      { gagne: 8 * 3600 * 0.805, heures: 8, pieces: 0, retouches: 0, rendement: 81, barres: [] },
      { gagne: 4 * 3600 * 0.604, heures: 4, pieces: 0, retouches: 0, rendement: 60, barres: [] },
    ]);
    assert.equal(s.rendement, rendementDe(8 * 3600 * 0.805 + 4 * 3600 * 0.604, 12)); // 74 et non (81+60)/2
    assert.equal(s.rendement, 74);
  });
  it("filtre de période", () => {
    assert.equal(synthese(parPersonne.get("P:1")!, { from: "2026-09-03", to: "2026-09-30" }).jours, 2);
  });
});

describe("période de référence", () => {
  it("30 derniers jours, aujourd'hui compris", () => {
    assert.deepEqual(periodeGenerale("2026-09-30"), { from: "2026-09-01", to: "2026-09-30" });
    assert.deepEqual(periodeGenerale("2026-03-01"), { from: "2026-01-31", to: "2026-03-01" });
  });
  it("mois en cours", () => {
    assert.deepEqual(periodeMois("2026-09-26"), { from: "2026-09-01", to: "2026-09-26" });
  });
});
