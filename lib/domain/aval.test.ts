import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  aEntrerInterne,
  etatMagasin,
  repartirProductionGpao,
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

describe("production GPAO répartie entre OF frères", () => {
  const of = (id: number, qte: number, dateExport: string | null, o: Partial<{ clientId: number; modele: string; recoitSurplus: boolean }> = {}) => ({
    id, qte, dateExport, clientId: o.clientId ?? 1, modele: o.modele ?? "REJEANNE", recoitSurplus: o.recoitSurplus ?? true,
  });

  it("« à entrer » ne dépasse jamais la commande", () => {
    assert.equal(aEntrerInterne({ produitGpao: 3719, entreesInternes: 0, qte: 1200 }), 1200);
    assert.equal(aEntrerInterne({ produitGpao: 3719, entreesInternes: 1000, qte: 1200 }), 200);
    assert.equal(aEntrerInterne({ produitGpao: 500, entreesInternes: 200, qte: 1200 }), 300);
    // 768 déjà entrés par d'autres voies (réception façonnier) : il ne reste que 432 de place.
    assert.equal(aEntrerInterne({ produitGpao: 1200, entreesInternes: 0, qte: 1200, magasinQte: 768 }), 432);
  });

  it("le surplus va aux OF frères dans l'ordre des dates d'export, le reste est un excédent", () => {
    // Modèle relié à OF 332 seul ; 3719 pièces sorties.
    const r = repartirProductionGpao(
      [of(332, 1200, "2026-09-10"), of(340, 1000, "2026-10-05"), of(335, 900, "2026-09-20"), of(400, 500, "2026-09-01", { modele: "AUTRE" })],
      new Map([[332, 3719]]),
    );
    assert.deepEqual(r.get(332), { gpao: 1200, excedent: 619 });
    assert.deepEqual(r.get(335), { gpao: 900, excedent: 0 }); // export plus tôt : servi en premier
    assert.deepEqual(r.get(340), { gpao: 1000, excedent: 0 });
    assert.deepEqual(r.get(400), { gpao: 0, excedent: 0 }); // autre modèle : pas frère
  });

  it("pas de surplus vers un autre client, un OF façonnier ou archivé ; la production propre d'un frère passe d'abord", () => {
    const r = repartirProductionGpao(
      [of(1, 100, "2026-01-01"), of(2, 100, "2026-01-02", { clientId: 2 }), of(3, 100, "2026-01-03", { recoitSurplus: false }), of(4, 100, "2026-01-04")],
      new Map([[1, 250], [4, 30]]),
    );
    assert.deepEqual(r.get(1), { gpao: 100, excedent: 80 });
    assert.equal(r.get(2)!.gpao, 0);
    assert.equal(r.get(3)!.gpao, 0);
    assert.equal(r.get(4)!.gpao, 100); // 30 à lui + 70 du surplus
  });

  it("nom de modèle tolérant (casse, accents, espaces)", () => {
    const r = repartirProductionGpao([of(1, 10, null), of(2, 10, null, { modele: "  Réjeanne " })], new Map([[1, 15]]));
    assert.equal(r.get(2)!.gpao, 5);
  });
});
