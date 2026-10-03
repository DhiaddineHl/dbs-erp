import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { JourneeBrute } from "./rendement";
import {
  joursDansPlage,
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

describe("historique ouvrière — journées perdues après fusion (Mariem / Hourya)", () => {
  // Registre ACTUEL : les fiches 9 (Mariem) et 12 (Hourya) ont été absorbées puis supprimées.
  const registre = [
    { id: 7, nom: "DRIDI MARIEM" },
    { id: 8, nom: "BEN SALEM HOURYA" },
    { id: 20, nom: "BEN SALEM AMEL" },
    { id: 30, nom: "TRABELSI SANA" },
  ];
  const fusions = [{ ancienId: 9, gardeId: 7 }, { ancienId: 12, gardeId: 8 }];
  const cleDe = resolveurIdentite(registre, [{ id: 10, nom: "DRIDI MARIEM", personnelId: 7 }], fusions);
  const L = (id: number, nom: string, personnelId: number | null): LigneEffectif => ({ id, nom, poste: "Montage", sam: 60, personnelId });

  it("TEST 3 — ancienne fiche fusionnée : la journée revient à la fiche actuelle, même nom différent", () => {
    assert.equal(cleDe(L(-1, "Meriem Dridi", 9)), "P:7");
    assert.equal(cleDe(L(-2, "Houria Bensalem", 12)), "P:8");
  });
  it("orthographe différente sans fiche : rattachée si UNE seule fiche correspond", () => {
    assert.equal(cleDe(L(-3, "Meriem Dridi", null)), "P:7");
    assert.equal(cleDe(L(-4, "Hourya Bensalem", null)), "P:8");
    assert.equal(cleDe(L(-5, "Ben Salem Houria", 99)), "P:8"); // fiche supprimée sans mémoire
  });
  it("orthographes réelles du registre DBS : « Mariem Dridi » → Dridi Meriem, « Houriya Ben Selim » → Ben Salem Hourya", () => {
    const reel = resolveurIdentite([{ id: 10, nom: "Dridi Meriem" }, { id: 46, nom: "Ben Salem Hourya" }, { id: 63, nom: "Ben Othmen Meriem" }]);
    assert.equal(reel(L(10, "Mariem Dridi", null)), "P:10");
    assert.equal(reel(L(6, "Houriya Ben Selim", null)), "P:46");
    assert.equal(reel(L(-1, "Meriem Ben Othmane", null)), "P:63");
  });
  it("garde-fous : une autre personne ou un prénom seul ne sont jamais rattachés", () => {
    assert.equal(cleDe(L(-6, "Ben Salem Asma", null)), "N:asma ben salem");
    assert.equal(cleDe(L(-7, "Mariem", null)), "N:mariem");
    assert.equal(cleDe(L(-8, "Trabelsi Sonia", null)), "N:sonia trabelsi");
  });

  const jourDe = (date: string, l: LigneEffectif, q: number) => jour(date, l, q);
  // 20 journées de Mariem, sous 4 formes d'identité différentes.
  const formes = [L(10, "DRIDI MARIEM", 7), L(10, "Mariem Dridi", 9), L(-1, "Meriem Dridi", 9), L(-2, "DRIDI MARIEM", null)];
  const qtes = [40, 45, 50, 55, 60];
  const journees = Array.from({ length: 20 }, (_, i) => jourDe(`2026-09-${String(i + 1).padStart(2, "0")}`, formes[i % 4], qtes[i % 5]));
  // 21e journée : présente à l'effectif, mais AUCUNE saisie → pas de ligne inventée.
  const presenteSansSaisie = { journee: { date: "2026-09-21", cols, ops: {} }, lignes: [L(10, "DRIDI MARIEM", 7)], meta: null };
  const g = regrouperParPersonne([...journees, presenteSansSaisie], cleDe);

  it("TEST 1, 2, 7 — 20 journées avec production → 20 journées dans l'historique (pas la journée vide)", () => {
    assert.equal(g.get("P:7")?.length, 20);
    assert.equal([...g.keys()].length, 1);
  });
  it("TEST 4 — même rendement que l'écran du jour", () => {
    const j1 = g.get("P:7")![0];
    assert.equal(j1.rendement, mesureJour(journees[0].journee, journees[0].lignes).rendement);
  });
  it("TEST 6 — moyenne sur les 20 journées", () => {
    const s = synthese(g.get("P:7")!);
    assert.equal(s.jours, 20);
    const attendu = rendementDe(g.get("P:7")!.reduce((t, j) => t + j.gagne, 0), g.get("P:7")!.reduce((t, j) => t + j.heures, 0));
    assert.equal(s.rendement, attendu);
  });
  it("TEST 5 — filtre 70–90 % sur le rendement de chaque journée", () => {
    const tous = g.get("P:7")!;
    const dans = joursDansPlage(tous, 70, 90);
    assert.ok(dans.length > 0 && dans.length < tous.length);
    assert.ok(dans.every((j) => j.rendement! >= 70 && j.rendement! <= 90));
    assert.equal(joursDansPlage(tous, null, null).length, 20);
  });
});
