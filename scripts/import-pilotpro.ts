/**
 * Reprise des données réelles PilotPro dans Postgres.
 *
 *   npm run import:pilotpro -- [fichier.json] [--reset] [--sans-comptes]
 *
 * Sans `--reset`, l'import est cumulatif et rejouable : les commandes sont
 * mises à jour par numéro d'OF, les référentiels complétés sans écrasement.
 * Les tables de mouvement (coupe, bons de réception, journées, règlements)
 * sont en revanche des insertions : les rejouer sans `--reset` créerait des
 * doublons. Le script le refuse et le dit.
 *
 * `--reset` vide les tables reprises avant d'importer. C'est destructif et
 * demande une confirmation explicite.
 */

import { createInterface } from "node:readline/promises";
import { existsSync } from "node:fs";
import { sql } from "drizzle-orm";
import { db, pool } from "./import/db";
import { Rapport, lireSauvegarde } from "./import/source";
import { importerReferentiel } from "./import/referentiel";
import { importerCommandes } from "./import/commandes";
import { importerAval } from "./import/aval";
import { importerQualite, importerTissus } from "./import/qualite";
import { importerGpao } from "./import/gpao";
import { importerEncaissements, importerFacturation, importerGrandLivre } from "./import/facturation";
import { importerComptes } from "./import/comptes";

const DEFAUT = "draft/PilotPro_sauvegarde_complete_2026-08-12.json";

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
  const reset = args.includes("--reset");
  const sansComptes = args.includes("--sans-comptes");
  const chemin = args.find((a) => !a.startsWith("--")) ?? DEFAUT;

  if (!existsSync(chemin)) {
    console.error(`Fichier introuvable : ${chemin}`);
    process.exit(1);
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

  if (reset) {
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

  rapport.imprimer();
  console.log("\nReprise terminée.\n");
  await pool.end();
}

main().catch(async (e) => {
  console.error("\nÉchec de la reprise :", e);
  await pool.end();
  process.exit(1);
});
