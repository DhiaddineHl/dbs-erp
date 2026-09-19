import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cleReference, grouperParReference, libelleReference, memeReference } from "./reference";

describe("clé de référence industrielle", () => {
  it("privilégie la référence article, tolère casse et accents", () => {
    const a = { client: "Gérard Darel", refArticle: "AMI-27", modele: "Chemise" };
    const b = { client: "GERARD DAREL", refArticle: "ami-27", modele: "Chemisier" };
    assert.equal(cleReference(a), cleReference(b));
    assert.ok(memeReference(a, b));
  });

  it("retombe sur le modèle quand la référence est absente", () => {
    const cle = cleReference({ client: "X", refArticle: "", modele: "Robe" });
    assert.match(cle, /mod:robe/);
  });

  it("ne fabrique aucune clé sans référence ni modèle", () => {
    assert.equal(cleReference({ client: "X", refArticle: "", modele: "" }), "");
    assert.equal(memeReference({ client: "X", refArticle: "", modele: "" }, { client: "X", refArticle: "", modele: "" }), false);
  });

  it("ne confond pas deux clients", () => {
    assert.ok(!memeReference({ client: "A", refArticle: "R1", modele: "M" }, { client: "B", refArticle: "R1", modele: "M" }));
  });

  it("regroupe les commandes d'une même référence sans fusionner les lignes", () => {
    const lignes = [
      { id: 1, client: "A", refArticle: "R1", modele: "M" },
      { id: 2, client: "A", refArticle: "R1", modele: "M" },
      { id: 3, client: "A", refArticle: "R2", modele: "M" },
    ];
    const g = grouperParReference(lignes);
    assert.equal(g.size, 2);
    assert.equal(g.get(cleReference(lignes[0]))!.length, 2);
  });

  it("compose un libellé lisible", () => {
    assert.equal(libelleReference({ client: "GÉRARD DAREL", refArticle: "AMI-27", modele: "Chemise" }), "GÉRARD DAREL · AMI-27 (Chemise)");
  });
});
