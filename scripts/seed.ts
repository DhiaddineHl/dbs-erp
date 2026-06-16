/**
 * Idempotent seed / migration of the existing in-app data into Postgres.
 * Run: `npm run db:seed` (loads .env, executes via tsx).
 *
 * Uses its OWN db connection (not lib/db, which is `server-only`) and imports
 * only plain data + schema. Sources the same code-level data the app shipped:
 *  - Facturation reference (CLIENTS_DB / FACONNIERS) + 86 invoices (FACTURES_BASE)
 *  - GPAO defaults (1 modèle, 1 chaîne, 22 ouvrières)
 *  - Role-permission matrix defaults, prixFacon setting, default user accounts.
 */
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { drizzle } from "drizzle-orm/node-postgres";
import { eq } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { Pool } from "pg";

import * as schema from "@/lib/db/schema";
import { CLIENTS_DB, FACONNIERS } from "@/lib/facturation/reference";
import { FACTURES_BASE } from "@/lib/facturation/seed";
import { defaults as gpaoDefaults } from "@/app/(app)/gpao_prod/store";
import { MODULE_IDS, ROLE_KEYS, defaultModuleAccess } from "@/lib/auth/permissions";
import * as M from "@/lib/modules/seed-data";

const {
  client,
  faconnier,
  facture,
  factureLigne,
  factureExtra,
  modele,
  chaine,
  ouvriere,
  rolePermission,
  appSetting,
  user,
  account,
} = schema;

const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const db = drizzle(pool, { schema, casing: "snake_case" });

const DEFAULT_USERS = [
  { email: "admin@dbs.local", password: "admin123", name: "Administrateur", role: "admin" },
  { email: "resp@dbs.local", password: "resp123", name: "Responsable Prod.", role: "resp" },
  { email: "dbs@dbs.local", password: "dbs123", name: "Chef DBS", role: "chef" },
] as const;

async function seedPermissions() {
  for (const role of ROLE_KEYS) {
    const access = defaultModuleAccess(role);
    for (const moduleId of MODULE_IDS) {
      await db
        .insert(rolePermission)
        .values({ role, moduleId, allowed: access[moduleId] })
        .onConflictDoNothing({ target: [rolePermission.role, rolePermission.moduleId] });
    }
  }
  await db.insert(appSetting).values({ key: "prixFacon", value: 3.5 }).onConflictDoNothing({ target: appSetting.key });
  console.log(`  ✓ permission matrix (${ROLE_KEYS.length} roles × ${MODULE_IDS.length} modules) + settings`);
}

async function seedUsers() {
  for (const u of DEFAULT_USERS) {
    const [exists] = await db.select({ id: user.id }).from(user).where(eq(user.email, u.email));
    if (exists) continue;
    const id = randomUUID();
    await db.insert(user).values({ id, name: u.name, email: u.email, emailVerified: true, role: u.role });
    await db.insert(account).values({
      id: randomUUID(),
      accountId: id,
      providerId: "credential",
      userId: id,
      password: await hashPassword(u.password),
    });
  }
  console.log(`  ✓ ${DEFAULT_USERS.length} default users (admin@dbs.local / admin123, …)`);
}

async function seedFacturation() {
  for (const [key, c] of Object.entries(CLIENTS_DB)) {
    const values = { key, nom: c.nom, adresse: c.adresse, livraison: c.livraison, marque: c.marque };
    await db.insert(client).values(values).onConflictDoUpdate({ target: client.key, set: values });
  }
  for (const name of FACONNIERS) {
    await db.insert(faconnier).values({ name }).onConflictDoNothing({ target: faconnier.name });
  }
  for (const f of FACTURES_BASE) {
    const header = {
      num: f.id,
      type: f.type,
      date: f.date,
      clientKey: f.client === "autre" ? null : f.client,
      marque: f.marque,
      clientRaw: f.clientRaw,
      pieces: f.pieces,
      total: f.total,
      fournitures: f.fournitures,
      poids: f.poids,
      mp: f.mp,
      incoterm: f.incoterm,
      paiement: f.paiement,
      matieres: f.matieres,
    };
    const [row] = await db
      .insert(facture)
      .values(header)
      .onConflictDoUpdate({ target: [facture.num, facture.type], set: header })
      .returning({ id: facture.id });
    await db.delete(factureLigne).where(eq(factureLigne.factureId, row.id));
    await db.delete(factureExtra).where(eq(factureExtra.factureId, row.id));
    if (f.lignes.length)
      await db.insert(factureLigne).values(f.lignes.map((l, idx) => ({ factureId: row.id, idx, ...l })));
    if (f.extras.length)
      await db.insert(factureExtra).values(f.extras.map((e) => ({ factureId: row.id, label: e.label, mt: e.mt })));
  }
  console.log(`  ✓ ${Object.keys(CLIENTS_DB).length} clients, ${FACONNIERS.length} façonniers, ${FACTURES_BASE.length} factures`);
}

async function seedGpao() {
  const existing = await db.select({ id: chaine.id }).from(chaine);
  if (existing.length) {
    console.log("  • GPAO already seeded — skipped");
    return;
  }
  const d = gpaoDefaults();
  for (const m of d.modeles) {
    await db.insert(modele).values({ nom: m.nom, ref: m.ref, client: m.client, sam: m.sam, qte: m.qte });
  }
  for (const c of d.chaines) {
    const [row] = await db.insert(chaine).values({ nom: c.nom, chef: c.chef }).returning({ id: chaine.id });
    if (c.ouvrieres.length)
      await db.insert(ouvriere).values(c.ouvrieres.map((o) => ({ chaineId: row.id, nom: o.nom, poste: o.poste, sam: o.sam })));
  }
  console.log(`  ✓ ${d.modeles.length} modèle(s), ${d.chaines.length} chaîne(s), ${d.chaines[0]?.ouvrieres.length ?? 0} ouvrières`);
}

async function insertIfEmpty<T extends PgTable>(tbl: T, rows: T["$inferInsert"][]) {
  const count = await db.$count(tbl);
  if (count > 0) return false;
  if (rows.length) await db.insert(tbl).values(rows);
  return true;
}

async function seedModules() {
  const s = schema;
  let n = 0;
  const tick = (ok: boolean) => ok && n++;

  tick(await insertIfEmpty(s.mClient, M.CLIENTS));
  tick(await insertIfEmpty(s.mFaconnier, M.FACONNIERS));
  tick(await insertIfEmpty(s.mGamme, M.GAMMES));
  tick(await insertIfEmpty(s.mCapaciteChaine, M.CAPACITE_CHAINES));
  tick(await insertIfEmpty(s.mOf, M.OFS));

  tick(await insertIfEmpty(s.mCommande, M.COMMANDES.map((c) => ({
    of: c.of, modele: c.modele, client: c.client, assigne: c.assigne, qte: c.qte, pv: c.pv, pf: c.pf,
    marge: c.marge, export: c.export, retardTone: c.retard[0], retardLabel: c.retard[1], av: c.av,
    statutTone: c.statut[0], statutLabel: c.statut[1],
  }))));
  tick(await insertIfEmpty(s.mTissu, M.TISSUS.map((r) => ({
    date: r.date, cmd: r.cmd, design: r.design, recue: r.recue, prevue: r.prevue,
    ecartTone: r.ecart[0], ecartLabel: r.ecart[1], controleTone: r.controle[0], controleLabel: r.controle[1],
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mFourniture, M.FOURNITURES.map((r) => ({
    date: r.date, cmd: r.cmd, type: r.type, design: r.design, qte: r.qte,
    controleTone: r.controle[0], controleLabel: r.controle[1], statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mCoupe, M.COUPE.map((r) => ({
    of: r.of, mc: r.mc, qte: r.qte, coupee: r.coupee, planif: r.planif, fin: r.fin,
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mBe, M.BE.map((r) => ({
    of: r.of, mc: r.mc, envoi: r.envoi, ok: r.ok, ref: r.ref, statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mCosting, M.COSTING.map((r) => ({
    of: r.of, modele: r.modele, qte: r.qte, sam: r.sam, coutP: r.coutP, coutT: r.coutT, pf: r.pf,
    ecartTone: r.ecart[0], ecartLabel: r.ecart[1], delai: r.delai,
  }))));
  tick(await insertIfEmpty(s.mOrdo, M.ORDO.map((r) => ({
    rang: r.rang, prioTone: r.prio[0], prioLabel: r.prio[1], of: r.of, mc: r.mc, qte: r.qte, sam: r.sam,
    charge: r.charge, assigne: r.assigne, export: r.export, critTone: r.crit[0], critLabel: r.crit[1],
  }))));
  tick(await insertIfEmpty(s.mBr, M.BRS.map((r) => ({
    br: r.br, date: r.date, facon: r.facon, cmd: r.cmd, recu: r.recu, oknc: r.oknc,
    controleTone: r.controle[0], controleLabel: r.controle[1],
  }))));
  tick(await insertIfEmpty(s.mMagasin, M.MAGASIN.map((r) => ({
    of: r.of, mc: r.mc, sourceTone: r.source[0], sourceLabel: r.source[1], cmd: r.cmd, recu: r.recu,
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mBl, M.BLS.map((r) => ({
    bl: r.bl, date: r.date, client: r.client, lignes: r.lignes, qte: r.qte, total: r.total,
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mArchive, M.ARCHIVES.map((r) => ({
    of: r.of, modele: r.modele, client: r.client, qte: r.qte, ca: r.ca, marge: r.marge, livre: r.livre,
    retardTone: r.retard[0], retardLabel: r.retard[1],
  }))));
  tick(await insertIfEmpty(s.mAlerte, M.ALERTS.map((r) => ({
    iconName: r.iconName, tone: r.tone, title: r.title, detail: r.detail,
    levelTone: r.level[0], levelLabel: r.level[1],
  }))));
  tick(await insertIfEmpty(s.mQrqc, M.QRQC.map((r) => ({
    date: r.date, pb: r.pb, cause: r.cause, cmd: r.cmd, action: r.action,
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mAction, M.ACTIONS.map((r) => ({
    action: r.action, resp: r.resp, echeance: r.echeance, prioTone: r.prio[0], prioLabel: r.prio[1],
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));

  console.log(n ? `  ✓ ${n} module table(s) seeded` : "  • modules already seeded — skipped");
}

async function main() {
  console.log("Seeding database…");
  await seedPermissions();
  await seedUsers();
  await seedFacturation();
  await seedGpao();
  await seedModules();
  console.log("Done.");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
