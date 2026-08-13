import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, client, commande, commandePrixJournal, faconnier, modele, ofSupprime } from "@/lib/db/schema";
import type { Taille } from "@/lib/db/schema";
import type { Tone } from "@/components/shared/status-badge";
import * as biz from "@/lib/domain/commande";
import { getSetting } from "@/lib/services/permissions";

/* Read models. Amounts and dates come out of the DB typed; every status-like
 * field is computed here from lib/domain/commande.ts rather than stored. */

export type CommandeRow = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  saison: string;
  note: string;

  clientId: number | null;
  client: string;
  faconnierId: number | null;
  faconnier: string;
  chaineId: number | null;
  chaine: string;
  /** Whichever of façonnier / chaîne the commande is assigned to. */
  assigne: string;

  qte: number;
  tailles: Taille[];
  prixVente: number | null;
  prixFacon: number | null;

  /* derived money */
  ca: number;
  margeUnitaire: number;
  margeTotale: number;
  margePct: number;

  produit: number;
  coupeQte: number;
  magasinQte: number;
  factureQte: number;
  av: number;

  consoTheo: number | null;
  consoReel: number | null;
  chutePct: number | null;
  tissuRecu: number;
  besoinTissu: number;
  ecartTissu: number | null;

  receptTissu: string;
  dateExport: string;
  dateExportReel: string;
  dateLivraison: string;
  exportPrev: string;

  tissuLibere: boolean;
  magasinPrepare: boolean;
  magasinExpedie: boolean;
  archived: boolean;
  statutLog: string;
  facNums: string[];

  /* derived status — [tone, label] tuples for the shared badge components */
  statutKey: biz.Statut;
  statut: [Tone, string];
  statutManuel: string;
  retard: [Tone, string];
  retardJours: number | null;
};

export type ClientRow = {
  id: number;
  key: string;
  code: string;
  nom: string;
  marque: string;
  contact: string;
  email: string;
  tel: string;
  ville: string;
  pays: string;
  tva: string;
  adresse: string;
  /** Derived: active commandes and their CA. */
  cmd: number;
  ca: number;
};

export type FaconnierRow = {
  id: number;
  nom: string;
  specialite: string;
  contact: string;
  tel: string;
  prixFacon: number | null;
  /** Derived: active commandes and the pieces still to produce. */
  cmd: number;
  charge: number;
};

const iso = (d: string | null) => d ?? "";

/** Waste rate used when a commande does not carry its own. */
export const getChuteDefaut = () => getSetting<number>("chutePct", 5);

/* ─────────── commandes ─────────── */

type ListOptions = {
  /** Default false — archived commandes belong to /archives. */
  includeArchived?: boolean;
  onlyArchived?: boolean;
};

export async function listCommandes(opts: ListOptions = {}): Promise<CommandeRow[]> {
  const [rows, chuteDefaut, modeles] = await Promise.all([
    db
      .select({
        c: commande,
        clientNom: client.nom,
        faconnierNom: faconnier.nom,
        chaineNom: chaine.nom,
      })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
      .leftJoin(chaine, eq(commande.chaineId, chaine.id))
      .orderBy(commande.id),
    getChuteDefaut(),
    db.select({ nom: modele.nom }).from(modele),
  ]);

  // A modèle already declared in GPAO counts as "in production" even before the
  // first piece is booked against the commande (PilotPro's _gpaoHasModel).
  const gpaoModeles = new Set(modeles.map((m) => biz.normaliserNom(m.nom)));
  const now = new Date();

  return rows
    .filter(({ c }) =>
      opts.onlyArchived ? c.archived : opts.includeArchived ? true : !c.archived,
    )
    .map(({ c, clientNom, faconnierNom, chaineNom }) => {
      const ctx = { enProductionGpao: gpaoModeles.has(biz.normaliserNom(c.modele)), now };
      const statutKey = biz.statutEffectif(c, ctx);
      const r = biz.retard(c, now);
      const assigne = faconnierNom ?? chaineNom ?? "";

      return {
        id: c.id,
        of: c.ofNumber,
        modele: c.modele,
        refArticle: c.refArticle,
        couleur: c.couleur,
        saison: c.saison,
        note: c.note,

        clientId: c.clientId,
        client: clientNom ?? "",
        faconnierId: c.faconnierId,
        faconnier: faconnierNom ?? "",
        chaineId: c.chaineId,
        chaine: chaineNom ?? "",
        assigne,

        qte: c.qte,
        tailles: c.tailles,
        prixVente: c.prixVente,
        prixFacon: c.prixFacon,

        ca: biz.chiffreAffaires(c),
        margeUnitaire: biz.margeUnitaire(c),
        margeTotale: biz.margeTotale(c),
        margePct: biz.margePct(c),

        produit: c.produit,
        coupeQte: c.coupeQte,
        magasinQte: c.magasinQte,
        factureQte: c.factureQte,
        av: biz.avancementPct(c),

        consoTheo: c.consoTheo,
        consoReel: c.consoReel,
        chutePct: c.chutePct,
        tissuRecu: c.tissuRecu,
        besoinTissu: biz.besoinTissu(c, chuteDefaut),
        ecartTissu: biz.ecartTissu(c, chuteDefaut),

        receptTissu: iso(c.receptTissu),
        dateExport: iso(c.dateExport),
        dateExportReel: iso(c.dateExportReel),
        dateLivraison: iso(c.dateLivraison),
        exportPrev: iso(c.exportPrev),

        tissuLibere: c.tissuLibere,
        magasinPrepare: c.magasinPrepare,
        magasinExpedie: c.magasinExpedie,
        archived: c.archived,
        statutLog: c.statutLog,
        facNums: c.facNums,

        statutKey,
        statut: biz.statutBadge(statutKey),
        statutManuel: c.statutManuel ?? "",
        retard: [r.tone, r.label] as [Tone, string],
        retardJours: r.jours,
      };
    });
}

export const listArchives = () => listCommandes({ onlyArchived: true });

/* ─────────── reference data with derived counters ─────────── */

/** Active (non-archived) commandes per client: count + CA. */
async function commandeAggregatsClient() {
  const rows = await db
    .select({
      clientId: commande.clientId,
      cmd: sql<number>`count(*)::int`,
      ca: sql<number>`coalesce(sum(coalesce(${commande.prixVente}, 0) * ${commande.qte}), 0)::float8`,
    })
    .from(commande)
    .where(eq(commande.archived, false))
    .groupBy(commande.clientId);
  return new Map(rows.filter((r) => r.clientId != null).map((r) => [r.clientId!, r]));
}

/** Active commandes per façonnier: count + pieces left to produce. */
async function commandeAggregatsFaconnier() {
  const rows = await db
    .select({
      faconnierId: commande.faconnierId,
      cmd: sql<number>`count(*)::int`,
      charge: sql<number>`coalesce(sum(greatest(${commande.qte} - ${commande.produit}, 0)), 0)::int`,
    })
    .from(commande)
    .where(eq(commande.archived, false))
    .groupBy(commande.faconnierId);
  return new Map(rows.filter((r) => r.faconnierId != null).map((r) => [r.faconnierId!, r]));
}

export async function listClients(): Promise<ClientRow[]> {
  const [rows, agg] = await Promise.all([
    db.select().from(client).orderBy(client.nom),
    commandeAggregatsClient(),
  ]);
  return rows.map((c) => ({
    id: c.id,
    key: c.key,
    code: c.code,
    nom: c.nom,
    marque: c.marque,
    contact: c.contact,
    email: c.email,
    tel: c.tel,
    ville: c.ville,
    pays: c.pays,
    tva: c.tva,
    adresse: c.adresse,
    cmd: agg.get(c.id)?.cmd ?? 0,
    ca: agg.get(c.id)?.ca ?? 0,
  }));
}

export async function listFaconniers(): Promise<FaconnierRow[]> {
  const [rows, agg] = await Promise.all([
    db.select().from(faconnier).orderBy(faconnier.nom),
    commandeAggregatsFaconnier(),
  ]);
  return rows.map((f) => ({
    id: f.id,
    nom: f.nom,
    specialite: f.specialite,
    contact: f.contact,
    tel: f.tel,
    prixFacon: f.prixFacon,
    cmd: agg.get(f.id)?.cmd ?? 0,
    charge: agg.get(f.id)?.charge ?? 0,
  }));
}

/* ─────────── name → id resolution ───────────
 * Commandes arrive from forms and spreadsheets carrying names, not ids. Rather
 * than reject them, resolve loosely and create the missing reference row —
 * which is what an operator typing a new façonnier into the grid expects. */

export async function resolveClientId(nom: string | undefined | null): Promise<number | null> {
  const wanted = biz.normaliserNom(nom);
  if (!wanted) return null;
  const rows = await db.select({ id: client.id, nom: client.nom }).from(client);
  const hit = rows.find((c) => biz.normaliserNom(c.nom) === wanted);
  if (hit) return hit.id;

  const base = biz.slugClient(nom!);
  const taken = new Set(
    (await db.select({ key: client.key }).from(client)).map((c) => c.key),
  );
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const code = `CLI-${String((await db.$count(client)) + 1).padStart(3, "0")}`;
  const [row] = await db
    .insert(client)
    .values({ key, code, nom: nom!.trim() })
    .returning({ id: client.id });
  return row.id;
}

export async function resolveFaconnierId(nom: string | undefined | null): Promise<number | null> {
  const wanted = biz.normaliserNom(nom);
  if (!wanted) return null;
  const rows = await db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier);
  const hit = rows.find((f) => biz.normaliserNom(f.nom) === wanted);
  if (hit) return hit.id;
  const [row] = await db
    .insert(faconnier)
    .values({ nom: nom!.trim() })
    .returning({ id: faconnier.id });
  return row.id;
}

/* ─────────── OF numbering ─────────── */

/** Next free OF number for the year, skipping numbers already used or tombstoned. */
export async function prochainNumeroOF(annee = new Date().getFullYear()): Promise<string> {
  const [used, deleted] = await Promise.all([
    db.select({ n: commande.ofNumber }).from(commande),
    db.select({ n: ofSupprime.ofNumber }).from(ofSupprime),
  ]);
  const all = [...used.map((r) => r.n), ...deleted.map((r) => r.n)];
  return biz.numeroOF(biz.dernierSequenceOF(all, annee) + 1, annee);
}

/* ─────────── writes ─────────── */

export type CommandeInput = Omit<typeof commande.$inferInsert, "id" | "createdAt" | "updatedAt">;

export async function insertCommande(values: CommandeInput) {
  const [row] = await db.insert(commande).values(values).returning({ id: commande.id });
  return row.id;
}

export async function insertManyCommandes(values: CommandeInput[]) {
  if (!values.length) return [];
  return db.insert(commande).values(values).returning({ id: commande.id });
}

export const getCommande = async (id: number) => {
  const [row] = await db.select().from(commande).where(eq(commande.id, id));
  return row ?? null;
};

/** Update a commande and journal any price movement in the same transaction. */
export async function updateCommande(
  id: number,
  patch: Partial<CommandeInput>,
  auteur: { id?: string; name: string },
) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(commande).where(eq(commande.id, id));
    if (!before) throw new Error("Commande introuvable");

    await tx
      .update(commande)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(commande.id, id));

    const mouvements = (["prixVente", "prixFacon"] as const)
      .filter((champ) => champ in patch && (patch[champ] ?? null) !== (before[champ] ?? null))
      .map((champ) => ({
        commandeId: id,
        ofNumber: before.ofNumber,
        champ,
        ancien: before[champ],
        nouveau: patch[champ] ?? null,
        userId: auteur.id ?? null,
        userName: auteur.name,
      }));
    if (mouvements.length) await tx.insert(commandePrixJournal).values(mouvements);
  });
}

/** Delete commandes and tombstone their OF numbers so a re-import can't
 * resurrect them (PilotPro keeps the same list as `ds.deletedOfs`). */
export async function deleteCommandes(ids: number[], parUserId?: string) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    const rows = await tx
      .select({ n: commande.ofNumber })
      .from(commande)
      .where(inArray(commande.id, ids));
    await tx.delete(commande).where(inArray(commande.id, ids));
    if (rows.length) {
      await tx
        .insert(ofSupprime)
        .values(rows.map((r) => ({ ofNumber: r.n, parUserId: parUserId ?? null })))
        .onConflictDoNothing({ target: ofSupprime.ofNumber });
    }
  });
}

export async function setArchived(ids: number[], archived: boolean) {
  if (!ids.length) return;
  await db
    .update(commande)
    .set({ archived, updatedAt: new Date() })
    .where(inArray(commande.id, ids));
}

/** Commandes sharing a (client, modèle, référence) key — PilotPro's
 * detectDoublons, which catches the same order entered twice. */
export async function detecterDoublons() {
  const rows = await listCommandes({ includeArchived: true });
  const groups = new Map<string, CommandeRow[]>();
  for (const r of rows) {
    const k = biz.cleRapprochement(r.client, r.modele, r.refArticle);
    const group = groups.get(k);
    if (group) group.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/* ─────────── reference writes ─────────── */

export const insertClient = (v: typeof client.$inferInsert) => db.insert(client).values(v);
export const insertFaconnier = (v: typeof faconnier.$inferInsert) => db.insert(faconnier).values(v);
export const countClients = () => db.$count(client);
export const countCommandes = () => db.$count(commande);

export async function updateClient(id: number, patch: Partial<typeof client.$inferInsert>) {
  await db.update(client).set(patch).where(eq(client.id, id));
}
export async function updateFaconnier(id: number, patch: Partial<typeof faconnier.$inferInsert>) {
  await db.update(faconnier).set(patch).where(eq(faconnier.id, id));
}
export async function deleteClients(ids: number[]) {
  if (ids.length) await db.delete(client).where(inArray(client.id, ids));
}
export async function deleteFaconniers(ids: number[]) {
  if (ids.length) await db.delete(faconnier).where(inArray(faconnier.id, ids));
}

/* ─────────── price journal ─────────── */

export async function historiquePrix(commandeId: number) {
  return db
    .select()
    .from(commandePrixJournal)
    .where(eq(commandePrixJournal.commandeId, commandeId))
    .orderBy(commandePrixJournal.ts);
}
