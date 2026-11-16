import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import * as st from "./soustraitant";

test("date à livrer = export − délai", () => {
  assert.equal(st.dateALivrer("2026-12-20", 7), "2026-12-13");
  assert.equal(st.dateALivrer(null, 7), null);
});

test("saisie du soir : cumuls emboîtés", () => {
  assert.equal(st.refusDeclaration({ lance: 100, produit: 80, emballe: 50 }), null);
  assert.match(st.refusDeclaration({ lance: 100, produit: 120, emballe: 0 })!, /dépasser lancé/);
  assert.match(st.refusDeclaration({ lance: 100, produit: 80, emballe: 90 })!, /dépasser produit/);
  assert.match(st.refusDeclaration({ lance: 1.5, produit: 0, emballe: 0 })!, /entiers/);
});

test("alertes : envoyé dépassé, baisse, bond", () => {
  const a = st.alertesDeclaration({ saisie: { lance: 600, produit: 100, emballe: 0 }, precedent: { lance: 500, produit: 150, emballe: 0 }, reference: 500 });
  assert.ok(a.some((x) => /Lancé 600/.test(x)));
  assert.ok(a.some((x) => /Produit baisse/.test(x)));
  const b = st.alertesDeclaration({ saisie: { lance: 500, produit: 450, emballe: 0 }, precedent: { lance: 500, produit: 50, emballe: 0 }, reference: 500 });
  assert.ok(b.some((x) => /d'un coup/.test(x)));
  assert.deepEqual(st.alertesDeclaration({ saisie: { lance: 500, produit: 120, emballe: 0 }, precedent: { lance: 500, produit: 60, emballe: 0 }, reference: 500 }), []);
});

test("sans nouvelle après 2 jours", () => {
  assert.equal(st.sansNouvelle("2026-11-14", "2026-11-15"), false);
  assert.equal(st.sansNouvelle("2026-11-13", "2026-11-15"), true);
  assert.equal(st.sansNouvelle(null, "2026-11-15"), true);
});

test("date de fin estimée au rythme récent", () => {
  const h = [
    { jour: "2026-11-10", produit: 0 },
    { jour: "2026-11-12", produit: 100 },
    { jour: "2026-11-14", produit: 200 },
  ];
  // 50 / jour, reste 300 → 6 jours
  assert.equal(st.dateFinEstimee(h, 500, "2026-11-15"), "2026-11-20");
  assert.equal(st.dateFinEstimee(h.slice(0, 1), 500, "2026-11-15"), null);
  assert.equal(st.dateFinEstimee([{ jour: "2026-11-10", produit: 10 }, { jour: "2026-11-12", produit: 10 }], 500, "2026-11-15"), null);
});

test("confection vue par le client : plafonnée, jamais en recul", () => {
  assert.equal(
    st.confectionDeclaree(
      [
        { lance: 100, produit: 80, emballe: 0 },
        { lance: 100, produit: 60, emballe: 0 },
      ],
      500,
    ),
    80,
  );
  assert.equal(st.confectionDeclaree([{ lance: 900, produit: 900, emballe: 0 }], 500), 500);
});

test("livraison comparée à la coupe, motif exigé seulement en cas d'écart", () => {
  const lignes = [
    { taille: "S", premier: 98, second: 2 },
    { taille: "M", premier: 150, second: 0 },
  ];
  const c = st.comparerAuPlan(lignes, { S: 100, M: 200 });
  assert.deepEqual(
    c.map((x) => [x.taille, x.ecart]),
    [
      ["S", 0],
      ["M", -50],
    ],
  );
  assert.match(st.refusLivraison(lignes, c, "", "")!, /motif/);
  assert.equal(st.refusLivraison(lignes, c, "partielle", ""), null);
  assert.match(st.refusLivraison(lignes, c, "autre", "")!, /Précisez/);
  const juste = st.comparerAuPlan([{ taille: "S", premier: 50, second: 0 }], { S: 100 }, { S: 50 });
  assert.equal(st.refusLivraison([{ taille: "S", premier: 50, second: 0 }], juste, "", ""), null);
  assert.match(st.refusLivraison([], [], "", "")!, /au moins une/);
});

test("lignes propres : tailles connues, entiers", () => {
  assert.deepEqual(st.lignesPropres([{ taille: "S", premier: 0, second: 0 }, { taille: "M", premier: 3, second: 1 }], ["S", "M"]), [{ taille: "M", premier: 3, second: 1 }]);
  assert.throws(() => st.lignesPropres([{ taille: "XXL", premier: 1, second: 0 }], ["S"]));
  assert.throws(() => st.lignesPropres([{ taille: "S", premier: -1, second: 0 }], ["S"]));
});

test("BR : 1er choix conforme, 2e choix non conforme ; montant dû", () => {
  assert.deepEqual(st.versBr([{ taille: "S", premier: 98, second: 2 }, { taille: "M", premier: 150, second: 0 }]), { qteRecue: 250, qteOk: 248, qteNc: 2, controle: "ecart" });
  assert.deepEqual(st.versBr([{ taille: "S", premier: 10, second: 0 }]).controle, "ok");
  assert.equal(st.montantDu(248, 2.5), 620);
  assert.equal(st.montantDu(10, null), 0);
});

test("fiabilité : annoncé face au compté", () => {
  const f = st.fiabilite([
    { annonce: [{ taille: "S", premier: 100, second: 0 }], recu: [{ taille: "S", premier: 100, second: 0 }] },
    { annonce: [{ taille: "S", premier: 100, second: 0 }], recu: [{ taille: "S", premier: 90, second: 0 }] },
  ]);
  assert.equal(f.nb, 2);
  assert.equal(f.justes, 1);
  assert.equal(f.ecartPieces, 10);
  assert.equal(f.pct, 95);
  assert.equal(st.fiabilite([]).pct, null);
});

test("rapport de coupe : consommé + chute + reste ≈ reçu", () => {
  assert.equal(st.controleRouleauRapport({ consomme: 80, chute: 5, reste: 15 }, 100), null);
  assert.match(st.controleRouleauRapport({ consomme: 50, chute: 5, reste: 15 }, 100)!, /reçus/);
  assert.match(st.controleRouleauRapport({ consomme: -1, chute: 0, reste: 0 }, 100)!, /positifs/);
});

/* Cloisonnement : le portail sous-traitant ne lit jamais le prix de vente, la
 * marge, ni (sauf réglage) le nom du client ; la page ne touche pas la base. */
test("cloisonnement du portail sous-traitant", () => {
  const svc = readFileSync(new URL("../services/portail-soustraitant.ts", import.meta.url), "utf8");
  for (const interdit of [/prixVente/, /marge/i, /\bouvrier/i, /ouvriere/i, /chaineId/]) {
    assert.ok(!interdit.test(svc), `portail-soustraitant.ts ne doit pas contenir ${interdit}`);
  }
  // Le nom du client ne sort que derrière le réglage.
  assert.ok(/montrerClient\s*\?/.test(svc), "le nom du client doit passer par le réglage montrerClient");
  const page = readFileSync(new URL("../../app/portail/s/[cle]/page.tsx", import.meta.url), "utf8");
  assert.ok(!/@\/lib\/db/.test(page), "la page ne doit pas lire la base directement");
  assert.ok(!/prixVente|marge/i.test(page));
});
