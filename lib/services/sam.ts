import "server-only";
import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, journee, journeeArret, modele, referenceIndustrielle, samSerie } from "@/lib/db/schema";
import {
  proposerSamDbs,
  samConstateSerie,
  type JourneeSam,
  type SerieHistorique,
} from "@/lib/domain/sam";

/* Service de la MÉMOIRE DU SAM.
 *
 * S'appuie sur le lien OF↔journée (`journee.commandeId`) : quand une journée est
 * rattachée à un OF, on peut calculer le SAM CONSTATÉ de cet OF, temps non
 * productifs déduits. La valeur est ensuite archivée par série, et sert de base
 * à la PROPOSITION de SAM DBS — jamais à un écrasement du SAM théorique. */

/** Total des pièces sorties d'une journée (somme des colonnes horaires). */
function totalSortie(sortie: Record<string, number> | null | undefined): number {
  if (!sortie) return 0;
  return Object.values(sortie).reduce((s, v) => s + (Number(v) || 0), 0);
}

/** Journées d'un OF, mises en forme pour le calcul du SAM constaté (avec les
 * minutes d'arrêt de chaque journée déduites). */
export async function journeesSamPourCommande(commandeId: number): Promise<JourneeSam[]> {
  const jours = await db
    .select({
      id: journee.id,
      sortie: journee.sortie,
      effectif: journee.effectif,
      nbHeures: journee.nbHeures,
    })
    .from(journee)
    .where(eq(journee.commandeId, commandeId));
  if (!jours.length) return [];

  const arretRows = await db
    .select({
      journeeId: journeeArret.journeeId,
      minutes: sql<number>`coalesce(sum(${journeeArret.dureeMin}), 0)::float8`,
    })
    .from(journeeArret)
    .where(inArray(journeeArret.journeeId, jours.map((j) => j.id)))
    .groupBy(journeeArret.journeeId);
  const arretParJour = new Map(arretRows.map((a) => [a.journeeId, Number(a.minutes)]));

  return jours.map((j) => ({
    pieces: totalSortie(j.sortie),
    effectif: j.effectif,
    nbHeures: j.nbHeures,
    minutesArret: arretParJour.get(j.id) ?? 0,
  }));
}

/** SAM constaté d'un OF (sec/pièce), temps non productifs déduits. */
export async function samConstatePourCommande(commandeId: number): Promise<{ samConstate: number | null; pieces: number }> {
  const jours = await journeesSamPourCommande(commandeId);
  const pieces = jours.reduce((s, j) => s + (j.pieces || 0), 0);
  return { samConstate: samConstateSerie(jours), pieces };
}

/**
 * Archive la série produite d'un OF dans l'historique de sa référence : SAM
 * théorique en vigueur, SAM constaté figé, pièces. À appeler à la clôture d'un
 * OF (ou depuis une action admin). N'écrase jamais le SAM théorique.
 */
export async function archiverSerie(commandeId: number, libelle = ""): Promise<number | null> {
  const [c] = await db
    .select({ referenceId: commande.referenceId, modele: commande.modele, of: commande.ofNumber })
    .from(commande)
    .where(eq(commande.id, commandeId))
    .limit(1);
  if (!c?.referenceId) return null;

  const { samConstate, pieces } = await samConstatePourCommande(commandeId);
  if (pieces <= 0) return null;

  const [m] = await db.select({ sam: modele.sam }).from(modele).where(eq(modele.nom, c.modele)).limit(1);

  const [row] = await db
    .insert(samSerie)
    .values({
      referenceId: c.referenceId,
      commandeId,
      libelle: libelle || c.of,
      samTheorique: m?.sam ?? null,
      samConstate: samConstate != null ? Math.round(samConstate) : null,
      pieces,
      source: "auto",
      date: new Date().toISOString().slice(0, 10),
    })
    .returning({ id: samSerie.id });
  return row?.id ?? null;
}

/** Historique SAM d'une référence, tel que la proposition le lit. */
export async function historiqueSam(referenceId: number): Promise<SerieHistorique[]> {
  const rows = await db
    .select()
    .from(samSerie)
    .where(eq(samSerie.referenceId, referenceId))
    .orderBy(samSerie.date);
  return rows.map((r) => ({
    ref: r.libelle,
    samConstate: r.samConstate,
    pieces: r.pieces,
    rendementMoyen: r.rendementMoyen,
    date: r.date ?? undefined,
  }));
}

/** Proposition de SAM DBS pour une référence, à partir de son historique.
 * Ne modifie rien — la décision reste humaine. */
export async function propositionSamDbs(referenceId: number) {
  const histo = await historiqueSam(referenceId);
  return proposerSamDbs(histo);
}

/** Valide (à la main) le SAM DBS retenu d'une référence. C'est la SEULE écriture
 * qui fixe cette valeur ; elle n'affecte ni le SAM théorique du modèle ni les
 * séries historiques. */
export async function validerSamDbs(referenceId: number, sam: number, par: string): Promise<void> {
  await db
    .update(referenceIndustrielle)
    .set({ samDbs: Math.max(0, Math.round(sam)), samDbsPar: par, samDbsDate: new Date().toISOString().slice(0, 10) })
    .where(eq(referenceIndustrielle.id, referenceId));
}
