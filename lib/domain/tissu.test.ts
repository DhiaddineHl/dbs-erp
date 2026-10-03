import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bilanLot,
  statutLot,
  couvertureCommande,
  comparerBesoinReception,
  prochainIdentifiant,
  ecartsReception,
  reliquats,
  proposerLots,
  etatMatiereCommande,
  bilanMatiere,
} from "./tissu";
import * as tx from "./tissu";

describe("bilanLot — reçu / affecté / consommé / disponible", () => {
  it("distingue affecté et consommé (exemple AUBER-01)", () => {
    // Reçu 350, affecté 150 (robe) + 100 (chemise) = 250, consommé 140.
    const b = bilanLot(
      350,
      [{ quantite: 150, commandeId: 1 }, { quantite: 100, commandeId: 2 }],
      [{ sens: "sortie", quantite: 140, commandeId: 1 }],
    );
    assert.equal(b.recu, 350);
    assert.equal(b.affecte, 250);
    assert.equal(b.consomme, 140);
    assert.equal(b.disponible, 210); // 350 − 140 physiquement en rayon
    assert.equal(b.libre, 100); // 210 en rayon − (10 + 100) encore réservés
  });

  it("un retour diminue le consommé net", () => {
    const b = bilanLot(100, [], [{ sens: "sortie", quantite: 40 }, { sens: "retour", quantite: 10 }]);
    assert.equal(b.consomme, 30);
    assert.equal(b.disponible, 70);
  });

  it("libre = en rayon − réservé pas encore sorti (sorties hors réservation, retours, ajustements)", () => {
    // Reçu 1000 ; 600 réservés à A ; A sort 600 puis rend 100 ; 300 sortis pour B sans réservation ; inventaire −20.
    const b = bilanLot(
      1000,
      [{ quantite: 600, commandeId: 1 }],
      [
        { sens: "sortie", quantite: 600, commandeId: 1 },
        { sens: "retour", quantite: 100, commandeId: 1 },
        { sens: "sortie", quantite: 300, commandeId: 2 },
        { sens: "ajustement", quantite: -20 },
      ],
    );
    assert.equal(b.consomme, 800);
    assert.equal(b.disponible, 180);
    assert.equal(b.reserveRestant, 100); // A a réservé 600, n'a gardé que 500
    assert.equal(b.libre, 80); // avant la correction : 400, plus que le stock réel
  });

  it("le libre ne devient jamais négatif", () => {
    const b = bilanLot(100, [{ quantite: 100, commandeId: 1 }], [{ sens: "sortie", quantite: 50, commandeId: 2 }]);
    assert.equal(b.disponible, 50);
    assert.equal(b.libre, 0);
  });

  it("une sortie annulée ne compte plus", () => {
    const b = bilanLot(100, [{ quantite: 40, commandeId: 1 }], [
      { id: 1, sens: "sortie", quantite: 40, commandeId: 1 },
      { id: 2, sens: "annulation", quantite: 0, annuleId: 1 },
    ]);
    assert.equal(b.disponible, 100);
    assert.equal(b.libre, 60);
  });

  it("un ajustement d'inventaire corrige le disponible", () => {
    const b = bilanLot(100, [], [{ sens: "ajustement", quantite: -5 }]);
    assert.equal(b.disponible, 95);
  });
});

describe("statutLot", () => {
  it("épuisé quand plus rien en rayon", () => {
    assert.equal(statutLot(bilanLot(100, [], [{ sens: "sortie", quantite: 100 }])).kind, "epuise");
  });
  it("entièrement réservé quand libre = 0 mais stock présent", () => {
    assert.equal(statutLot(bilanLot(100, [{ quantite: 100 }], [])).kind, "reserve");
  });
  it("libre quand rien n'est affecté", () => {
    assert.equal(statutLot(bilanLot(100, [], [])).kind, "libre");
  });
});

describe("couvertureCommande", () => {
  it("besoin non affecté", () => {
    const c = couvertureCommande(3.45, [], []);
    assert.equal(c.statut.kind, "non_affecte");
    assert.equal(c.resteAAffecter, 3.45);
  });
  it("besoin couvert et reste à affecter négatif", () => {
    const c = couvertureCommande(2.1, [{ quantite: 3 }], [{ sens: "sortie", quantite: 2.3 }]);
    assert.equal(c.statut.kind, "couvert");
    assert.equal(c.affecte, 3);
    assert.equal(c.consomme, 2.3);
    assert.equal(c.resteAAffecter, -0.9);
  });
  it("le consommé déduit les retours au magasin", () => {
    const c = couvertureCommande(500, [{ quantite: 600 }], [{ sens: "sortie", quantite: 600 }, { sens: "retour", quantite: 100 }]);
    assert.equal(c.consomme, 500);
  });
  it("partiellement couvert", () => {
    assert.equal(couvertureCommande(10, [{ quantite: 4 }], []).statut.kind, "partiel");
  });
});

describe("comparerBesoinReception — par couleur", () => {
  it("suffisant / manquant selon le reçu", () => {
    const r = comparerBesoinReception(
      [
        { couleur: "Aubergine", besoin: 2.1 },
        { couleur: "Aubergine", besoin: 1.35 },
        { couleur: "Marine", besoin: 1.4 },
      ],
      [
        { couleur: "aubergine", recu: 350 },
        { couleur: "MARINE", recu: 180 },
      ],
    );
    const auber = r.find((x) => x.couleur.toLowerCase() === "aubergine")!;
    assert.equal(auber.besoin, 3.45);
    assert.equal(auber.recu, 350);
    assert.equal(auber.statut.kind, "suffisant");
    const marine = r.find((x) => x.couleur.toLowerCase() === "marine")!;
    assert.equal(marine.statut.kind, "suffisant");
  });

  it("manquant quand rien reçu, partiel quand insuffisant", () => {
    const r = comparerBesoinReception(
      [{ couleur: "Rouge", besoin: 350 }, { couleur: "Bleu", besoin: 100 }],
      [{ couleur: "Rouge", recu: 300 }],
    );
    assert.equal(r.find((x) => x.couleur === "Rouge")!.statut.kind, "partiel");
    assert.equal(r.find((x) => x.couleur === "Bleu")!.statut.kind, "manquant");
  });
});

describe("prochainIdentifiant", () => {
  it("dérive de la couleur et incrémente", () => {
    assert.equal(prochainIdentifiant("Aubergine", []), "AUBER-01");
    assert.equal(prochainIdentifiant("Aubergine", ["AUBER-01"]), "AUBER-02");
    assert.equal(prochainIdentifiant("Marine", ["AUBER-01"]), "MARIN-01");
  });
  it("gère les accents et les couleurs vides", () => {
    assert.equal(prochainIdentifiant("Écru", []), "ECRU-01");
    assert.equal(prochainIdentifiant("", []), "LOT-01");
  });
});

describe("contrôle à réception contre le BL client", () => {
  it("manque, laize et défauts deviennent des motifs de réclamation", () => {
    const e = ecartsReception({
      quantiteRecue: 480, quantiteAnnoncee: 500, laize: 142, laizeAnnoncee: 145, defauts: "",
      rouleaux: [{ n: "3", annonce: 100, mesure: 96, laize: 145, defauts: "trou à 12 m" }],
    });
    assert.equal(e.manque, 20);
    assert.equal(e.laizeNonConforme, true);
    assert.ok(e.motifs.some((m) => m.startsWith("Manque 20 m")));
    assert.ok(e.motifs.some((m) => m.includes("Rouleau 3 : trou")));
    assert.equal(e.aReclamer, true);
  });
  it("écart sous la tolérance : rien à réclamer", () => {
    const e = ecartsReception({ quantiteRecue: 499.8, quantiteAnnoncee: 500, laize: 145.5, laizeAnnoncee: 145, defauts: "" });
    assert.equal(e.aReclamer, false);
  });
});

describe("rendu au client et reliquats", () => {
  it("un rendu sort du stock sans être une consommation", () => {
    const b = bilanLot(100, [{ quantite: 60 }], [{ sens: "sortie", quantite: 55 }, { sens: "rendu", quantite: 20 }]);
    assert.equal(b.consomme, 55);
    assert.equal(b.rendu, 20);
    assert.equal(b.disponible, 25);
    assert.equal(b.libre, 20);
  });
  it("reliquats groupés par client et saison, sans les lots encore en cours", () => {
    const g = reliquats([
      { id: 1, identifiant: "A-01", client: "Kiabi", saison: "PE26", reference: "", couleur: "Bleu", unite: "m", disponible: 12, enCours: false },
      { id: 2, identifiant: "A-02", client: "Kiabi", saison: "PE26", reference: "", couleur: "Bleu", unite: "m", disponible: 8, enCours: false },
      { id: 3, identifiant: "B-01", client: "Kiabi", saison: "PE26", reference: "", couleur: "Noir", unite: "m", disponible: 50, enCours: true },
    ]);
    assert.equal(g.length, 1);
    assert.equal(g[0].totalParUnite.m, 20);
  });
});

describe("lots proposés et besoin", () => {
  const lots = [
    { id: 1, identifiant: "BLEU-01", client: "Kiabi", reference: "R1", couleur: "Bleu", libre: 100, controle: "conforme" },
    { id: 2, identifiant: "BLEU-02", client: "Jules", reference: "R1", couleur: "Bleu", libre: 300, controle: "" },
    { id: 3, identifiant: "NOIR-01", client: "Kiabi", reference: "R1", couleur: "Noir", libre: 80, controle: "" },
  ];
  it("jamais le tissu d'un autre client, ni une autre couleur", () => {
    const p = proposerLots({ client: "KIABI", reference: "r1", couleur: "bleu" }, lots);
    assert.deepEqual(p.map((x) => x.identifiant), ["BLEU-01"]);
  });
  it("manque couvert par le stock ou à demander au client", () => {
    assert.equal(etatMatiereCommande(500, 300, 0, 100).aDemander, 100);
    assert.equal(etatMatiereCommande(500, 300, 0, 250).niveau, "stock");
  });
  it("bilan matière : conso réelle contre conso client", () => {
    const b = bilanMatiere({ recu: 1000, consomme: 930, rendu: 50, pieces: 600, consoClient: 1.5 });
    assert.equal(b.reste, 20);
    assert.equal(b.theorique, 900);
    assert.equal(b.chute, 30);
    assert.equal(b.ecartConsoPct, 3.3);
  });
});

describe("lot : supprimer ou archiver", () => {
  it("erreur de réception (entrée, mise en stock, déplacement) : supprimable", () => {
    assert.equal(tx.refusSuppressionLot([{ id: 1, sens: "entree", quantite: 100 }, { id: 2, sens: "mise_en_stock", quantite: 100 }, { id: 3, sens: "deplacement", quantite: 0 }]), null);
  });
  it("une sortie non annulée l'interdit ; annulée, non", () => {
    assert.match(tx.refusSuppressionLot([{ id: 1, sens: "sortie", quantite: 10 }]) ?? "", /Archivez/);
    assert.equal(tx.refusSuppressionLot([{ id: 1, sens: "sortie", quantite: 10 }, { id: 2, sens: "annulation", quantite: 0, annuleId: 1 }]), null);
  });
  it("épuisé = rangé d'office ; en coupe dehors = pas encore", () => {
    const bilan = tx.bilanLot(100, [], [{ sens: "sortie", quantite: 100 }]);
    assert.equal(tx.rangementLot({ archive: false, bilan, enCoupe: 0 }), "epuise");
    assert.equal(tx.rangementLot({ archive: false, bilan, enCoupe: 40 }), "");
    assert.equal(tx.rangementLot({ archive: true, bilan: tx.bilanLot(100, [], []), enCoupe: 0 }), "archive");
  });
});

describe("rouleaux à mesurer", () => {
  it("pas d'écart BL tant que des rouleaux restent à mesurer", () => {
    const base = { quantiteRecue: 120, quantiteAnnoncee: 400, laize: null, laizeAnnoncee: null, defauts: "" };
    assert.equal(tx.ecartsReception({ ...base, aMesurer: 3 }).aReclamer, false);
    assert.equal(tx.ecartsReception(base).aReclamer, true);
  });
});
