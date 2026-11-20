import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/* Ménage des archives : garde-fous lus dans le code (le ménage touche la base
 * et le stockage, il est testé de bout en bout à part). */
const src = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");

test("archiver une commande libère l'espace de ses fichiers, sans jamais bloquer l'archivage", () => {
  const cmd = src("../services/commandes.ts");
  assert.match(cmd, /if \(archived\) await libererEspaceArchives\(\)\.catch\(/);
  assert.match(src("../services/facturation-commande.ts"), /if \(res\.complete\) await libererEspaceArchives\(\)\.catch\(/);
  assert.match(src("../services/aval.ts"), /if \(archivees\) await libererEspaceArchives\(\)\.catch\(/);
});

test("un fichier n'est effacé que si plus rien ne l'utilise", () => {
  const m = src("../services/menage-fichiers.ts");
  const verif = m.slice(m.indexOf("export async function effacerSiPlusUtilises"));
  for (const ref of [
    "qcPhoto.hash",
    "qcActionCorrective.photoAvant",
    "qcActionCorrective.photoApres",
    "message.fichierHash",
    "commande.photoHash",
    "commandeDocument.fichierHash",
  ])
    assert.ok(verif.includes(ref), `la vérification doit regarder ${ref}`);
  const orph = m.slice(m.indexOf("async function orphelins"), m.indexOf("export async function effacerSiPlusUtilises"));
  for (const ref of ["qcPhoto", "qcActionCorrective", "message", "commande.photoHash", "commandeDocument"])
    assert.ok(orph.includes(ref), `orphelins doit exclure ${ref}`);
  assert.match(orph, /2 \* 86_400_000/, "un fichier tout juste déposé n'est jamais orphelin");
  // Les fiches ne sont pas supprimées : elles restent à l'historique, marquées.
  assert.match(m, /retirePar: "Archivage automatique/);
  assert.ok(!/delete\(commandeDocument\)/.test(m));
  assert.match(m, /journaliser\(/);
});
