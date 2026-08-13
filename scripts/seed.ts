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
import { BUILTIN_ROLES, MODULE_IDS, defaultModuleAccess } from "@/lib/auth/permissions";
import { ROLES_DBS } from "@/lib/auth/roles-seed";
import { OPERATIONS_DBS, PERSONNEL_DBS } from "@/lib/atelier/atelier-seed";
import { cleAleatoire } from "@/lib/atelier/cle";
import { existsSync, readFileSync } from "node:fs";
import * as M from "@/lib/modules/seed-data";
import { BAREMES_CLIENTS } from "@/lib/qc/baremes-seed";
import {
  COMPTES_BANCAIRES,
  FACTURES_IMPAYEES,
  FOURNISSEURS_DEMO,
  TAUX_EUR_INITIAL,
} from "@/lib/facturation/encaissements-seed";
import { dateEcheance } from "@/lib/domain/finance";
import * as av from "@/lib/domain/aval";
import { rapprocherParNom } from "@/lib/domain/atelier";

/** Load a local .env if present, without overriding already-set env vars
 * (no-op on Railway, where env is injected). */
function loadEnv(file = ".env") {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)?$/);
    if (!m || m[1].startsWith("#")) continue;
    if (process.env[m[1]] !== undefined) continue;
    let val = (m[2] ?? "").trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) val = val.slice(1, -1);
    else val = val.replace(/\s+#.*$/, "").trim();
    process.env[m[1]] = val;
  }
}
loadEnv();

const {
  client,
  commande,
  coupe,
  br,
  magasinMouvement,
  bl,
  blLigne,
  faconnier,
  qcBareme,
  qcBaremePoint,
  compteBancaire,
  reglement,
  fournisseurCompte,
  fournisseurTransaction,
  facture,
  factureLigne,
  factureExtra,
  modele,
  chaine,
  ouvriere,
  personnel,
  operation,
  rolePermission,
  role: roleTable,
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
  // Les rôles de base et les rôles créés par DBS coexistent dans la même table.
  for (const r of BUILTIN_ROLES) {
    await db
      .insert(roleTable)
      .values({ key: r.key, label: r.label, color: r.color, builtin: true })
      .onConflictDoNothing({ target: roleTable.key });
  }
  for (const r of ROLES_DBS) {
    await db
      .insert(roleTable)
      .values({ key: r.key, label: r.label, color: r.color, builtin: false })
      .onConflictDoNothing({ target: roleTable.key });
  }

  const tousRoles: { key: string; acces: Record<string, boolean> }[] = [
    ...BUILTIN_ROLES.map((r) => ({ key: r.key, acces: defaultModuleAccess(r.key) })),
    ...ROLES_DBS.map((r) => {
      // Un module absent de la liste de refus reste accessible ; un écran ajouté
      // depuis leur configuration l'est donc aussi, ce qui est le bon défaut.
      const acces: Record<string, boolean> = {};
      for (const id of MODULE_IDS) acces[id] = id !== "parametres" && !r.refuses.includes(id);
      return { key: r.key, acces };
    }),
  ];

  for (const { key: role, acces: access } of tousRoles) {
    for (const moduleId of MODULE_IDS) {
      await db
        .insert(rolePermission)
        .values({ role, moduleId, allowed: access[moduleId] })
        .onConflictDoNothing({ target: [rolePermission.role, rolePermission.moduleId] });
    }
  }
  await db.insert(appSetting).values({ key: "prixFacon", value: 3.5 }).onConflictDoNothing({ target: appSetting.key });
  console.log(`  ✓ matrice de permissions (${tousRoles.length} rôles × ${MODULE_IDS.length} modules) + réglages`);
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
  for (const nom of FACONNIERS) {
    await db.insert(faconnier).values({ nom }).onConflictDoNothing({ target: faconnier.nom });
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


/** Demo clients / façonniers land in the same tables as the facturation ones —
 * there is only one référentiel now. */
async function seedReferentiel() {
  for (const c of M.CLIENTS) {
    await db.insert(client).values(c).onConflictDoNothing({ target: client.key });
  }
  for (const f of M.FACONNIERS) {
    await db.insert(faconnier).values(f).onConflictDoNothing({ target: faconnier.nom });
  }
  console.log(`  ✓ ${M.CLIENTS.length} clients + ${M.FACONNIERS.length} façonniers (référentiel)`);
}

async function seedCommandes() {
  if ((await db.$count(commande)) > 0) {
    console.log("  • commandes already seeded — skipped");
    return;
  }
  const clients = new Map((await db.select().from(client)).map((c) => [c.nom, c.id]));
  const faconniers = new Map((await db.select().from(faconnier)).map((f) => [f.nom, f.id]));
  const chaines = new Map((await db.select().from(chaine)).map((c) => [c.nom, c.id]));

  for (const c of M.COMMANDES) {
    await db.insert(commande).values({
      ofNumber: c.ofNumber,
      modele: c.modele,
      clientId: clients.get(c.client) ?? null,
      faconnierId: c.faconnier ? (faconniers.get(c.faconnier) ?? null) : null,
      chaineId: c.chaine ? (chaines.get(c.chaine) ?? null) : null,
      qte: c.qte,
      produit: c.produit,
      prixVente: c.prixVente,
      prixFacon: c.prixFacon,
      consoTheo: c.consoTheo,
      dateExport: c.dateExport,
    });
  }
  console.log(`  ✓ ${M.COMMANDES.length} commandes`);
}


/** Barèmes de mesures clients — insérés une fois, jamais écrasés : ce sont des
 * données de travail que la qualité ajuste ensuite. */
async function seedBaremes() {
  if ((await db.$count(qcBareme)) > 0) {
    console.log("  • barèmes qualité déjà seedés — skipped");
    return;
  }
  let points = 0;
  for (const b of BAREMES_CLIENTS) {
    const [row] = await db
      .insert(qcBareme)
      .values({ nom: b.nom, client: b.client, refs: b.refs, tailles: b.tailles })
      .returning({ id: qcBareme.id });
    if (b.points.length) {
      await db.insert(qcBaremePoint).values(
        b.points.map((p, ordre) => ({
          baremeId: row.id, ordre, label: p.label, tolerance: p.tolerance, valeurs: p.valeurs,
        })),
      );
      points += b.points.length;
    }
  }
  console.log(`  ✓ ${BAREMES_CLIENTS.length} barèmes qualité (${points} points de mesure)`);
}


/** Comptes d'encaissement, taux de change et état de règlement des factures. */
async function seedFinance() {
  for (const [ordre, libelle] of COMPTES_BANCAIRES.entries()) {
    await db
      .insert(compteBancaire)
      .values({ libelle, ordre })
      .onConflictDoNothing({ target: compteBancaire.libelle });
  }
  await db
    .insert(appSetting)
    .values({ key: "tauxEur", value: TAUX_EUR_INITIAL })
    .onConflictDoNothing({ target: appSetting.key });

  if ((await db.$count(reglement)) === 0) {
    const [compte] = await db.select().from(compteBancaire).orderBy(compteBancaire.ordre).limit(1);
    const factures = await db.select().from(facture);
    const valeurs = factures
      .filter((f) => f.type === "facture" && !FACTURES_IMPAYEES.has(f.num.split("/")[0].trim()))
      .map((f) => ({
        factureId: f.id,
        // Réglée à l'échéance quand le mode de paiement en exprime une.
        date: dateEcheance(f.date, f.paiement) ?? f.date,
        montant: f.total,
        mode: "Virement",
        compteId: compte?.id ?? null,
        ref: "",
        note: "Repris de l'état initial",
      }));
    if (valeurs.length) await db.insert(reglement).values(valeurs);
    console.log(`  ✓ ${COMPTES_BANCAIRES.length} comptes bancaires, ${valeurs.length} factures soldées`);
  } else {
    console.log("  • encaissements déjà seedés — skipped");
  }
}

/** Grand livre : quelques fournisseurs de démonstration avec des échéances. */
async function seedGrandLivre() {
  if ((await db.$count(fournisseurCompte)) > 0) {
    console.log("  • grand livre déjà seedé — skipped");
    return;
  }
  const jour = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  };
  let mouvements = 0;
  for (const f of FOURNISSEURS_DEMO) {
    const [row] = await db
      .insert(fournisseurCompte)
      .values({ nom: f.nom, categorie: f.categorie, devise: f.devise })
      .returning({ id: fournisseurCompte.id });
    if (f.transactions.length) {
      await db.insert(fournisseurTransaction).values(
        f.transactions.map((t) => ({
          compteId: row.id, date: jour(t.jours), libelle: t.libelle, debit: t.debit, credit: t.credit,
        })),
      );
      mouvements += f.transactions.length;
    }
  }
  console.log(`  ✓ ${FOURNISSEURS_DEMO.length} fournisseurs (${mouvements} mouvements)`);
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

  tick(await insertIfEmpty(s.mGamme, M.GAMMES));
  tick(await insertIfEmpty(s.mCapaciteChaine, M.CAPACITE_CHAINES));
  tick(await insertIfEmpty(s.mOf, M.OFS));

  tick(await insertIfEmpty(s.mTissu, M.TISSUS.map((r) => ({
    date: r.date, cmd: r.cmd, design: r.design, recue: r.recue, prevue: r.prevue,
    ecartTone: r.ecart[0], ecartLabel: r.ecart[1], controleTone: r.controle[0], controleLabel: r.controle[1],
    statutTone: r.statut[0], statutLabel: r.statut[1],
  }))));
  tick(await insertIfEmpty(s.mFourniture, M.FOURNITURES.map((r) => ({
    date: r.date, cmd: r.cmd, type: r.type, design: r.design, qte: r.qte,
    controleTone: r.controle[0], controleLabel: r.controle[1], statutTone: r.statut[0], statutLabel: r.statut[1],
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

/** Flux aval de démonstration : lâchers de coupe, réceptions sous-traitance,
 * entrées magasin et bons de livraison, reconstruits à partir de ce que les
 * commandes déclarent déjà avoir produit.
 *
 * Les totaux sont volontairement cohérents avec la règle de recalcul du
 * service : somme des lâchers = coupe_qte, somme des qte_ok = produit, somme
 * des mouvements = magasin_qte. Sans ça, la première écriture faite dans
 * l'application corrigerait les compteurs et les chiffres bougeraient tout
 * seuls sous les yeux de l'utilisateur. */
async function seedAval() {
  if ((await db.$count(coupe)) > 0) {
    console.log("  • flux aval déjà seedé — skipped");
    return;
  }
  const commandes = await db.select().from(commande).orderBy(commande.id);
  const faconniers = new Map((await db.select().from(faconnier)).map((f) => [f.id, f.nom]));
  const clients = new Map((await db.select().from(client)).map((c) => [c.id, c.nom]));

  const decale = (base: string | null, jours: number) => {
    const d = base ? new Date(`${base}T00:00:00`) : new Date();
    d.setDate(d.getDate() + jours);
    return d.toISOString().slice(0, 10);
  };

  let nBr = 0;
  let nCoupe = 0;
  let nMvt = 0;
  let nBl = 0;
  let seqBr = 0;
  let seqBl = 0;

  for (const c of commandes) {
    if (c.produit <= 0) continue;
    const dateBase = c.dateExport ?? null;

    // Coupe : au moins ce qui a été produit, plafonné à la quantité commandée.
    const totalCoupe = Math.min(c.qte, Math.max(c.produit, Math.round(c.qte * 0.7)));
    const lachers = [Math.ceil(totalCoupe * 0.6), totalCoupe - Math.ceil(totalCoupe * 0.6)].filter((q) => q > 0);
    for (const [i, qte] of lachers.entries()) {
      await db.insert(coupe).values({
        commandeId: c.id, date: decale(dateBase, -40 + i * 6), qte,
        taille: "", type: "interne", note: i === 0 ? "Lâcher principal" : "Complément",
      });
      nCoupe++;
    }

    // Réceptions : la somme des conformes doit valoir exactement `produit`.
    const parts = c.produit >= c.qte ? [Math.ceil(c.produit * 0.55), c.produit - Math.ceil(c.produit * 0.55)] : [c.produit];
    for (const [i, qteOk] of parts.filter((q) => q > 0).entries()) {
      const qteNc = i === 0 ? Math.round(qteOk * 0.008) : 0;
      const date = decale(dateBase, -20 + i * 7);
      const numero = av.numeroBr(++seqBr, Number(date.slice(0, 4)));
      const [row] = await db
        .insert(br)
        .values({
          numero, commandeId: c.id, date, faconnier: c.faconnierId ? (faconniers.get(c.faconnierId) ?? "") : "",
          qteRecue: qteOk + qteNc, qteOk, qteNc, controle: qteNc > 0 ? "ecart" : "ok",
          note: qteNc > 0 ? `${qteNc} pièce(s) écartées au contrôle` : "",
        })
        .returning({ id: br.id });
      nBr++;
      await db.insert(magasinMouvement).values({
        commandeId: c.id, date, qte: qteOk, origine: "br", brId: row.id, note: `Réception ${numero}`,
      });
      nMvt++;
    }

    await db
      .update(commande)
      .set({ coupeQte: totalCoupe, magasinQte: c.produit, magasinPrepare: c.produit >= c.qte })
      .where(eq(commande.id, c.id));

    // Un lot complet part : il a son bon de livraison.
    if (c.produit >= c.qte) {
      const date = decale(dateBase, -3);
      const numero = av.numeroBl(++seqBl, Number(date.slice(0, 4)));
      const [entete] = await db
        .insert(bl)
        .values({
          numero, date, clientId: c.clientId, clientNom: c.clientId ? (clients.get(c.clientId) ?? "") : "",
          transporteur: "Transport DBS", adresseLivraison: "", statut: "sent", note: "",
        })
        .returning({ id: bl.id });
      await db.insert(blLigne).values({
        blId: entete.id, commandeId: c.id, of: c.ofNumber, modele: c.modele,
        refArticle: c.refArticle, couleur: c.couleur, qteLivree: c.qte, prixUnitaire: c.prixVente ?? 0,
      });
      await db
        .update(commande)
        .set({ magasinExpedie: true, magasinPrepare: true, statutLog: "expedie", dateLivraison: date })
        .where(eq(commande.id, c.id));
      nBl++;
    }
  }

  console.log(`  ✓ flux aval : ${nCoupe} lâchers, ${nBr} réceptions, ${nMvt} entrées magasin, ${nBl} BL`);
}

/** Registre du personnel et catalogue des opérations, repris de la sauvegarde
 * client. Chaque personne reçoit une clé de portail tirée du CSPRNG : c'est
 * elle, et non le matricule, que le QR de rendement encode. */
async function seedAtelier() {
  if ((await db.$count(personnel)) === 0) {
    for (const p of PERSONNEL_DBS) {
      await db
        .insert(personnel)
        .values({ ...p, portailCle: cleAleatoire() })
        .onConflictDoNothing({ target: personnel.matricule });
    }
    console.log(`  ✓ ${PERSONNEL_DBS.length} personnes au registre`);
  } else {
    console.log("  • personnel deja seede - skipped");
  }

  if ((await db.$count(operation)) === 0) {
    for (let i = 0; i < OPERATIONS_DBS.length; i += 100) {
      await db.insert(operation).values(OPERATIONS_DBS.slice(i, i + 100));
    }
    console.log(`  ✓ ${OPERATIONS_DBS.length} operations au catalogue`);
  } else {
    console.log("  • operations deja seedees - skipped");
  }

  // Rattachement automatique des ouvrieres de chaine au registre.
  const ouvs = await db.select({ id: ouvriere.id, nom: ouvriere.nom, personnelId: ouvriere.personnelId }).from(ouvriere);
  const pers = await db.select({ id: personnel.id, nom: personnel.nom }).from(personnel);
  const liens = rapprocherParNom(ouvs, pers).filter((r) => r.personnelId !== null);
  for (const l of liens) {
    await db.update(ouvriere).set({ personnelId: l.personnelId }).where(eq(ouvriere.id, l.ouvriereId));
  }
  const restants = ouvs.filter((o) => o.personnelId === null).length - liens.length;
  console.log(`  ✓ ${liens.length} ouvriere(s) rattachee(s) au registre (${restants} a faire a la main)`);
}

async function main() {
  console.log("Seeding database…");
  await seedPermissions();
  await seedUsers();
  await seedFacturation();
  await seedGpao();
  await seedReferentiel();
  await seedCommandes();
  await seedBaremes();
  await seedFinance();
  await seedGrandLivre();
  await seedModules();
  await seedAval();
  await seedAtelier();
  console.log("Done.");
  await pool.end();
}

main().catch(async (e) => {
  console.error(e);
  await pool.end();
  process.exit(1);
});
