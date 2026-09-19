import "server-only";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  chaine,
  client,
  commande,
  commandeLancement,
  commandePlan,
  commandePlanMatiere,
  commandePlanVersion,
  commandeTds,
  faconnier,
  faconnierConfiage,
  journee,
  journeeArret,
  modele,
} from "@/lib/db/schema";

/* Écritures des données industrielles ajoutées au bloc 2 : arrêts, confiage
 * façonnier, archivage de version de plan, config figée au lancement. Toutes
 * additives — elles ne modifient aucune donnée existante. */

/* ─────────── arrêts / temps non productifs ─────────── */

export type ArretInput = {
  journeeId: number;
  poste?: string;
  debut?: string;
  fin?: string;
  dureeMin: number;
  cause?: string;
  commentaire?: string;
};

export async function ajouterArret(input: ArretInput) {
  const [row] = await db
    .insert(journeeArret)
    .values({
      journeeId: input.journeeId,
      poste: input.poste ?? "",
      debut: input.debut ?? "",
      fin: input.fin ?? "",
      dureeMin: Math.max(0, input.dureeMin || 0),
      cause: input.cause ?? "autre",
      commentaire: input.commentaire ?? "",
    })
    .returning({ id: journeeArret.id });
  return row.id;
}

export const arretsDeJournee = (journeeId: number) =>
  db.select().from(journeeArret).where(eq(journeeArret.journeeId, journeeId)).orderBy(journeeArret.id);

export async function supprimerArret(id: number) {
  await db.delete(journeeArret).where(eq(journeeArret.id, id));
}

export type ArretLigne = {
  id: number;
  poste: string;
  dureeMin: number;
  cause: string;
  commentaire: string;
};
export type JourneeAvecArrets = {
  id: number;
  date: string;
  chaine: string;
  modele: string;
  arrets: ArretLigne[];
  /** Total des minutes non productives de la journée. */
  totalMin: number;
};

/** Journées récentes avec leurs arrêts, pour l'écran de saisie. */
export async function journeesRecentesAvecArrets(limit = 40): Promise<JourneeAvecArrets[]> {
  const jours = await db
    .select({
      id: journee.id,
      date: journee.date,
      chaine: chaine.nom,
      modele: modele.nom,
    })
    .from(journee)
    .leftJoin(chaine, eq(journee.chaineId, chaine.id))
    .leftJoin(modele, eq(journee.modeleId, modele.id))
    .orderBy(desc(journee.date))
    .limit(limit);
  if (!jours.length) return [];

  const arrets = await db
    .select()
    .from(journeeArret)
    .where(inArray(journeeArret.journeeId, jours.map((j) => j.id)))
    .orderBy(journeeArret.id);

  const parJournee = new Map<number, ArretLigne[]>();
  for (const a of arrets) {
    const liste = parJournee.get(a.journeeId) ?? [];
    liste.push({ id: a.id, poste: a.poste, dureeMin: a.dureeMin, cause: a.cause, commentaire: a.commentaire });
    parJournee.set(a.journeeId, liste);
  }

  return jours.map((j) => {
    const liste = parJournee.get(j.id) ?? [];
    return {
      id: j.id,
      date: j.date,
      chaine: j.chaine ?? "—",
      modele: j.modele ?? "—",
      arrets: liste,
      totalMin: liste.reduce((s, a) => s + (a.dureeMin || 0), 0),
    };
  });
}

/* ─────────── confiage façonnier ─────────── */

export type ConfiageInput = {
  commandeId: number;
  faconnierId?: number | null;
  faconnier?: string;
  qteConfiee: number;
  qteExpediee?: number;
  dateConfiee?: string | null;
  dateRetourPrevue?: string | null;
  prixFacon?: number | null;
  note?: string;
};

export async function ajouterConfiage(input: ConfiageInput) {
  const [row] = await db
    .insert(faconnierConfiage)
    .values({
      commandeId: input.commandeId,
      faconnierId: input.faconnierId ?? null,
      faconnier: input.faconnier ?? "",
      qteConfiee: Math.max(0, Math.round(input.qteConfiee || 0)),
      qteExpediee: Math.max(0, Math.round(input.qteExpediee || 0)),
      dateConfiee: input.dateConfiee ?? null,
      dateRetourPrevue: input.dateRetourPrevue ?? null,
      prixFacon: input.prixFacon ?? null,
      note: input.note ?? "",
    })
    .returning({ id: faconnierConfiage.id });
  return row.id;
}

export const confiagesDeCommande = (commandeId: number) =>
  db.select().from(faconnierConfiage).where(eq(faconnierConfiage.commandeId, commandeId)).orderBy(faconnierConfiage.id);

export type CommandeConfiable = {
  id: number;
  of: string;
  modele: string;
  client: string;
  qte: number;
  prixFacon: number | null;
};

/** Commandes actives, pour le sélecteur de l'écran Confiage. */
export async function commandesConfiables(): Promise<CommandeConfiable[]> {
  const rows = await db
    .select({
      id: commande.id,
      of: commande.ofNumber,
      modele: commande.modele,
      client: client.nom,
      qte: commande.qte,
      prixFacon: commande.prixFacon,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(commande.archived, false))
    .orderBy(desc(commande.id));
  return rows.map((r) => ({ ...r, client: r.client ?? "", modele: r.modele ?? "" }));
}

export type FaconnierRef = { id: number; nom: string; prixFacon: number | null };

/** Référentiel façonnier minimal, pour le sélecteur. */
export async function faconniersRef(): Promise<FaconnierRef[]> {
  return db.select({ id: faconnier.id, nom: faconnier.nom, prixFacon: faconnier.prixFacon }).from(faconnier).orderBy(faconnier.nom);
}

export type ConfiageLigne = {
  id: number;
  commandeId: number;
  faconnierId: number | null;
  faconnier: string;
  qteConfiee: number;
  qteExpediee: number;
  dateConfiee: string | null;
  dateRetourPrevue: string | null;
  prixFacon: number | null;
};

/** Tous les confiages, pour l'écran (regroupés côté client par commande). */
export async function tousLesConfiages(): Promise<ConfiageLigne[]> {
  const rows = await db.select().from(faconnierConfiage).orderBy(desc(faconnierConfiage.id));
  return rows.map((r) => ({
    id: r.id,
    commandeId: r.commandeId,
    faconnierId: r.faconnierId,
    faconnier: r.faconnier,
    qteConfiee: r.qteConfiee,
    qteExpediee: r.qteExpediee,
    dateConfiee: r.dateConfiee,
    dateRetourPrevue: r.dateRetourPrevue,
    prixFacon: r.prixFacon,
  }));
}

/* ─────────── versions de plan de coupe ─────────── */

/** Archive l'état ACTUEL du plan d'une commande avant de le modifier, plutôt
 * que de l'écraser silencieusement (§10). Renvoie le n° de version archivé. */
export async function archiverVersionPlan(commandeId: number, par: string, motif = ""): Promise<number | null> {
  const [plan] = await db.select().from(commandePlan).where(eq(commandePlan.commandeId, commandeId)).limit(1);
  if (!plan) return null;
  const matieres = await db
    .select()
    .from(commandePlanMatiere)
    .where(eq(commandePlanMatiere.commandeId, commandeId));

  const [dernier] = await db
    .select({ version: commandePlanVersion.version })
    .from(commandePlanVersion)
    .where(eq(commandePlanVersion.commandeId, commandeId))
    .orderBy(desc(commandePlanVersion.version))
    .limit(1);
  const version = (dernier?.version ?? 0) + 1;

  await db.insert(commandePlanVersion).values({
    commandeId,
    version,
    snapshot: { plan, matieres } as Record<string, unknown>,
    par,
    motif,
  });
  return version;
}

export const versionsDePlan = (commandeId: number) =>
  db
    .select()
    .from(commandePlanVersion)
    .where(eq(commandePlanVersion.commandeId, commandeId))
    .orderBy(desc(commandePlanVersion.version));

/* ─────────── config technique figée au lancement ─────────── */

export type ConfigLancement = {
  versionPatronage?: number | null;
  versionTds?: number | null;
  versionPlan?: number | null;
  consoFige?: number | null;
  samFige?: number | null;
  configSnapshot?: Record<string, unknown> | null;
};

/** Fige la configuration technique au moment du OK production, sur le
 * lancement existant de la commande (§11). N'écrase pas le lancement, complète
 * ses colonnes de version. */
export async function figerConfigLancement(commandeId: number, config: ConfigLancement) {
  await db
    .update(commandeLancement)
    .set({
      versionPatronage: config.versionPatronage ?? null,
      versionTds: config.versionTds ?? null,
      versionPlan: config.versionPlan ?? null,
      consoFige: config.consoFige ?? null,
      samFige: config.samFige ?? null,
      configSnapshot: config.configSnapshot ?? null,
    })
    .where(eq(commandeLancement.commandeId, commandeId));
}

/**
 * Fige AUTOMATIQUEMENT la config technique d'un lancement à partir de l'état
 * courant de la commande : conso théorique, SAM du modèle, dernière TDS validée
 * et dernière version de plan archivée. Best-effort — ne fait jamais échouer le
 * lancement. À appeler juste après la création du lancement.
 */
export async function figerConfigDepuisEtat(commandeId: number): Promise<void> {
  try {
    const [c] = await db
      .select({ modele: commande.modele, consoTheo: commande.consoTheo })
      .from(commande)
      .where(eq(commande.id, commandeId))
      .limit(1);
    if (!c) return;

    const [m] = await db.select({ sam: modele.sam }).from(modele).where(eq(modele.nom, c.modele)).limit(1);
    const [tds] = await db
      .select({ n: commandeTds.n })
      .from(commandeTds)
      .where(and(eq(commandeTds.commandeId, commandeId), eq(commandeTds.verdict, "ok")))
      .orderBy(desc(commandeTds.n))
      .limit(1);

    /* Archive la version du plan UTILISÉE pour ce lancement (§10) : un
     * instantané, une fois, au lancement — pas à chaque sauvegarde du plan. */
    const versionPlan = await archiverVersionPlan(commandeId, "système", "Figé au lancement");

    await figerConfigLancement(commandeId, {
      versionTds: tds?.n ?? null,
      versionPlan: versionPlan,
      consoFige: c.consoTheo ?? null,
      samFige: m?.sam ?? null,
      configSnapshot: { modele: c.modele, figeLe: new Date().toISOString() },
    });
  } catch {
    /* best-effort : une config non figée ne doit pas bloquer un lancement */
  }
}
