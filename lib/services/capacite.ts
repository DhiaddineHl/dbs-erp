import "server-only";
import { and, eq, gt, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, modele, ouvriere } from "@/lib/db/schema";
import { getSetting } from "@/lib/services/permissions";
import { bilanCapacite, type ChaineCapacite } from "@/lib/domain/capacite";
import { SEUILS_RENDEMENT } from "@/lib/domain/seuils";

/* Capacité DÉRIVÉE (§29) : remplace les KPI qui étaient codés en dur sur
 * l'écran Capacité. Tout vient des chaînes, des effectifs, du SAM et des
 * heures — les données déjà en base. Aucune valeur littérale. */

export type BilanCapaciteAtelier = {
  capaciteTheoriqueJour: number;
  capaciteAttendueJour: number;
  coutMoJour: number;
  chaines: number;
  /** Rendement de référence utilisé pour la capacité « attendue » (%). */
  rendementReference: number;
  /** SAM moyen des modèles actifs (sec/pièce), base du calcul. */
  samMoyen: number;
};

/** Effectif de chaque chaîne = nombre d'ouvrières rattachées. */
async function effectifsParChaine(): Promise<Map<number, { nom: string; effectif: number }>> {
  const rows = await db
    .select({
      id: chaine.id,
      nom: chaine.nom,
      effectif: sql<number>`count(${ouvriere.id})::int`,
    })
    .from(chaine)
    .leftJoin(ouvriere, eq(ouvriere.chaineId, chaine.id))
    .groupBy(chaine.id, chaine.nom);
  return new Map(rows.map((r) => [r.id, { nom: r.nom, effectif: Number(r.effectif) }]));
}

/** SAM moyen des modèles actifs, pour une base de capacité réaliste. */
async function samMoyenModeles(): Promise<number> {
  const [row] = await db
    .select({ moyenne: sql<number>`coalesce(avg(${modele.sam}), 0)::float8` })
    .from(modele)
    .where(and(eq(modele.archive, false), gt(modele.sam, 0)));
  return Math.round(Number(row?.moyenne ?? 0));
}

export async function bilanCapaciteAtelier(): Promise<BilanCapaciteAtelier> {
  const [effectifs, samMoyen, nbHeures, coutHoraire, rendementRef] = await Promise.all([
    effectifsParChaine(),
    samMoyenModeles(),
    getSetting<number>("gpao.heuresJour", 8),
    getSetting<number>("mo.coutHoraire", 0),
    getSetting<number>("capacite.rendementReference", SEUILS_RENDEMENT.alertePortail),
  ]);

  const chaines: ChaineCapacite[] = [...effectifs.values()].map((c) => ({
    nom: c.nom,
    effectif: c.effectif,
    nbHeures,
    samSec: samMoyen,
    coutHoraire,
  }));

  const bilan = bilanCapacite(chaines, rendementRef);
  return {
    ...bilan,
    rendementReference: rendementRef,
    samMoyen,
  };
}
