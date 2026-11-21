/**
 * Retire de la base les données de démonstration que `scripts/seed.ts`
 * injectait à chaque démarrage (avant qu'elles passent derrière `--demo`).
 *
 *   npm run db:purge-demo            → simulation : liste ce qui serait supprimé
 *   npm run db:purge-demo -- --apply → supprime, dans une seule transaction
 *
 * Ne touche JAMAIS aux utilisateurs, comptes, sessions, rôles ni permissions.
 *
 * Repérage, volontairement strict pour ne pas emporter de vraies données :
 *  - commandes : n° d'OF ET modèle identiques à la démo (OF-2026-001 « Chemise
 *    Oxford »…). Leurs lâchers, réceptions, mouvements magasin partent avec
 *    (cascade) ; les BL qui ne portent que des commandes de démo aussi.
 *  - clients / façonniers : clé (resp. nom) de la démo, et seulement si plus
 *    rien en base ne les référence une fois les commandes de démo retirées.
 *    Un client démo réutilisé par une vraie commande est conservé et signalé.
 *  - grand livre : les noms de la démo sont de vrais fournisseurs (SUNPLASTIK…),
 *    donc un compte n'est retiré que si ses mouvements sont exactement ceux de
 *    la démo. Un compte repris de PilotPro ne correspond jamais.
 */
import type { PoolClient } from "pg";
import { pool } from "./import/db";
import * as M from "@/lib/modules/seed-data";
import { FOURNISSEURS_DEMO } from "@/lib/facturation/encaissements-seed";

const appliquer = process.argv.includes("--apply");

/** Toutes les colonnes qui référencent `table.id`, lues dans le catalogue :
 * une table ajoutée plus tard est couverte sans toucher à ce script. */
async function references(c: PoolClient, table: string) {
  const { rows } = await c.query<{ tbl: string; col: string }>(
    `select cl.relname as tbl, a.attname as col
       from pg_constraint k
       join pg_class cl on cl.oid = k.conrelid
       join pg_attribute a on a.attrelid = k.conrelid and a.attnum = k.conkey[1]
      where k.contype = 'f' and k.confrelid = $1::regclass`,
    [table],
  );
  return rows;
}

async function estReference(c: PoolClient, refs: { tbl: string; col: string }[], id: number) {
  const trouves: string[] = [];
  for (const r of refs) {
    const { rows } = await c.query(`select count(*)::int as n from "${r.tbl}" where "${r.col}" = $1`, [id]);
    if (rows[0].n > 0) trouves.push(`${r.tbl} (${rows[0].n})`);
  }
  return trouves;
}

async function main() {
  const c = await pool.connect();
  try {
    await c.query("begin");
    console.log(appliquer ? "Purge des données de démo — APPLICATION\n" : "Purge des données de démo — simulation (rien n'est modifié)\n");

    /* 1. Commandes de démo (+ BL qui ne contiennent qu'elles). */
    const cmds = (
      await c.query<{ id: number; of_number: string; modele: string }>(
        `select id, of_number, modele from commande
          where (of_number, modele) in (select * from unnest($1::text[], $2::text[]))`,
        [M.COMMANDES.map((x) => x.ofNumber), M.COMMANDES.map((x) => x.modele)],
      )
    ).rows;
    const cmdIds = cmds.map((x) => x.id);
    for (const x of cmds) console.log(`  commande  ${x.of_number} — ${x.modele}`);

    const bls = cmdIds.length
      ? (
          await c.query<{ id: number; numero: string }>(
            `select b.id, b.numero from bl b
              where exists (select 1 from bl_ligne l where l.bl_id = b.id and l.commande_id = any($1))
                and not exists (select 1 from bl_ligne l where l.bl_id = b.id
                                 and (l.commande_id is null or l.commande_id <> all($1)))`,
            [cmdIds],
          )
        ).rows
      : [];
    for (const x of bls) console.log(`  BL        ${x.numero}`);

    if (cmdIds.length) {
      const { rows } = await c.query(
        `select (select count(*) from coupe where commande_id = any($1))::int as coupe,
                (select count(*) from br where commande_id = any($1))::int as br,
                (select count(*) from magasin_mouvement where commande_id = any($1))::int as mvt`,
        [cmdIds],
      );
      console.log(`            + ${rows[0].coupe} lâcher(s), ${rows[0].br} réception(s), ${rows[0].mvt} mouvement(s) magasin`);
    }

    await c.query(`delete from bl where id = any($1)`, [bls.map((x) => x.id)]);
    await c.query(`delete from commande where id = any($1)`, [cmdIds]);

    /* 2. Clients et façonniers de démo, s'ils ne servent plus à rien. */
    const refsClient = await references(c, "client");
    const clients = (
      await c.query<{ id: number; nom: string }>(`select id, nom from client where key = any($1)`, [M.CLIENTS.map((x) => x.key)])
    ).rows;
    const clientsSuppr: number[] = [];
    for (const x of clients) {
      const util = await estReference(c, refsClient, x.id);
      if (util.length) console.log(`  ⚠ client   ${x.nom} conservé — encore utilisé par ${util.join(", ")}`);
      else {
        console.log(`  client    ${x.nom}`);
        clientsSuppr.push(x.id);
      }
    }
    await c.query(`delete from client where id = any($1)`, [clientsSuppr]);

    const refsFac = await references(c, "faconnier");
    const facs = (
      await c.query<{ id: number; nom: string }>(`select id, nom from faconnier where nom = any($1)`, [M.FACONNIERS.map((x) => x.nom)])
    ).rows;
    const facsSuppr: number[] = [];
    for (const x of facs) {
      const util = await estReference(c, refsFac, x.id);
      if (util.length) console.log(`  ⚠ façonnier ${x.nom} conservé — encore utilisé par ${util.join(", ")}`);
      else {
        console.log(`  façonnier ${x.nom}`);
        facsSuppr.push(x.id);
      }
    }
    await c.query(`delete from faconnier where id = any($1)`, [facsSuppr]);

    /* 3. Grand livre : uniquement les comptes dont les mouvements sont ceux de la démo. */
    const comptesSuppr: number[] = [];
    for (const f of FOURNISSEURS_DEMO) {
      const compte = (await c.query<{ id: number }>(`select id from fournisseur_compte where nom = $1`, [f.nom])).rows[0];
      if (!compte) continue;
      const mvts = (
        await c.query<{ libelle: string; debit: number; credit: number }>(
          `select libelle, debit::float8 as debit, credit::float8 as credit from fournisseur_transaction where compte_id = $1`,
          [compte.id],
        )
      ).rows;
      const cle = (t: { libelle: string; debit: number; credit: number }) =>
        `${t.libelle}|${Number(t.debit).toFixed(3)}|${Number(t.credit).toFixed(3)}`;
      const reel = mvts.map(cle).sort().join("\n");
      const demo = f.transactions.map(cle).sort().join("\n");
      if (reel === demo) {
        console.log(`  grand livre ${f.nom} (${mvts.length} mouvements de démo)`);
        comptesSuppr.push(compte.id);
      }
    }
    await c.query(`delete from fournisseur_compte where id = any($1)`, [comptesSuppr]);

    /* 4. Signalement seulement : un flux aval fabriqué sur de vraies commandes
     * (le seed le faisait quand la table coupe était vide). Trop proche d'une
     * saisie réelle pour être supprimé automatiquement. */
    const { rows: suspects } = await c.query(
      `select count(*)::int as n from coupe
        where type = 'interne' and note in ('Lâcher principal', 'Complément')`,
    );
    if (suspects[0].n > 0)
      console.log(`\n  ⚠ ${suspects[0].n} lâcher(s) de coupe ressemblent au flux de démo (note « Lâcher principal » / « Complément ») sur des commandes conservées — à vérifier à la main, non supprimés.`);

    const total = cmdIds.length + bls.length + clientsSuppr.length + facsSuppr.length + comptesSuppr.length;
    if (appliquer) {
      await c.query("commit");
      console.log(`\n✓ ${total} élément(s) de démo supprimé(s). Utilisateurs et accès inchangés.`);
    } else {
      await c.query("rollback");
      console.log(`\n${total} élément(s) seraient supprimés. Relancer avec --apply pour le faire.`);
    }
  } catch (e) {
    await c.query("rollback");
    throw e;
  } finally {
    c.release();
    await pool.end();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
