import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  type ClientFusionnable,
  type CommandeRepere,
  detecterSociete,
  propositionsFusionClients,
} from "./referentiel";

/* Les deux nettoyages du référentiel décident à qui appartient du chiffre
 * d'affaires. Une erreur ici déplace du CA d'un client à un autre, ou fusionne
 * deux vraies sociétés — ce qui ne se défait pas. */

const COMMANDES: CommandeRepere[] = [
  { client: "GÉRARD DAREL", modele: "CHEMISE LIN", refArticle: "REF-1042" },
  { client: "GÉRARD DAREL", modele: "BLOUSE SOIE", refArticle: "REF-1043" },
  { client: "CLAUDIE PIERLOT", modele: "PANTALON CHINO", refArticle: "REF-2210" },
  { client: "MODA SRL", modele: "VESTE TWEED", refArticle: "REF-1042" },
];

describe("detecterSociete", () => {
  it("attribue la facture au client du modèle", () => {
    const d = detecterSociete([{ modele: "CHEMISE LIN", ref: "" }], COMMANDES);
    assert.equal(d.propose, "GÉRARD DAREL");
    assert.equal(d.indecis, false);
  });

  it("ignore la casse, les accents et la ponctuation", () => {
    const d = detecterSociete([{ modele: "chemise-lin", ref: "" }], COMMANDES);
    assert.equal(d.propose, "GÉRARD DAREL");
  });

  it("fait primer le modèle sur la référence", () => {
    /* REF-1042 appartient aussi à MODA SRL, mais le modèle CHEMISE LIN ne
     * laisse aucun doute : la référence ne doit pas venir brouiller le vote. */
    const d = detecterSociete([{ modele: "CHEMISE LIN", ref: "REF-1042" }], COMMANDES);
    assert.equal(d.propose, "GÉRARD DAREL");
    assert.equal(d.suffrages.length, 1, "la référence n'a pas voté");
  });

  it("retombe sur la référence quand le modèle est inconnu", () => {
    const d = detecterSociete([{ modele: "MODELE JAMAIS VU", ref: "REF-2210" }], COMMANDES);
    assert.equal(d.propose, "CLAUDIE PIERLOT");
    assert.equal(d.suffrages[0].points, 2);
  });

  it("cumule les lignes d'une même facture", () => {
    const d = detecterSociete(
      [
        { modele: "CHEMISE LIN", ref: "" },
        { modele: "BLOUSE SOIE", ref: "" },
        { modele: "PANTALON CHINO", ref: "" },
      ],
      COMMANDES,
    );
    assert.equal(d.propose, "GÉRARD DAREL");
    assert.equal(d.suffrages[0].points, 6);
    assert.equal(d.suffrages[1].points, 3);
  });

  it("refuse de trancher une égalité plutôt que de choisir au hasard", () => {
    const d = detecterSociete(
      [
        { modele: "CHEMISE LIN", ref: "" },
        { modele: "PANTALON CHINO", ref: "" },
      ],
      COMMANDES,
    );
    assert.equal(d.indecis, true);
    assert.equal(d.propose, "", "aucune proposition : c'est à l'utilisateur de choisir");
    assert.equal(d.suffrages.length, 2);
  });

  it("ne propose rien quand aucune commande ne correspond", () => {
    const d = detecterSociete([{ modele: "INCONNU", ref: "XXX" }], COMMANDES);
    assert.equal(d.propose, "");
    assert.deepEqual(d.suffrages, []);
  });

  it("ignore les commandes sans client", () => {
    const d = detecterSociete([{ modele: "ORPHELIN", ref: "" }], [
      { client: "", modele: "ORPHELIN", refArticle: "" },
      { client: "   ", modele: "ORPHELIN", refArticle: "" },
    ]);
    assert.equal(d.propose, "");
  });

  it("attribue à toutes les sociétés partageant un modèle, sans en inventer", () => {
    const d = detecterSociete([{ modele: "TSHIRT", ref: "" }], [
      { client: "A", modele: "TSHIRT", refArticle: "" },
      { client: "B", modele: "TSHIRT", refArticle: "" },
    ]);
    assert.equal(d.indecis, true);
    assert.deepEqual(
      d.suffrages.map((s) => s.client),
      ["A", "B"],
    );
  });
});

const fiche = (id: number, nom: string, cmd = 0, ca = 0): ClientFusionnable => ({
  id,
  nom,
  code: `CLI-${String(id).padStart(3, "0")}`,
  cmd,
  ca,
});

describe("propositionsFusionClients", () => {
  it("repère le doublon strict et garde la fiche la plus utilisée", () => {
    /* Le cas réel de la base reprise : « PATRICK CONFECTION » sur deux fiches. */
    const g = propositionsFusionClients([
      fiche(4, "PATRICK CONFECTION", 2, 12000),
      fiche(17, "PATRICK CONFECTION", 31, 240000),
      fiche(9, "MODA SRL", 8, 50000),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].certitude, "identique");
    assert.equal(g[0].garde.id, 17, "on garde celle qui porte les commandes");
    assert.deepEqual(g[0].absorbes.map((c) => c.id), [4]);
  });

  it("rapproche les mêmes mots écrits différemment", () => {
    const g = propositionsFusionClients([
      fiche(1, "Confection Patrick", 5),
      fiche(2, "PATRICK CONFECTION", 2),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].certitude, "identique");
    assert.match(g[0].motif, /écriture différente/);
    assert.equal(g[0].garde.id, 1);
  });

  it("départage par le CA quand le nombre de commandes est égal", () => {
    const g = propositionsFusionClients([fiche(1, "ACME", 3, 1000), fiche(2, "ACME", 3, 9000)]);
    assert.equal(g[0].garde.id, 2);
  });

  it("garde la fiche la plus ancienne à égalité parfaite", () => {
    const g = propositionsFusionClients([fiche(7, "ACME"), fiche(2, "ACME")]);
    assert.equal(g[0].garde.id, 2);
  });

  it("ne fusionne pas deux sociétés distinctes", () => {
    assert.deepEqual(propositionsFusionClients([fiche(1, "MODA SRL"), fiche(2, "MODA SPA")]), []);
    assert.deepEqual(propositionsFusionClients([fiche(1, "GÉRARD DAREL"), fiche(2, "CLAUDIE PIERLOT")]), []);
  });

  it("ne rapproche pas un nom court d'un nom qui le contient", () => {
    // « SUD » couvrirait « SUD CONFECTION » à 100 % — d'où le garde-fou.
    assert.deepEqual(propositionsFusionClients([fiche(1, "SUD"), fiche(2, "SUD CONFECTION")]), []);
  });

  it("regroupe trois fiches d'un coup", () => {
    const g = propositionsFusionClients([
      fiche(1, "ACME", 1),
      fiche(2, "ACME", 9),
      fiche(3, "ACME", 3),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].garde.id, 2);
    assert.equal(g[0].absorbes.length, 2);
  });

  it("passe les cas certains avant les cas à vérifier", () => {
    const g = propositionsFusionClients([
      fiche(1, "ATELIER DU NORD"),
      fiche(2, "ATELIER DU NORDE"),
      fiche(3, "ACME"),
      fiche(4, "ACME"),
    ]);
    assert.equal(g.length, 2);
    assert.equal(g[0].certitude, "identique");
    assert.equal(g[1].certitude, "probable");
  });

  it("ne rend rien sur un répertoire sain", () => {
    assert.deepEqual(propositionsFusionClients([fiche(1, "A CORP"), fiche(2, "B CORP")]), []);
    assert.deepEqual(propositionsFusionClients([]), []);
  });
});
