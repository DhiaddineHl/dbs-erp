import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  bilanOuvriereJour,
  carnet,
  lireSaisiePaquets,
  capacitePaquets,
  contenuPaquet,
  controleHeure,
  controleJournee,
  formatPaquets,
  lirePaquets,
  nbPaquetsOf,
  taillePaquet,
  type LigneSaisie,
} from "./paquets-heure";

const num = (t: string) => {
  const r = lirePaquets(t);
  assert.ok(r.ok, `lecture refusée : ${t}`);
  return r.numeros;
};

describe("lirePaquets — l'agent écrit comme il veut", () => {
  it("virgules, espaces, points-virgules et plages", () => {
    assert.deepEqual(num("12, 13"), [12, 13]);
    assert.deepEqual(num("12 13"), [12, 13]);
    assert.deepEqual(num("12;13"), [12, 13]);
    assert.deepEqual(num("12-15"), [12, 13, 14, 15]);
    assert.deepEqual(num("12 à 14, 20"), [12, 13, 14, 20]);
    assert.deepEqual(num(""), []);
  });
  it("doublons retirés, résultat trié", () => {
    assert.deepEqual(num("13, 12, 13"), [12, 13]);
  });
  it("refuse ce qui n'est pas un numéro, avec un message lisible", () => {
    const r = lirePaquets("12, abc");
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /abc/);
    assert.equal(lirePaquets("0").ok, false);
    assert.equal(lirePaquets("15-12").ok, false);
    assert.equal(lirePaquets("1-500").ok, false); // trop de paquets d'un coup
  });
});

describe("formatPaquets — réécriture lisible", () => {
  it("replie les suites d'au moins trois", () => {
    assert.equal(formatPaquets([12, 13, 14, 16]), "12-14, 16");
    assert.equal(formatPaquets([12, 13]), "12, 13");
    assert.equal(formatPaquets([5]), "5");
    assert.equal(formatPaquets([]), "");
  });
  it("aller-retour avec la lecture", () => {
    assert.deepEqual(num(formatPaquets([1, 2, 3, 9])), [1, 2, 3, 9]);
  });
});

describe("taille du paquet et découpage de l'OF", () => {
  it("le modèle l'emporte sur le réglage, 25 par défaut", () => {
    assert.equal(taillePaquet(17, 30), 17);
    assert.equal(taillePaquet(0, 30), 30);
    assert.equal(taillePaquet(null, 0), 25);
  });
  it("1 200 pièces par 25 = 48 paquets", () => {
    assert.equal(nbPaquetsOf(1200, 25), 48);
    assert.equal(nbPaquetsOf(1210, 25), 49); // le dernier est plus petit
    assert.equal(nbPaquetsOf(0, 25), 0); // quantité inconnue : aucun contrôle
  });
  it("le dernier paquet porte le reste", () => {
    assert.equal(contenuPaquet(48, 1210, 25), 25);
    assert.equal(contenuPaquet(49, 1210, 25), 10);
    assert.equal(capacitePaquets([48, 49], 1210, 25), 35);
    assert.equal(capacitePaquets([1, 2], 0, 25), 50); // sans quantité connue : taille pleine
  });
});

describe("contrôle d'une heure — seule la borne haute est certaine", () => {
  const base = { qteOf: 1200, taille: 25, nbPaquets: 48 };
  it("60 pièces pour 2 paquets : impossible", () => {
    const a = controleHeure({ ...base, pieces: 60, numeros: [12, 13] });
    assert.equal(a?.niveau, "erreur");
    assert.match(a!.message, /60 pièces/);
    assert.match(a!.message, /50/);
  });
  it("50 pièces pour 2 paquets : juste à la limite, rien à signaler", () => {
    assert.equal(controleHeure({ ...base, pieces: 50, numeros: [12, 13] }), null);
  });
  it("10 pièces pour 2 paquets : normal à cheval sur l'heure", () => {
    assert.equal(controleHeure({ ...base, pieces: 10, numeros: [12, 13] }), null);
  });
  it("numéro de paquet au-delà de l'OF", () => {
    const a = controleHeure({ ...base, pieces: 20, numeros: [60] });
    assert.equal(a?.niveau, "erreur");
    assert.match(a!.message, /48/);
  });
  it("sans quantité connue, aucun contrôle de numéro", () => {
    assert.equal(controleHeure({ pieces: 20, numeros: [60], taille: 25, nbPaquets: 0 }), null);
  });
  it("paquets notés sur une heure ABS, ou sans pièces", () => {
    assert.equal(controleHeure({ ...base, pieces: "ABS", numeros: [12] })?.niveau, "attention");
    assert.equal(controleHeure({ ...base, pieces: undefined, numeros: [12] })?.niveau, "attention");
  });
  it("sans paquet noté, rien n'est reproché", () => {
    assert.equal(controleHeure({ ...base, pieces: 999, numeros: [] }), null);
  });
});

describe("bilan d'une ouvrière sur la journée", () => {
  const j = (heures: { pieces: number | "ABS"; numeros: number[] }[]) =>
    bilanOuvriereJour({ ouvId: 1, nom: "Fadila", heures, qteOf: 1200, taille: 25 });

  it("les paquets entamés d'une heure à l'autre se compensent", () => {
    // 3 paquets cités (75 pièces) pour 70 déclarées : cohérent.
    const b = j([
      { pieces: 20, numeros: [12] },
      { pieces: 30, numeros: [12, 13] },
      { pieces: 20, numeros: [13, 14] },
    ]);
    assert.deepEqual(b.paquets, [12, 13, 14]);
    assert.equal(b.pieces, 70);
    assert.equal(b.capacite, 75);
    assert.equal(b.ecart, -5);
    assert.equal(b.alerte, null);
  });
  it("plus de pièces que de paquets : erreur", () => {
    const b = j([{ pieces: 200, numeros: [12, 13] }]);
    assert.equal(b.alerte?.niveau, "erreur");
    assert.equal(b.ecart, 150);
  });
  it("deux paquets entiers sans pièces : attention", () => {
    const b = j([{ pieces: 20, numeros: [12, 13, 14] }]);
    assert.equal(b.alerte?.niveau, "attention");
  });
  it("un seul paquet entamé en fin de journée ne déclenche rien", () => {
    const b = j([{ pieces: 55, numeros: [12, 13, 14] }]);
    assert.equal(b.alerte, null);
  });
  it("aucun paquet noté : pas de recoupement, pas de reproche", () => {
    const b = j([{ pieces: 400, numeros: [] }]);
    assert.equal(b.alerte, null);
    assert.equal(b.paquets.length, 0);
  });
  it("ABS ne compte pas dans les pièces", () => {
    assert.equal(j([{ pieces: "ABS", numeros: [] }, { pieces: 20, numeros: [] }]).pieces, 20);
  });
});

describe("contrôle de toute la journée", () => {
  const l = (ouvId: number, nom: string, col: string, pieces: number, poste: string, numeros: number[]): LigneSaisie => ({
    ouvId, nom, col, pieces, poste, numeros,
  });

  it("un même paquet sur le même poste chez deux ouvrières est signalé", () => {
    const r = controleJournee({
      lignes: [l(1, "Fadila", "H1", 20, "Montage col", [12]), l(2, "Sonia", "H1", 20, "montage col", [12])],
      qteOf: 1200,
      taille: 25,
    });
    assert.equal(r.alertes.filter((a) => /même poste/.test(a.message)).length, 1);
  });
  it("le même paquet sur DEUX postes différents est normal (chaîne)", () => {
    const r = controleJournee({
      lignes: [l(1, "Fadila", "H1", 20, "Montage col", [12]), l(2, "Sonia", "H1", 20, "Pose manches", [12])],
      qteOf: 1200,
      taille: 25,
    });
    assert.equal(r.alertes.length, 0);
  });
  it("couverture : ce que la journée a touché de l'OF", () => {
    const r = controleJournee({
      lignes: [l(1, "Fadila", "H1", 20, "p", [1, 2]), l(1, "Fadila", "H2", 20, "p", [2, 3])],
      qteOf: 1200,
      taille: 25,
    });
    assert.deepEqual(r.couverture.vus, [1, 2, 3]);
    assert.equal(r.couverture.nbPaquets, 48);
    assert.equal(r.utilise, true);
  });
  it("journée sans aucun paquet noté : rien à afficher, aucune alerte", () => {
    const r = controleJournee({ lignes: [l(1, "Fadila", "H1", 400, "p", [])], qteOf: 1200, taille: 25 });
    assert.equal(r.utilise, false);
    assert.equal(r.alertes.length, 0);
  });
  it("les erreurs passent avant les attentions", () => {
    const r = controleJournee({
      lignes: [l(1, "Fadila", "H1", 20, "p", [60]), l(2, "Sonia", "H1", 0, "p", [1])],
      qteOf: 1200,
      taille: 25,
    });
    assert.equal(r.alertes[0].niveau, "erreur");
  });
});

describe("le relevé horaire travaille avec les VRAIS paquets", () => {
  const vrais = [
    { numero: 1, code: "PQ-2026-000010", taille: "S", qte: 25, of: "OF-001" },
    { numero: 2, code: "PQ-2026-000011", taille: "S", qte: 25, of: "OF-001" },
    { numero: 3, code: "PQ-2026-000012", taille: "M", qte: 10, of: "OF-001" }, // dernier paquet, plus petit
  ];
  const c = carnet(vrais);

  it("un code scanné devient le numéro du paquet", () => {
    const r = lireSaisiePaquets("PQ-2026-000011", c);
    assert.deepEqual(r.ok && r.numeros, [2]);
  });
  it("l'adresse entière du QR marche aussi (douchette ou caméra)", () => {
    const r = lireSaisiePaquets("https://app.dbs/p/PQ-2026-000012/3", c);
    assert.deepEqual(r.ok && r.numeros, [3]);
  });
  it("on mélange scans et numéros tapés dans la même case", () => {
    const r = lireSaisiePaquets("1, PQ-2026-000011", c);
    assert.deepEqual(r.ok && r.numeros, [1, 2]);
  });
  it("un paquet d'un AUTRE OF est refusé nommément", () => {
    const r = lireSaisiePaquets("PQ-2026-009999", c);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /n'est pas un paquet de cet OF/);
  });
  it("un numéro tapé qui n'existe pas est refusé", () => {
    const r = lireSaisiePaquets("7", c);
    assert.equal(r.ok, false);
    assert.match(r.ok === false ? r.error : "", /n'existe pas dans cet OF/);
  });
  it("sans paquets créés à la coupe, tout continue comme avant", () => {
    assert.deepEqual(lireSaisiePaquets("12, 13", null).ok && lireSaisiePaquets("12, 13", null), { ok: true, numeros: [12, 13] });
    assert.equal(carnet([]), null);
  });

  it("le recoupement porte sur la VRAIE quantité, pas sur 25 théoriques", () => {
    // Paquets 2 et 3 : 25 + 10 = 35 pièces réelles, et non 50.
    assert.equal(capacitePaquets([2, 3], 1200, 25, c), 35);
    const a = controleHeure({ pieces: 40, numeros: [2, 3], qteOf: 1200, taille: 25, nbPaquets: 3, carnet: c });
    assert.equal(a?.niveau, "erreur");
    assert.match(a!.message, /35/);
    // Sans carnet, les mêmes 40 pièces passaient pour cohérentes (2 × 25).
    assert.equal(controleHeure({ pieces: 40, numeros: [2, 3], qteOf: 1200, taille: 25, nbPaquets: 48 }), null);
  });

  it("un numéro inconnu est signalé même s'il a été saisi avant la coupe", () => {
    const a = controleHeure({ pieces: 10, numeros: [9], qteOf: 1200, taille: 25, nbPaquets: 3, carnet: c });
    assert.equal(a?.niveau, "erreur");
    assert.match(a!.message, /n'existe pas dans cet OF/);
  });

  it("la journée entière se recoupe sur les quantités réelles", () => {
    const r = controleJournee({
      lignes: [{ ouvId: 1, nom: "Fadila", col: "H1", pieces: 30, poste: "Montage", numeros: [3] }],
      qteOf: 1200,
      taille: 25,
      carnet: c,
    });
    // 30 pièces déclarées sur un paquet qui n'en contient que 10.
    assert.equal(r.alertes[0].niveau, "erreur");
    assert.equal(r.couverture.nbPaquets, 3);
  });
});
