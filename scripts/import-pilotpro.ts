/**
 * Reprise des données réelles PilotPro dans Postgres.
 *
 *   npm run import:pilotpro -- [fichier.json] [--reset] [--sans-comptes] [--auto]
 *
 * Sans `--reset`, l'import est cumulatif et rejouable : les commandes sont
 * mises à jour par numéro d'OF, les référentiels complétés sans écrasement.
 * Les tables de mouvement (coupe, bons de réception, journées, règlements)
 * sont en revanche des insertions : les rejouer sans `--reset` créerait des
 * doublons. Le script le refuse et le dit.
 *
 * `--reset` vide les tables reprises avant d'importer. C'est destructif et
 * demande une confirmation explicite.
 *
 * `--auto` est le mode démarrage, appelé par `npm start` avant `next start`.
 * Il n'a pas de terminal pour poser sa question, et il tourne à chaque
 * redémarrage du conteneur — pas seulement aux redéploiements. Il ne peut donc
 * pas se contenter de `--reset` : il vérifie d'abord un marqueur en base
 * (`app_setting.importPilotpro`), posé après chaque reprise réussie.
 *
 *   marqueur absent  → reprise complète, remise à zéro comprise, sans question
 *   marqueur présent → rien du tout, sortie en succès
 *
 * Autrement dit la reprise a lieu une fois, au premier démarrage qui suit la
 * mise en service, et jamais plus. C'est délibéré : la relancer écraserait
 * tout ce qui a été saisi dans l'application depuis. Pour la rejouer malgré
 * tout, poser `IMPORT_PILOTPRO=reset` dans l'environnement du service — et
 * retirer la variable ensuite, sinon chaque redémarrage repart de la
 * sauvegarde et efface le travail du jour.
 */

import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { db, pool, schema } from "./import/db";
import { Rapport, lireSauvegarde } from "./import/source";
import { importerReferentiel } from "./import/referentiel";
import { importerCommandes } from "./import/commandes";
import { importerAval } from "./import/aval";
import { importerQualite, importerTissus } from "./import/qualite";
import { importerGpao } from "./import/gpao";
import { importerEncaissements, importerFacturation, importerGrandLivre } from "./import/facturation";
import { importerComptes } from "./import/comptes";

/* Trois sauvegardes coexistent dans `draft/`, et une seule est complète.
 *
 * Celle du 15/08 a perdu les 183 lignes « _pre » — les commandes reconstruites
 * depuis les factures, qui portent l'historique facturé (701 813,39 de CA).
 * Aucune commande de production n'y manque, mais le pont vers la facturation,
 * si. Celle du 12/08 les a toutes, et ignore en revanche cinq factures
 * (103–107/2026, 41 048,40), quinze écritures du grand livre et onze journées
 * de production postérieures.
 *
 * `_fusionne` est la réunion des deux, vérifiée : elle couvre les 294 numéros
 * d'OF des deux fichiers et reprend, à l'identique, les données de facturation,
 * de grand livre et de GPAO les plus récentes. C'est la seule qui ne perd
 * rien. */
const DEFAUT = "draft/PilotPro_sauvegarde_complete_2026-08-15_fusionne.json";

/** Tables vidées par `--reset`, dans l'ordre des dépendances. */
const TABLES_REPRISES = [
  "magasin_mouvement",
  "br",
  "coupe",
  "bl_ligne",
  "bl",
  "qc_photo",
  "qc_mesure",
  "qc_defaut",
  "qc_inspection",
  "commande_tds",
  "commande_etape",
  "commande_fourniture_ligne",
  "commande_lancement",
  "commande_journal",
  "commande_prix_journal",
  "of_supprime",
  "commande",
  "reglement",
  "fournisseur_transaction",
  "fournisseur_compte",
  "facture_cost_line",
  "journee",
  "ouvriere",
  "chaine",
  "modele",
  "m_qrqc",
];

/** Tables où toute réexécution crée des doublons. */
const TABLES_CUMULATIVES = ["coupe", "br", "journee", "reglement", "qc_inspection"];

async function contientDesDonnees(): Promise<string[]> {
  const pleines: string[] = [];
  for (const t of TABLES_CUMULATIVES) {
    const res = await db.execute(sql.raw(`select count(*)::int as n from "${t}"`));
    const n = Number((res.rows[0] as { n: number }).n);
    if (n > 0) pleines.push(`${t} (${n})`);
  }
  return pleines;
}

/* Marqueur de reprise. En base plutôt que sur disque : le système de fichiers
 * d'un conteneur est jeté à chaque déploiement, alors que la question posée
 * — « ces données sont-elles déjà dedans ? » — porte sur la base. */
const CLE_MARQUEUR = "importPilotpro";

type Marqueur = { fichier: string; le: string };

async function lireMarqueur(): Promise<Marqueur | null> {
  const [row] = await db
    .select({ value: schema.appSetting.value })
    .from(schema.appSetting)
    .where(eq(schema.appSetting.key, CLE_MARQUEUR));
  return (row?.value as Marqueur | undefined) ?? null;
}

async function poserMarqueur(fichier: string) {
  const value: Marqueur = { fichier, le: new Date().toISOString() };
  await db
    .insert(schema.appSetting)
    .values({ key: CLE_MARQUEUR, value })
    .onConflictDoUpdate({ target: schema.appSetting.key, set: { value } });
}

async function demander(question: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const r = await rl.question(question);
  rl.close();
  return r.trim();
}

async function reinitialiser(rapport: Rapport) {
  rapport.etape("Remise à zéro");
  for (const t of TABLES_REPRISES) {
    await db.execute(sql.raw(`truncate table "${t}" restart identity cascade`));
  }
  rapport.ok("tables vidées", TABLES_REPRISES.length);
  rapport.info("les factures de base, le référentiel, le personnel et les rôles sont conservés");
}

async function main() {
  const args = process.argv.slice(2);
  const auto = args.includes("--auto");
  const sansComptes = args.includes("--sans-comptes");
  const chemin = args.find((a) => !a.startsWith("--")) ?? DEFAUT;
  // En mode démarrage, la remise à zéro fait partie du contrat : on repart de
  // la sauvegarde, donc on repart d'une base propre.
  const reset = args.includes("--reset") || auto;

  if (auto) {
    const dejaFait = await lireMarqueur();
    const forcer = process.env.IMPORT_PILOTPRO === "reset";
    if (dejaFait && !forcer) {
      console.log(`Reprise PilotPro : déjà effectuée le ${dejaFait.le} (${dejaFait.fichier}) — ignorée.`);
      await pool.end();
      return;
    }
    if (dejaFait) console.log("Reprise PilotPro : IMPORT_PILOTPRO=reset — la reprise est rejouée.");
  }

  if (!existsSync(chemin)) {
    // En mode démarrage on ne fait pas tomber le service pour ça : sans
    // sauvegarde, l'application démarre sur ce que le seed a posé.
    console.error(`Fichier introuvable : ${chemin}`);
    await pool.end();
    process.exit(auto ? 0 : 1);
  }

  console.log(`\nReprise PilotPro — ${chemin}\n`);

  const rapport = new Rapport();
  const src = lireSauvegarde(chemin);

  rapport.etape("Lecture");
  rapport.ok("commandes", src.orders.length);
  rapport.ok("clients", src.clients.length);
  rapport.ok("façonniers", src.faconniers.length);
  rapport.ok("bons de réception", src.brs.length);
  rapport.ok("journées GPAO", src.gpao.journees?.length ?? 0);
  rapport.ok("comptes du grand livre", src.grandLivre.length);
  rapport.ok("corrections de factures", Object.keys(src.overrides).length);

  if (!src.orders.length) {
    console.error("\nLa sauvegarde ne contient aucune commande — fichier inattendu. Abandon.");
    await pool.end();
    process.exit(1);
  }

  if (auto) {
    // Pas de terminal pour répondre, et le marqueur a déjà tranché plus haut.
    await reinitialiser(rapport);
  } else if (reset) {
    const reponse = await demander(
      `\n⚠  --reset va VIDER ${TABLES_REPRISES.length} tables (commandes, production, encaissements, grand livre).\n` +
        `   Tapez « effacer » pour confirmer : `,
    );
    if (reponse !== "effacer") {
      console.log("Abandon — rien n'a été touché.");
      await pool.end();
      process.exit(0);
    }
    await reinitialiser(rapport);
  } else {
    const pleines = await contientDesDonnees();
    if (pleines.length) {
      console.error(
        `\nCes tables contiennent déjà des mouvements : ${pleines.join(", ")}.\n` +
          `Les réimporter créerait des doublons silencieux.\n` +
          `Relancez avec --reset pour repartir d'une base propre.\n`,
      );
      await pool.end();
      process.exit(1);
    }
  }

  const idxRef = await importerReferentiel(src, rapport);
  const idxCmd = await importerCommandes(src, idxRef, rapport);
  await importerTissus(src, idxCmd, rapport);
  await importerAval(src, idxCmd, rapport);
  await importerQualite(src, idxCmd, rapport);
  await importerGpao(src, rapport);
  await importerFacturation(src, rapport);
  await importerEncaissements(src, rapport);
  await importerGrandLivre(src, rapport);
  if (!sansComptes) await importerComptes(src, rapport);
  else rapport.info("comptes utilisateurs ignorés (--sans-comptes)");

  /* Posé après coup, et pour toute reprise réussie — pas seulement `--auto` :
   * une reprise lancée à la main compte, elle aussi, comme « les données sont
   * dedans ». Sinon le démarrage suivant la referait par-dessus. */
  await poserMarqueur(chemin);

  rapport.imprimer();
  console.log("\nReprise terminée.\n");
  await pool.end();
}

main().catch(async (e) => {
  console.error("\nÉchec de la reprise :", e);
  await pool.end();
  process.exit(1);
});
