import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  erreurRepartition,
  grouperCommandes,
  numeroSousCommande,
  proposerRegroupements,
  qteAffectee,
  qtePropre,
  resteAAffecter,
  totauxGroupe,
} from "./commande";

/* La découpe d'une commande en sous-commandes.
 *
 * Ce qui est vérifié ici est ce qui décide d'un chiffre d'affaires : une
 * commande découpée existe en base sous plusieurs lignes, et la même pièce ne
 * doit être comptée qu'une fois. Une erreur ici ne se voit pas à l'écran — elle
 * se voit dans le CA du mois, plusieurs semaines plus tard. */

/** Une commande minimale, réduite à ce que les règles lisent. */
const cmd = (o: Partial<Parameters<typeof totauxGroupe>[0]> & { lienParent?: string } = {}) => ({
  qte: 0,
  produit: 0,
  factureQte: 0,
  prixVente: null,
  prixFacon: null,
  dateExport: null,
  dateExportReel: null,
  receptTissu: null,
  archived: false,
  statutManuel: null,
  ...o,
});

/** Une part issue d'une découpe : elle prend sur la quantité du porteur. */
const part = (o: Parameters<typeof cmd>[0] = {}) => cmd({ ...o, lienParent: "decoupe" });
/** Un OF réuni : il garde la sienne et s'ajoute à côté. */
const membre = (o: Parameters<typeof cmd>[0] = {}) => cmd({ ...o, lienParent: "regroupement" });

describe("répartition d'une quantité sur les sous-commandes", () => {
  it("compte ce qui est délégué et ce qui reste", () => {
    const parts = [{ qte: 500, lienParent: "decoupe" }, { qte: 300, lienParent: "decoupe" }];
    assert.equal(qteAffectee(parts), 800);
    assert.equal(qtePropre({ qte: 1200 }, parts), 400);
    assert.equal(resteAAffecter(1200, parts), 400);
  });

  it("laisse une commande sans part répondre de la totalité", () => {
    // La règle qui garantit qu'aucun écran ne change pour l'existant.
    assert.equal(qtePropre({ qte: 1200 }), 1200);
    assert.equal(qtePropre({ qte: 1200 }, []), 1200);
  });

  it("accepte une répartition partielle : la mère produit le reliquat", () => {
    assert.equal(erreurRepartition(1200, [{ qte: 500, lienParent: "decoupe" }]), null);
    assert.equal(erreurRepartition(1200, [{ qte: 1200, lienParent: "decoupe" }]), null);
  });

  it("refuse de répartir plus que le total et dit de combien", () => {
    const e = erreurRepartition(1200, [
      { qte: 800, lienParent: "decoupe" },
      { qte: 500, lienParent: "decoupe" },
    ]);
    assert.match(String(e), /1300 pièces/);
    assert.match(String(e), /1200/);
    assert.match(String(e), /100 de trop/);
  });

  it("ne rend jamais une quantité propre négative", () => {
    // Une base incohérente ne doit pas produire un CA négatif au passage.
    assert.equal(qtePropre({ qte: 1000 }, [{ qte: 1500, lienParent: "decoupe" }]), 0);
  });
});

describe("totaux d'un groupe", () => {
  it("compte chaque pièce à son propre prix, une seule fois", () => {
    const mere = cmd({ qte: 1200, prixVente: 20, prixFacon: 8, produit: 100 });
    const parts = [
      part({ qte: 500, prixVente: 22, prixFacon: 9, produit: 200 }),
      part({ qte: 300, prixVente: 18, prixFacon: 7, produit: 300 }),
    ];
    const t = totauxGroupe(mere, parts);

    // 400 × 20 + 500 × 22 + 300 × 18 — et non 1200 × 20 + les parts.
    assert.equal(t.ca, 400 * 20 + 500 * 22 + 300 * 18);
    assert.equal(t.margeTotale, 400 * 12 + 500 * 13 + 300 * 11);
    assert.equal(t.qte, 1200);
    assert.equal(t.produit, 600);
    assert.equal(t.av, 50);
  });

  it("rend exactement les valeurs de la ligne quand elle n'a pas de part", () => {
    const seule = cmd({ qte: 1200, prixVente: 20, prixFacon: 8, produit: 600 });
    const t = totauxGroupe(seule, []);
    assert.equal(t.ca, 24000);
    assert.equal(t.margeTotale, 14400);
    assert.equal(t.av, 50);
  });

  it("arrondit au centime, comme le reste des montants", () => {
    const mere = cmd({ qte: 2000, prixVente: 8.6, prixFacon: 2.9 });
    const t = totauxGroupe(mere, [part({ qte: 1000, prixVente: 8.6, prixFacon: 2.9 })]);
    assert.equal(t.margeTotale, 11400);
  });
});

describe("les deux natures de lien ne comptent pas pareil", () => {
  it("une DÉCOUPE partage la quantité du porteur", () => {
    const porteur = cmd({ qte: 1200, prixVente: 20 });
    const enfants = [part({ qte: 500, prixVente: 20 }), part({ qte: 300, prixVente: 20 })];
    // Le porteur ne répond plus que de 400, et le groupe vaut toujours 1 200.
    assert.equal(qtePropre(porteur, enfants), 400);
    assert.equal(totauxGroupe(porteur, enfants).qte, 1200);
    assert.equal(totauxGroupe(porteur, enfants).ca, 24000);
  });

  it("un REGROUPEMENT additionne des OF entiers", () => {
    // Le cas réel : PEC27E667 en 4 OF, 330 + 20 + 8 + 6 = 364 pièces.
    const porteur = cmd({ qte: 330, prixVente: 20 });
    const membres = [membre({ qte: 20, prixVente: 20 }), membre({ qte: 8, prixVente: 20 }), membre({ qte: 6, prixVente: 20 })];
    // Le porteur garde ses 330 : les membres ne lui prennent rien.
    assert.equal(qtePropre(porteur, membres), 330);
    assert.equal(qteAffectee(membres), 0);
    // Et le groupe pèse la somme — c'est elle que le tissu doit couvrir.
    assert.equal(totauxGroupe(porteur, membres).qte, 364);
    assert.equal(totauxGroupe(porteur, membres).ca, 364 * 20);
  });

  it("ne laisse pas un regroupement déclencher une erreur de répartition", () => {
    // 364 réunis sous un porteur de 330 : licite, ce n'est pas une découpe.
    assert.equal(erreurRepartition(330, [membre({ qte: 20 }), membre({ qte: 8 })]), null);
  });
});

describe("proposerRegroupements", () => {
  const of = (id: number, client: string, refArticle: string, qte: number, parentId: number | null = null) => ({
    id,
    of: `OF-2026-${String(id).padStart(3, "0")}`,
    client,
    refArticle,
    modele: "PANTALON",
    qte,
    parentId,
  });

  it("réunit les OF d'un même client et d'une même référence", () => {
    const g = proposerRegroupements([
      of(255, "PATRICK", "PEC27E667", 330),
      of(256, "PATRICK", "PEC27E667", 20),
      of(257, "PATRICK", "PEC27E667", 8),
      of(258, "PATRICK", "PEC27E667", 6),
      of(300, "PATRICK", "AUTRE-REF", 500),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].qte, 364);
    assert.equal(g[0].lignes.length, 4);
  });

  it("propose le plus gros OF comme porteur", () => {
    // 330 pièces portent la matière, pas 6 : c'est l'OF que le magasin connaît.
    const [g] = proposerRegroupements([
      of(258, "PATRICK", "PEC27E667", 6),
      of(255, "PATRICK", "PEC27E667", 330),
    ]);
    assert.equal(g.porteurId, 255);
    assert.equal(g.lignes[0].id, 255, "la liste est triée du plus gros au plus petit");
  });

  it("ne réunit pas deux clients différents", () => {
    assert.deepEqual(
      proposerRegroupements([of(1, "PATRICK", "PEC27E667", 100), of(2, "MODA", "PEC27E667", 100)]),
      [],
    );
  });

  it("ignore les références vides", () => {
    // Une référence absente ne dit pas « même article », seulement que
    // personne ne l'a renseignée : regrouper là-dessus lierait n'importe quoi.
    assert.deepEqual(proposerRegroupements([of(1, "PATRICK", "", 100), of(2, "PATRICK", "  ", 100)]), []);
  });

  it("laisse tranquilles les OF déjà rattachés", () => {
    assert.deepEqual(
      proposerRegroupements([
        of(1, "PATRICK", "PEC27E667", 100, 9),
        of(2, "PATRICK", "PEC27E667", 100, 9),
      ]),
      [],
    );
  });

  it("tolère les écarts de casse et d'accent sur le nom du client", () => {
    const g = proposerRegroupements([
      of(1, "Gérard Darel", "REF-1", 100),
      of(2, "GERARD DAREL", "ref-1", 50),
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].qte, 150);
  });
});

describe("grouperCommandes", () => {
  const l = (id: number, parentId: number | null = null) => ({ id, parentId });

  it("range chaque part sous sa mère, sans la laisser au premier niveau", () => {
    const g = grouperCommandes([l(1), l(2, 1), l(3, 1), l(4)]);
    assert.deepEqual(
      g.map((x) => [x.parent.id, x.enfants.map((e) => e.id)]),
      [
        [1, [2, 3]],
        [4, []],
      ],
    );
  });

  it("remonte une part orpheline au premier niveau plutôt que de la perdre", () => {
    // Mère filtrée, archivée ou supprimée : la ligne existe, elle doit rester
    // atteignable — une commande invisible est une commande oubliée.
    const g = grouperCommandes([l(2, 99)]);
    assert.deepEqual(
      g.map((x) => x.parent.id),
      [2],
    );
  });

  it("garde l'ordre d'entrée des mères", () => {
    const g = grouperCommandes([l(7), l(3), l(9, 3)]);
    assert.deepEqual(
      g.map((x) => x.parent.id),
      [7, 3],
    );
  });
});

describe("numeroSousCommande", () => {
  it("dérive le numéro de celui de la mère", () => {
    assert.equal(numeroSousCommande("OF-2026-287", 1), "OF-2026-287-S1");
    assert.equal(numeroSousCommande("OF-2026-287", 12), "OF-2026-287-S12");
  });
});
