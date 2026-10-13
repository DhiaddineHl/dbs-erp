import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { appliquerSaisie, type Matrices, type Saisie } from "./saisie-gpao";

/* GARDE-FOU — le relevé des paquets ne doit JAMAIS compter la production.
 *
 * `commande.produit` n'a qu'un seul endroit qui l'écrit (services/avancement),
 * et il part de la SORTIE DE CHAÎNE. C'est ce qui rend les chiffres fiables.
 * Le suivi par paquets observe et signale ; s'il se mettait à alimenter
 * l'avancement, la même production serait comptée deux fois.
 *
 * Ces tests échouent si quelqu'un franchit la cloison — dans deux ans, sans
 * avoir lu cette histoire. */

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), "utf8");
/** Le garde-fou porte sur le CODE : les commentaires, eux, ont le droit
 * d'expliquer la règle (et doivent même le faire). */
const codeSeul = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const roster = [{ id: 1, nom: "Fadila", poste: "Montage col", sam: 90 }];
const vide = (): Matrices => ({
  cols: ["H1", "H2"], cloture: false, sortie: {}, ops: {}, ret: {},
  opsSam: {}, opsPoste: {}, opsDetail: {}, arrets: {}, paquets: {},
});
const appliquer = (m: Matrices, s: Saisie) => {
  const r = appliquerSaisie(m, roster, s);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
};

describe("cloisonnement du suivi par paquets", () => {
  it("le domaine des paquets ignore tout du comptage de production", () => {
    const src = codeSeul(lire("./paquets.ts"));
    for (const interdit of ["produitCommande", "recalculerProduit", "coupeQte", "magasinQte", "avancement"]) {
      assert.ok(!src.includes(interdit), `lib/domain/paquets.ts ne doit pas connaître « ${interdit} »`);
    }
  });

  it("une saisie de paquets ne touche QUE la matrice des paquets", () => {
    const r = appliquer(vide(), { type: "paquets", ouvId: 1, col: "H1", numeros: [12, 13] });
    assert.deepEqual(r.champs, ["paquets"]);
    assert.deepEqual(r.matrices.paquets, { 1: { H1: [12, 13] } });
    // Ni les pièces, ni la sortie de chaîne n'ont bougé.
    assert.deepEqual(r.matrices.ops, {});
    assert.deepEqual(r.matrices.sortie, {});
  });

  it("l'avancement de la commande ne part que de la sortie de chaîne", () => {
    const src = lire("../services/saisie-gpao.ts");
    assert.match(
      src,
      /champs\.has\("sortie"\)\)\s*await synchroniserAvancementJournee/,
      "La synchronisation de l'avancement doit rester conditionnée à la seule sortie de chaîne.",
    );
    assert.ok(
      !/champs\.has\("paquets"\)/.test(src),
      "Aucun traitement d'avancement ne doit se déclencher sur la matrice des paquets.",
    );
  });

  it("la liste des paquets est nettoyée côté serveur", () => {
    // Numéros aberrants écartés, doublons retirés, tri appliqué.
    const r = appliquer(vide(), { type: "paquets", ouvId: 1, col: "H1", numeros: [13, 12, 13, 0, -4, 1e9] });
    assert.deepEqual(r.matrices.paquets, { 1: { H1: [12, 13] } });
  });

  it("une liste vide efface la case sans laisser de ligne fantôme", () => {
    let m = appliquer(vide(), { type: "paquets", ouvId: 1, col: "H1", numeros: [12] }).matrices;
    m = appliquer(m, { type: "paquets", ouvId: 1, col: "H1", numeros: [] }).matrices;
    assert.deepEqual(m.paquets, {});
  });

  it("retirer une ouvrière emporte ses paquets", () => {
    let m = appliquer(vide(), { type: "paquets", ouvId: 1, col: "H1", numeros: [12] }).matrices;
    m = appliquer(m, { type: "retirerOuvriere", ouvId: 1 }).matrices;
    assert.deepEqual(m.paquets, {});
  });

  it("journée clôturée : plus de saisie de paquets non plus", () => {
    const r = appliquerSaisie({ ...vide(), cloture: true }, roster, { type: "paquets", ouvId: 1, col: "H1", numeros: [12] });
    assert.equal(r.ok, false);
  });

  it("heure ou ouvrière inconnue : refusé", () => {
    assert.equal(appliquerSaisie(vide(), roster, { type: "paquets", ouvId: 1, col: "H9", numeros: [1] }).ok, false);
    assert.equal(appliquerSaisie(vide(), roster, { type: "paquets", ouvId: 99, col: "H1", numeros: [1] }).ok, false);
  });
});
