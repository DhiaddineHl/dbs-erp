import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  etatMagasin,
  listesReception,
  livraisonComplete,
  ncEnAttente,
  normaliserReception,
  produitCommande,
  quantiteLivrable,
  stockPhysique,
  verifierReception,
} from "./aval";

describe("réception façonnier — saisie normalisée", () => {
  it("« 0 conforme » est respecté (avant : remplacé par tout le reçu)", () => {
    assert.deepEqual(normaliserReception({ qteRecue: 100, qteOk: 0, qteNc: 100, controle: "ecart" }), {
      qteRecue: 100, qteOk: 0, qteNc: 100, controle: "ecart",
    });
  });
  it("conforme vide = reçu − non conforme", () => {
    const n = normaliserReception({ qteRecue: 100, qteOk: null, qteNc: 20, controle: "ok" });
    assert.equal(n.qteOk, 80);
    assert.equal(n.controle, "ecart"); // des NC ⇒ ce n'est pas « conforme »
  });
  it("lot refusé : rien n'entre au stock, tout est NC", () => {
    assert.deepEqual(normaliserReception({ qteRecue: 50, qteOk: 50, qteNc: 0, controle: "refuse" }), {
      qteRecue: 50, qteOk: 0, qteNc: 50, controle: "refuse",
    });
  });
  it("conforme + NC > reçu reste bloquant", () => {
    const a = verifierReception({ qteCommandee: 100, dejaProduit: 0, totalCoupe: 0, qteRecue: 50, qteOk: 40, qteNc: 20 });
    assert.ok(a.some((x) => x.niveau === "bloquant"));
  });
});

describe("produit — une seule formule", () => {
  it("interne (GPAO) + façonnier + retouches, plafonné à la commande", () => {
    assert.equal(produitCommande({ qte: 1000, gpao: 400, brOk: 300, reprises: 20 }), 720);
    assert.equal(produitCommande({ qte: 500, gpao: 400, brOk: 300, reprises: 0 }), 500);
  });
  it("une entrée magasin ne remet plus la production interne à zéro", () => {
    // Commande interne : aucun BR — la production GPAO reste comptée.
    assert.equal(produitCommande({ qte: 1000, gpao: 400, brOk: 0, reprises: 0 }), 400);
  });
});

describe("stock & expéditions en plusieurs fois", () => {
  const base = { qte: 1000, produit: 1000, magasinQte: 1000, magasinPrepare: false, magasinExpedie: false };
  it("stock = entré − expédié", () => {
    assert.equal(stockPhysique({ magasinQte: 1000, expedieQte: 300 }), 700);
  });
  it("un premier BL de 300 ne solde plus la commande", () => {
    assert.equal(etatMagasin({ ...base, expedieQte: 300 }), "expediePartiel");
    assert.equal(quantiteLivrable({ ...base, expedieQte: 300 }), 700);
    assert.equal(livraisonComplete(1000, 300), false);
  });
  it("livrée en partie puis stock vide : « expédié en partie », même si le lot avait été préparé", () => {
    assert.equal(etatMagasin({ ...base, magasinQte: 400, magasinPrepare: true, expedieQte: 400 }), "expediePartiel");
    assert.equal(etatMagasin({ ...base, magasinQte: 700, magasinPrepare: true, expedieQte: 400 }), "prepare");
  });
  it("expédiée quand tout est parti", () => {
    assert.equal(etatMagasin({ ...base, expedieQte: 1000 }), "expedie");
    assert.equal(livraisonComplete(1000, 1000), true);
  });
  it("sans passage par le stock : reste à livrer", () => {
    assert.equal(quantiteLivrable({ qte: 1000, produit: 1000, magasinQte: 0, expedieQte: 400 }), 600);
  });
});

describe("non conformes", () => {
  it("en attente = NC − (retouchées + rebut)", () => {
    assert.equal(ncEnAttente(30, 12), 18);
    assert.equal(ncEnAttente(30, 40), 0);
  });
});

describe("saisie mobile du magasinier", () => {
  const base = {
    modele: "M", couleur: "", client: "C", chaine: "", qte: 1000, produit: 0,
    produitGpao: 0, entreesInternes: 0, etatMagasin: "vide" as const,
  };
  const cmds = [
    { ...base, id: 1, of: "OF-1", chaine: "Chaîne 1", faconnier: "", produit: 400, produitGpao: 400, entreesInternes: 250 },
    { ...base, id: 2, of: "OF-2", chaine: "Chaîne 2", faconnier: "", produit: 100, produitGpao: 100, entreesInternes: 100 },
    { ...base, id: 3, of: "OF-3", faconnier: "Medina", produit: 700 },
    { ...base, id: 4, of: "OF-4", faconnier: "Medina", produit: 1000 },
    { ...base, id: 5, of: "OF-5", faconnier: "Atelier B", etatMagasin: "expedie" as const },
    { ...base, id: 6, of: "OF-6", chaine: "Chaîne 1", faconnier: "", produit: 1000, produitGpao: 1000, entreesInternes: 1000 },
  ];
  it("interne : quantité pré-remplie = GPAO − déjà entré, en tête de liste", () => {
    const l = listesReception(cmds);
    assert.deepEqual(l.internes.map((c) => [c.of, c.aEntrer]), [["OF-1", 150], ["OF-2", 0]]);
  });
  it("façonniers : seulement ce qui reste à recevoir, groupé, sans les expédiées", () => {
    const l = listesReception(cmds);
    assert.deepEqual(l.faconniers.map((f) => [f.faconnier, f.commandes.map((c) => [c.of, c.reste])]), [["Medina", [["OF-3", 300]]]]);
  });
});
