import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

/* GARDE-FOU — le suivi par paquets ne compte JAMAIS la production.
 *
 * Le paquet naît à la coupe et meurt à l'assemblage. Après, ce sont des
 * pièces entières finies, comptées comme avant par la sortie de chaîne.
 * Les deux systèmes se touchent en un seul point — la fiche de coupe fait
 * naître les paquets — et jamais dans l'autre sens.
 *
 * Si quelqu'un, dans deux ans, branche les paquets sur `commande.produit`,
 * sur le coupé ou sur le magasin, ces tests échouent et le disent. */

const lire = (chemin: string) => readFileSync(new URL(chemin, import.meta.url), "utf8");
/** Le garde-fou porte sur le CODE : les commentaires ont le droit d'expliquer
 * la règle, et doivent même le faire. */
const codeSeul = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

const COMPTEURS = ["produit", "coupeQte", "coupe_qte", "magasinQte", "magasin_qte", "recalculerProduit", "recalculerCommande"];

describe("cloisonnement du suivi par paquets", () => {
  it("le domaine des paquets ignore tout du comptage de production", () => {
    const src = codeSeul(lire("./paquet.ts"));
    for (const mot of COMPTEURS) {
      assert.ok(!src.includes(mot), `lib/domain/paquet.ts ne doit pas connaître « ${mot} »`);
    }
  });

  it("le service des paquets n'écrit que dans ses propres tables", () => {
    const src = codeSeul(lire("../services/paquets.ts"));
    for (const mot of COMPTEURS) {
      assert.ok(!src.includes(mot), `lib/services/paquets.ts ne doit pas toucher « ${mot} »`);
    }
    // Les seules tables qu'il modifie sont les siennes.
    const ecritures = [...src.matchAll(/\.(?:insert|update|delete)\(\s*([A-Za-z]+)/g)].map((m) => m[1]);
    const permises = new Set(["paquet", "paquetReleve", "liasseGabarit", "commandePlan"]);
    for (const t of ecritures) assert.ok(permises.has(t), `Le service des paquets ne doit pas écrire dans « ${t} »`);
  });

  it("les actions des paquets ne rappellent aucun calcul d'avancement", () => {
    const src = codeSeul(lire("../actions/paquets.ts"));
    for (const mot of [...COMPTEURS, "avancement"]) {
      assert.ok(!src.includes(mot), `lib/actions/paquets.ts ne doit pas connaître « ${mot} »`);
    }
  });

  it("la coupe fait naître les paquets APRÈS son propre calcul, sans le changer", () => {
    const src = lire("../services/coupe.ts");
    assert.match(src, /recalculerCommande\(t, id\);[\s\S]{0,400}creerPaquetsPourFiche/, "Les paquets naissent après le recalcul du coupé, jamais à sa place.");
    assert.ok(
      !/creerPaquetsPourFiche[\s\S]{0,200}coupeQte/.test(src),
      "La création des paquets ne doit pas toucher au coupé.",
    );
  });

  it("annuler une fiche annule ses paquets sans rien supprimer", () => {
    const src = lire("../services/coupe.ts");
    assert.match(src, /annulerPaquetsDeFiche/);
    const svc = codeSeul(lire("../services/paquets.ts"));
    assert.ok(!/\.delete\(\s*paquet\b/.test(svc), "Un paquet ne se supprime pas : il s'annule.");
    assert.ok(!/\.delete\(\s*paquetReleve\b/.test(svc), "Un relevé ne se supprime pas : il s'annule.");
  });

  it("le suivi éteint ne crée rien du tout", () => {
    const svc = lire("../services/paquets.ts");
    assert.match(
      svc,
      /creerPaquetsPourFiche[\s\S]{0,200}if \(!\(await suiviPaquetsActif\(\)\)\) return 0;/,
      "Sans activation, aucune ligne ne doit être créée.",
    );
  });
});
