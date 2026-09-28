import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  cause5mDepuisTexte,
  enRetard,
  filtrerActions,
  FILTRE_DEFAUT,
  prioriteDepuisLabel,
  statutDepuisPlan,
  statutDepuisQrqc,
  syntheseActions,
  trierActions,
} from "./actions-qualite";

const J = "2026-09-27";
const a = (id: number, p: Partial<{ statut: string; echeance: string; origine: string; cause5m: string; priorite: string; responsable: string; texte: string }> = {}) => ({
  id,
  statut: "a_traiter",
  echeance: "",
  origine: "qc",
  cause5m: "",
  priorite: "",
  responsable: "X",
  texte: "",
  ...p,
});

describe("reprise des anciennes fiches", () => {
  it("5M reconnues malgré accents et casse, texte libre sinon", () => {
    assert.equal(cause5mDepuisTexte("main d'oeuvre"), "Main d'œuvre");
    assert.equal(cause5mDepuisTexte("MATIERE"), "Matière");
    assert.equal(cause5mDepuisTexte("Aiguille émoussée"), "");
    assert.equal(cause5mDepuisTexte("main_oeuvre"), "Main d'œuvre"); // code de l'ancien PilotPro
  });
  it("statuts QRQC et plan → workflow unique", () => {
    assert.equal(statutDepuisQrqc("Résolu"), "cloture");
    assert.equal(statutDepuisQrqc("En cours"), "en_cours");
    assert.equal(statutDepuisQrqc("Ouvert"), "a_traiter");
    assert.equal(statutDepuisPlan("Clôturée"), "cloture");
    assert.equal(statutDepuisPlan("En retard"), "a_traiter");
    assert.equal(prioriteDepuisLabel("Haute"), "haute");
    assert.equal(prioriteDepuisLabel("?"), "");
  });
});

describe("suivi", () => {
  it("en retard = ouverte et échéance dépassée", () => {
    assert.equal(enRetard(a(1, { echeance: "2026-09-20" }), J), true);
    assert.equal(enRetard(a(1, { echeance: "2026-09-20", statut: "verifie" }), J), false);
    assert.equal(enRetard(a(1, { echeance: "" }), J), false);
  });
  it("synthèse : ouvertes, retard, sans pilote, origines, causes", () => {
    const s = syntheseActions(
      [
        a(1, { origine: "qrqc", cause5m: "Machine", echeance: "2026-09-01" }),
        a(2, { origine: "plan", cause5m: "Machine", responsable: "" }),
        a(3, { cause5m: "Matière", statut: "cloture" }),
      ],
      J,
    );
    assert.equal(s.ouvertes, 2);
    assert.equal(s.enRetard, 1);
    assert.equal(s.sansPilote, 1);
    assert.deepEqual(s.parOrigine, { qc: 0, qrqc: 1, plan: 1 });
    assert.deepEqual(s.parCause, [{ cause: "Machine", n: 2 }]);
  });
  it("filtre et tri : retard d'abord, puis priorité, puis échéance", () => {
    const liste = [
      a(1, { echeance: "2026-10-10", priorite: "basse" }),
      a(2, { echeance: "2026-10-01", priorite: "haute" }),
      a(3, { echeance: "2026-09-01" }),
      a(4, { statut: "cloture", texte: "boutonnière" }),
    ];
    assert.deepEqual(trierActions(liste, J).map((x) => x.id), [3, 2, 1, 4]);
    assert.deepEqual(filtrerActions(liste, FILTRE_DEFAUT, J).map((x) => x.id), [1, 2, 3]);
    assert.deepEqual(filtrerActions(liste, { ...FILTRE_DEFAUT, etat: "toutes", q: "BOUTONNIERE" }, J).map((x) => x.id), [4]);
  });
});
