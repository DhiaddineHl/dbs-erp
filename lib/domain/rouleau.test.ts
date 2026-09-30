import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  analyserInventaire,
  bilanRouleau,
  sortiesPourBon,
  filtrerRouleaux,
  formatCodeRouleau,
  indicateurs,
  lireScan,
  mouvementsEffectifs,
  refusConsommation,
  refusCorrection,
  refusRetour,
  refusSortie,
  refusSortieDefinitive,
  statutRouleau,
} from "./rouleau";
import { bilanLot } from "./tissu";

const m = (id: number, sens: string, quantite: number, annuleId?: number) => ({ id, sens, quantite, annuleId: annuleId ?? null });

describe("bilan d'un rouleau — scénario de la spécification", () => {
  // Rouleau reçu 82,50 m ; sortie 25 ; retour 12,50 ; conso 23,80 + chute 1,20…
  const initial = 82.5;
  it("réception : tout est disponible, rien en coupe", () => {
    const b = bilanRouleau(initial, [m(1, "entree", 82.5), m(2, "mise_en_stock", 82.5)]);
    assert.equal(b.disponible, 82.5);
    assert.equal(b.enCoupe, 0);
  });
  it("sortie 25 m → 57,50 disponibles, 25 en coupe", () => {
    const b = bilanRouleau(initial, [m(1, "entree", 82.5), m(2, "sortie", 25)]);
    assert.equal(b.disponible, 57.5);
    assert.equal(b.enCoupe, 25);
  });
  it("retour 12,50 → 70,00 disponibles, 12,50 en coupe", () => {
    const b = bilanRouleau(initial, [m(1, "entree", 82.5), m(2, "sortie", 25), m(3, "retour", 12.5)]);
    assert.equal(b.disponible, 70);
    assert.equal(b.enCoupe, 12.5);
  });
  it("consommation et chute ne touchent pas au stock (pas de double décompte)", () => {
    const b = bilanRouleau(initial, [m(1, "entree", 82.5), m(2, "sortie", 25), m(3, "consommation", 23.8), m(4, "chute", 1.2)]);
    assert.equal(b.disponible, 57.5);
    assert.equal(b.consomme, 23.8);
    assert.equal(b.chute, 1.2);
    assert.equal(b.enCoupe, 0);
  });
  it("rendu, retour fournisseur et correction", () => {
    const b = bilanRouleau(initial, [m(1, "sortie", 20), m(2, "rendu", 10), m(3, "retour_fournisseur", 5), m(4, "ajustement", -0.5)]);
    assert.equal(b.disponible, 47);
    assert.equal(b.rendu, 10);
    assert.equal(b.retourFournisseur, 5);
    assert.equal(b.corrections, -0.5);
  });
  it("une annulation neutralise un mouvement sans l'effacer", () => {
    const ms = [m(1, "sortie", 25), m(2, "annulation", 0, 1)];
    assert.equal(bilanRouleau(initial, ms).disponible, 82.5);
    assert.deepEqual(mouvementsEffectifs(ms), []);
  });
  it("déplacement et mise en stock : sans effet sur les quantités", () => {
    const b = bilanRouleau(initial, [m(1, "deplacement", 0), m(2, "mise_en_stock", 82.5)]);
    assert.equal(b.disponible, 82.5);
  });
});

describe("statut déduit", () => {
  const b = (ms: ReturnType<typeof m>[]) => bilanRouleau(50, ms);
  it("en attente tant que la réception n'est pas scannée", () => assert.equal(statutRouleau(false, b([])), "en_attente"));
  it("en stock", () => assert.equal(statutRouleau(true, b([])), "en_stock"));
  it("sorti en entier, pas encore consommé", () => assert.equal(statutRouleau(true, b([m(1, "sortie", 50)])), "sorti"));
  it("épuisé une fois la coupe déclarée", () => assert.equal(statutRouleau(true, b([m(1, "sortie", 50), m(2, "consommation", 48), m(3, "chute", 2)])), "epuise"));
  it("rendu au client / retourné au fournisseur", () => {
    assert.equal(statutRouleau(true, b([m(1, "rendu", 50)]), "rendu"), "rendu");
    assert.equal(statutRouleau(true, b([m(1, "retour_fournisseur", 50)]), "retour_fournisseur"), "retourne");
  });
});

describe("garde-fous", () => {
  const b = bilanRouleau(82.5, [m(1, "sortie", 25)]);
  it("pas de sortie d'un rouleau non réceptionné", () => assert.match(refusSortie(false, b, 1)!, /réceptionné/));
  it("pas de sortie supérieure au disponible", () => {
    assert.match(refusSortie(true, b, 60)!, /57\.5/);
    assert.equal(refusSortie(true, b, 57.5), null);
  });
  it("pas de quantité nulle ou négative", () => {
    assert.ok(refusSortie(true, b, 0));
    assert.ok(refusSortie(true, b, -3));
  });
  it("pas de retour supérieur au sorti non soldé", () => {
    assert.ok(refusRetour(b, 26));
    assert.equal(refusRetour(b, 25), null);
  });
  it("pas de consommation + chute supérieure au sorti", () => {
    assert.ok(refusConsommation(b, 24, 1.5));
    assert.equal(refusConsommation(b, 23.8, 1.2), null);
    assert.ok(refusConsommation(b, 0, 0));
  });
  it("retour fournisseur : pas plus que le disponible", () => {
    assert.ok(refusSortieDefinitive(true, b, 60));
    assert.equal(refusSortieDefinitive(true, b, 57.5), null);
  });
  it("correction : motif obligatoire, valeur différente et positive", () => {
    assert.match(refusCorrection(50, b, " ")!, /motif/);
    assert.ok(refusCorrection(57.5, b, "écart"));
    assert.ok(refusCorrection(-1, b, "écart"));
    assert.equal(refusCorrection(55, b, "mesure au mètre"), null);
  });
});

describe("codes et scan", () => {
  it("format R-AAAA-NNNNNN", () => assert.equal(formatCodeRouleau(2026, 145), "R-2026-000145"));
  it("lit l'adresse du QR, la douchette, la saisie", () => {
    assert.deepEqual(lireScan("https://erp.dbs.tn/r/R-2026-000145"), { type: "rouleau", code: "R-2026-000145" });
    assert.deepEqual(lireScan("dbs-r-2026-145"), { type: "rouleau", code: "R-2026-000145" });
    assert.deepEqual(lireScan("  r-2026-000145 \n"), { type: "rouleau", code: "R-2026-000145" });
  });
  it("lit un emplacement", () => {
    assert.deepEqual(lireScan("https://erp.dbs.tn/e/A03-12"), { type: "emplacement", code: "A03-12" });
    assert.deepEqual(lireScan("EMP:b1"), { type: "emplacement", code: "B1" });
  });
  it("refuse un texte quelconque", () => {
    assert.equal(lireScan("bonjour"), null);
    assert.equal(lireScan(""), null);
  });
});

describe("inventaire", () => {
  const attendus = [
    { id: 1, code: "R-2026-000001", disponible: 50, emplacement: "A01" },
    { id: 2, code: "R-2026-000002", disponible: 30, emplacement: "A02" },
    { id: 3, code: "R-2026-000003", disponible: 20, emplacement: "A01" },
  ];
  it("trouvés, manquants, inconnus, écarts, mal rangés", () => {
    const r = analyserInventaire(attendus, [
      { code: "R-2026-000001", rouleauId: 1, metrageConstate: 49.8, emplacementCode: "A01" }, // dans la tolérance
      { code: "R-2026-000002", rouleauId: 2, metrageConstate: 27, emplacementCode: "A01" }, // écart + mal rangé
      { code: "R-2026-000999", rouleauId: null, metrageConstate: null, emplacementCode: "A01" }, // inconnu
    ]);
    assert.equal(r.trouves, 2);
    assert.deepEqual(r.manquants.map((x) => x.id), [3]);
    assert.equal(r.nonEnregistres.length, 1);
    assert.deepEqual(r.ecarts.map((x) => [x.id, x.ecart]), [[2, -3]]);
    assert.deepEqual(r.malRanges.map((x) => [x.id, x.trouveA]), [[2, "A01"]]);
  });
});

describe("recherche et indicateurs", () => {
  const base = (code: string, statut: string, emplacement: string, couleur: string, bilan = bilanRouleau(10, [])) => ({
    code, statut, emplacement, derniereCommande: "", bilan,
    lot: { identifiant: "L1", reference: "Denim", couleur, codeCouleur: "", lotFournisseur: "LF9", saison: "" },
    reception: { numero: "BR-1", fournisseur: "Soktex", client: "Kiabi", blClient: "", commandeFournisseur: "" },
    commandes: [{ label: "OF-12 · Polo" }],
  });
  const rs = [base("R-2026-000001", "en_stock", "A01", "Marine"), base("R-2026-000002", "sorti", "", "Écru", bilanRouleau(10, [m(1, "sortie", 10)]))];
  it("un code scanné ne renvoie que ce rouleau", () => assert.equal(filtrerRouleaux(rs, { q: "https://x/r/R-2026-000002" }).length, 1));
  it("recherche sans accents, par commande, par statut", () => {
    assert.equal(filtrerRouleaux(rs, { q: "ecru" })[0].code, "R-2026-000002");
    assert.equal(filtrerRouleaux(rs, { q: "OF-12" }).length, 2);
    assert.equal(filtrerRouleaux(rs, { statut: "en_stock" }).length, 1);
    assert.equal(filtrerRouleaux(rs, { sansEmplacement: true }).length, 1);
  });
  it("indicateurs", () => {
    const i = indicateurs(rs);
    assert.equal(i.enStock, 1);
    assert.equal(i.metrageDisponible, 10);
    assert.equal(i.sortisNonConsommes, 1);
    assert.equal(i.metrageEnCoupe, 10);
  });
});

describe("bilan du LOT avec des mouvements de rouleaux", () => {
  it("annulation et retour fournisseur comptés juste ; consommation ignorée", () => {
    const b = bilanLot(100, [], [
      { id: 1, sens: "sortie", quantite: 30 },
      { id: 2, sens: "consommation", quantite: 28 },
      { id: 3, sens: "chute", quantite: 2 },
      { id: 4, sens: "retour_fournisseur", quantite: 10 },
      { id: 5, sens: "sortie", quantite: 5 },
      { id: 6, sens: "annulation", quantite: 0, annuleId: 5 },
    ]);
    assert.equal(b.consomme, 30);
    assert.equal(b.rendu, 10);
    assert.equal(b.disponible, 60);
  });
});

describe("lieu de sortie", () => {
  it("interne ou sous-traitant", async () => {
    const { lieuSortie, estSousTraitant } = await import("./rouleau");
    assert.equal(lieuSortie({ destination: "coupe" }), "Coupe interne");
    assert.equal(lieuSortie({ destination: "soustraitant", faconnierNom: "Atelier Sud" }), "chez Atelier Sud");
    assert.equal(estSousTraitant("DBS"), false);
    assert.equal(estSousTraitant("interne"), false);
    assert.equal(estSousTraitant("Atelier Sud"), true);
  });
});

describe("sortiesPourBon — bon après coup", () => {
  const m = (id: number, sens: string, o: Partial<{ destination: string; faconnierNom: string; bon: string; annuleId: number | null }> = {}) => ({
    id, sens, quantite: 10, destination: "soustraitant", faconnierNom: "Atelier Nour", bon: "", annuleId: null, ...o,
  });
  it("aucune sortie : rien à porter", () => assert.equal(sortiesPourBon([m(1, "mise_en_stock")]), null));
  it("réunit les sorties sans bon vers le même sous-traitant", () => {
    const r = sortiesPourBon([m(1, "sortie", { destination: "coupe", faconnierNom: "" }), m(2, "sortie"), m(3, "retour"), m(4, "sortie")]);
    assert.deepEqual(r?.aPorter.map((x) => x.id), [2, 4]);
    assert.equal(r?.lieu, "chez Atelier Nour");
  });
  it("ignore une sortie annulée et signale le bon existant", () => {
    const r = sortiesPourBon([m(1, "sortie", { bon: "BST-2026-004" }), m(2, "sortie"), m(3, "annulation", { annuleId: 2 })]);
    assert.equal(r?.dejaSur, "BST-2026-004");
    assert.equal(r?.aPorter.length, 0);
  });
});
