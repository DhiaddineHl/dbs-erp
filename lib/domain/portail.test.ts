import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import * as pt from "./portail";

const base: pt.FaitsCommandeClient = {
  qte: 1000, tissuPrevu: "2026-11-02", tissuRecu: "", coupe: 0, confection: 0, controle: "", controleLe: "", emballe: 0, expedieLe: "", exportPrevu: "2026-12-10",
};

describe("frise d'une commande vue par le client", () => {
  it("six étapes, dans l'ordre", () => {
    assert.deepEqual(pt.etapesCommande(base).map((e) => e.cle), ["tissu", "coupe", "confection", "controle", "emballage", "expedition"]);
  });
  it("à venir, en cours, fait", () => {
    const e = pt.etapesCommande({ ...base, tissuRecu: "2026-11-04", coupe: 1000, confection: 640, controle: "en_cours" });
    assert.deepEqual(e.map((x) => x.etat), ["fait", "fait", "en_cours", "en_cours", "a_venir", "a_venir"]);
    assert.equal(e[0].detail, "reçu le 04/11");
    assert.equal(e[2].detail.replace(/\s/g, " "), "640 / 1 000 (64 %)");
    assert.equal(e[5].detail, "prévue le 10/12");
    assert.equal(pt.etapesCommande(base)[0].detail, "attendu le 02/11");
  });
});

describe("feu client", () => {
  const f = (x: Partial<Parameters<typeof pt.feuClient>[0]>) => pt.feuClient({ exportPrevu: "2026-12-10", expedieLe: "", avancement: 50, aujourdhui: "2026-11-15", ...x }).ton;
  it("vert, orange, rouge, bleu", () => {
    assert.equal(f({}), "vert");
    assert.equal(f({ aujourdhui: "2026-12-05" }), "orange");
    assert.equal(f({ aujourdhui: "2026-12-05", avancement: 90 }), "vert");
    assert.equal(f({ aujourdhui: "2026-12-11" }), "rouge");
    assert.equal(f({ expedieLe: "2026-12-09" }), "bleu");
    assert.equal(f({ exportPrevu: "" }), "vert");
  });
});

describe("suivi colis et PIN", () => {
  it("lien DHL par défaut, autres transporteurs, inconnu", () => {
    assert.match(pt.urlSuivi("DHL Express", "12 3456"), /dhl\.com.*tracking-id=123456/);
    assert.match(pt.urlSuivi("", "999"), /dhl\.com/);
    assert.match(pt.urlSuivi("UPS", "1Z"), /ups\.com/);
    assert.equal(pt.urlSuivi("Camion de Moncef", "12"), "");
    assert.equal(pt.urlSuivi("DHL", ""), "");
  });
  it("PIN à 6 chiffres, blocage après 5 erreurs", () => {
    assert.equal(pt.pinValide("123456"), true);
    assert.equal(pt.pinValide("12345"), false);
    assert.equal(pt.pinValide("12a456"), false);
    const t = new Date(2026, 10, 15, 10, 0);
    let e = { echecs: 0, bloqueJusqua: null as Date | null };
    for (let i = 0; i < 4; i++) e = pt.apresEchec(e.echecs, t);
    assert.deepEqual([e.echecs, e.bloqueJusqua], [4, null]);
    e = pt.apresEchec(e.echecs, t);
    assert.equal(e.echecs, 0);
    assert.match(pt.refusBlocage(e.bloqueJusqua, t)!, /15 minutes/);
    assert.equal(pt.refusBlocage(e.bloqueJusqua, new Date(t.getTime() + 16 * 60_000)), null);
  });
});

/* LA règle du portail client : il ne doit JAMAIS laisser passer un
 * sous-traitant, un prix ou une ouvrière. On lit le code du service qui
 * construit ses données : s'il touche à l'une de ces colonnes, le test
 * échoue — avant que le client ne la voie. */
describe("cloisonnement du portail client", () => {
  const code = (p: string) =>
    readFileSync(new URL(p, import.meta.url), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/\/\/.*$/gm, "");
  const INTERDITS = [
    /faconnier/i, /façonnier/i, /sous-?trait/i, /soustrait/i, /prixFacon/, /prixVente/, /marge/i, /\bouvrier/i, /ouvriere/i,
    /chaineId/, /\bchaine\b/, /destination/, /faconnierNom/, /\.\.\.\s*[a-z]+\.c\b/,
  ];
  it("lib/services/portail-client.ts ne lit aucune colonne interdite", () => {
    const src = code("../services/portail-client.ts");
    for (const r of INTERDITS) assert.equal(r.test(src), false, `motif interdit dans le portail client : ${r}`);
  });
  it("les pages du portail client ne lisent que ce service", () => {
    const src = code("../../app/portail/c/[cle]/page.tsx");
    assert.equal(/@\/lib\/db/.test(src), false, "la page ne lit pas la base directement");
    for (const r of INTERDITS) assert.equal(r.test(src), false, `motif interdit dans la page du portail : ${r}`);
  });
});
