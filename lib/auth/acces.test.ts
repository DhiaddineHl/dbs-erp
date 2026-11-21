import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, posix } from "node:path";
import { fileURLToPath } from "node:url";
import { moduleOuvert, unModuleOuvert } from "./acces";

test("la matrice décide : module décoché = fermé, l'administrateur passe toujours", () => {
  const m = { cockpit: false, commandes: true };
  assert.equal(moduleOuvert("cockpit", m, "chef"), false);
  assert.equal(moduleOuvert("commandes", m, "chef"), true);
  // Absent de la matrice = ouvert (accès par défaut d'un rôle neuf), comme le menu.
  assert.equal(moduleOuvert("stats", m, "chef"), true);
  assert.equal(moduleOuvert("cockpit", m, "admin"), true);
  // Paramètres : l'administrateur seul, même coché.
  assert.equal(moduleOuvert("parametres", { parametres: true }, "resp"), false);
  // Décocher « Magasin » ferme le magasin, même si l'ancienne case « Réception ST » était cochée.
  assert.equal(moduleOuvert("magasin", { magasin: false, br: true }, "magasin"), false);
  assert.equal(moduleOuvert("magasin", { magasin: true, br: false }, "magasin"), true);
  assert.equal(unModuleOuvert(["cockpit", "commandes"], m, "chef"), true);
  assert.equal(unModuleOuvert(["cockpit"], m, "chef"), false);
});

/* Gardes lues dans le code : aucune page, aucun export, aucune action ne doit
 * être oubliée — une page nouvelle sans garde fait échouer ce test. */
const racine = fileURLToPath(new URL("../../", import.meta.url));
const lire = (p: string) => readFileSync(join(racine, p), "utf8");
function fichiers(dir: string, nom: RegExp): string[] {
  const out: string[] = [];
  for (const e of readdirSync(join(racine, dir))) {
    const p = posix.join(dir, e); // « / » partout, Windows compris
    if (statSync(join(racine, p)).isDirectory()) out.push(...fichiers(p, nom));
    else if (nom.test(e)) out.push(p);
  }
  return out;
}

test("chaque page du bureau vérifie son module", () => {
  // Pages qui ne font que rediriger vers une page gardée, ou qui sont la page de refus elle-même.
  const redirections = ["actions", "br", "capacite", "gammes", "ofs", "ordonnancement", "qrqc"];
  for (const p of fichiers("app/(app)", /^page\.tsx$/)) {
    const seg = p.split("/")[2];
    const s = lire(p);
    if (redirections.includes(seg)) {
      assert.match(s, /redirect\(/, `${p} doit seulement rediriger`);
      assert.ok(!/@\/lib\/services/.test(s), `${p} ne doit lire aucune donnée`);
      continue;
    }
    if (seg === "sans-acces") continue;
    if (/await requireAdmin\(\)/.test(s)) continue; // Paramètres, Journal : administrateur seul
    if (/<PagePreparation ecran="/.test(s)) continue; // gardée dans PagePreparation
    assert.match(s, new RegExp(`exigerModule\\("${seg}"`), `${p} doit appeler exigerModule("${seg}")`);
  }
  assert.match(lire("app/(app)/preparation/page-preparation.tsx"), /exigerModule\(ecran\)/);
});

test("chaque export (route) et chaque écran du téléphone vérifie son module", () => {
  const libres = ["app/api/auth/[...all]/route.ts", "app/api/version/route.ts", "app/api/fichier/[hash]/route.ts"];
  for (const p of [...fichiers("app/(app)", /^route\.ts$/), ...fichiers("app/api", /^route\.ts$/)]) {
    if (libres.includes(p)) continue;
    assert.match(lire(p), /utilisateurAvecModule\(/, `${p} doit vérifier le module`);
  }
  for (const p of fichiers("app/m", /^page\.tsx$/)) {
    if (p === "app/m/page.tsx") continue; // l'accueil ne montre que les tuiles autorisées
    assert.match(lire(p), /accesTissuPage|accesGpaoPage|moduleOuvert|entreeAutorisee|exigerModule/, `${p} doit vérifier le module`);
  }
  assert.match(lire("lib/auth/tissu.ts"), /moduleOuvert\("magtissu"/);
  assert.match(lire("lib/auth/gpao.ts"), /moduleOuvert\(module/);
  // Plus de lien en dur vers le Cockpit depuis le téléphone.
  assert.ok(!/href="\/cockpit"/.test(lire("app/m/page.tsx")));
});

test("chaque fichier d'actions du serveur vérifie le module", () => {
  // Portails extérieurs : clé + PIN, pas de compte. journal : trace de déconnexion. modules : délègue à commandes.
  const hors = ["portail-client.ts", "portail-soustraitant.ts", "journal.ts", "modules.ts", "tissu.ts", "saisie-gpao.ts"];
  const liste = [...fichiers("lib/actions", /\.ts$/).filter((p) => !hors.some((h) => p.endsWith(`/${h}`))), "app/(app)/gpao_prod/actions.ts", "app/(app)/qrouv/actions.ts"];
  for (const p of liste) {
    const s = lire(p);
    assert.ok(!/assertUser\(\)/.test(s), `${p} : assertUser seul ne suffit plus, utiliser assertModule`);
    assert.match(s, /assertModule\(/, `${p} doit appeler assertModule`);
  }
  // tissu et saisie GPAO passent par leurs auteurs, eux-mêmes gardés par module.
  assert.match(lire("lib/actions/tissu.ts"), /auteurTissu/);
  assert.match(lire("lib/actions/saisie-gpao.ts"), /auteurGpao/);
  assert.match(lire("app/(app)/parametres/actions.ts"), /assertAdmin\(\)/);
});

test("personne ne se crée de compte tout seul ; les portails ne font confiance qu'à la clé + PIN", () => {
  const auth = lire("lib/auth.ts");
  assert.match(auth, /disableSignUp: true/, "l'inscription libre doit rester fermée");
  assert.match(auth, /"\/sign-in\/email": \{ window: 60, max: 5 \}/, "les essais de mot de passe doivent rester limités");
  assert.ok(!/"pilotpro-portail"/.test(lire("lib/services/portail-acces.ts")), "aucun secret de repli écrit dans le code");
  // Chaque action d'un portail revérifie la clé ET le PIN (sauf la saisie du PIN elle-même).
  for (const p of ["lib/actions/portail-client.ts", "lib/actions/portail-soustraitant.ts"]) {
    const s = lire(p);
    for (const bloc of s.split(/\nexport async function /).slice(1)) {
      const nom = bloc.split("(")[0];
      if (nom === "entrerPin") continue;
      const corps = bloc.split(/\nexport /)[0];
      assert.match(corps, /accesAutorise\(|await acces\(/, `${p} › ${nom} doit vérifier la clé et le PIN`);
    }
  }
  const conf = lire("next.config.ts");
  for (const h of ["X-Frame-Options", "Referrer-Policy", "X-Content-Type-Options"]) assert.ok(conf.includes(h), `en-tête ${h}`);
});
