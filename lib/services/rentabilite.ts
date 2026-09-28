import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, journee, modele } from "@/lib/db/schema";
import { normaliserParams, paramsComplets, type ParamsUsine } from "@/lib/domain/cout-usine";
import {
  rapportRentabilite,
  type JourProduction,
  type ProductionModele,
  type RapportRentabilite,
} from "@/lib/domain/rentabilite";
import { heuresJournee, sommeSortie } from "@/lib/services/gpao";
import { getSetting } from "@/lib/services/permissions";

/* Rentabilité de l'atelier — lecture. Agrège les journées GPAO d'une période
 * par modèle (heures saisies, pièces, arrêts, retouches) et par jour (CA,
 * pièces), récupère prix de vente et prix façon des commandes liées, puis
 * délègue tout le calcul au domaine (lib/domain/rentabilite.ts). */

export const CLE_COUT_USINE = "gpao.coutUsine";

export async function lireParamsUsine(): Promise<ParamsUsine> {
  return normaliserParams(await getSetting<unknown>(CLE_COUT_USINE, null));
}

export async function rentabiliteGpao(from: string, to: string): Promise<RapportRentabilite & { configure: boolean }> {
  const [params, journees, modeles] = await Promise.all([
    lireParamsUsine(),
    db.select().from(journee).orderBy(journee.date),
    db.select().from(modele),
  ]);
  const parModele = new Map(modeles.map((m) => [m.id, m]));

  const commandeIds = [...new Set(modeles.map((m) => m.commandeId).filter((x): x is number => x != null))];
  const cmdInfo = new Map<number, { prixVente: number | null; prixFacon: number | null; client: string; label: string }>();
  if (commandeIds.length) {
    const cmds = await db
      .select({
        id: commande.id,
        of: commande.ofNumber,
        modele: commande.modele,
        prixVente: commande.prixVente,
        prixFacon: commande.prixFacon,
        clientNom: client.nom,
      })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .where(inArray(commande.id, commandeIds));
    for (const c of cmds) {
      cmdInfo.set(c.id, {
        prixVente: c.prixVente ?? null,
        prixFacon: c.prixFacon ?? null,
        client: c.clientNom ?? "",
        label: [c.of, c.modele].filter(Boolean).join(" · "),
      });
    }
  }

  // Bornes effectives : champs vides → première journée / aujourd'hui.
  const dansPeriode = journees.filter((j) => (!from || j.date >= from) && (!to || j.date <= to));
  const debut = from || dansPeriode[0]?.date || new Date().toISOString().slice(0, 10);
  const fin = to || new Date().toISOString().slice(0, 10);

  const prod = new Map<number, ProductionModele>();
  const parJour = new Map<string, JourProduction>();

  for (const j of dansPeriode) {
    const m = parModele.get(j.modeleId);
    const info = m?.commandeId != null ? cmdInfo.get(m.commandeId) : undefined;
    const prix = info?.prixVente ?? m?.prixManuel ?? null;
    const pieces = sommeSortie(j.sortie);
    const heures = heuresJournee(j);
    let arretsSec = 0;
    for (const liste of Object.values(j.arrets ?? {})) for (const a of liste ?? []) arretsSec += Number(a?.secondes) || 0;
    let retouches = 0;
    for (const v of Object.values(j.ret ?? {})) retouches += Number(v) || 0;

    const e =
      prod.get(j.modeleId) ??
      ({
        modeleId: j.modeleId,
        nom: m?.nom ?? "—",
        ref: m?.ref ?? "",
        client: info?.client || m?.client || "",
        samSec: m?.sam ?? 0,
        heures: 0,
        pieces: 0,
        prixVente: prix,
        prixFacon: info?.prixFacon != null && info.prixFacon > 0 ? info.prixFacon : null,
        commande: info?.label ?? "",
        arretsSec: 0,
        retouches: 0,
      } satisfies ProductionModele);
    e.heures += heures;
    e.pieces += pieces;
    e.arretsSec += arretsSec;
    e.retouches += retouches;
    prod.set(j.modeleId, e);

    if (pieces > 0 || heures > 0) {
      const d = parJour.get(j.date) ?? { date: j.date, ca: 0, pieces: 0 };
      d.pieces += pieces;
      d.ca += prix != null ? pieces * prix : 0;
      parJour.set(j.date, d);
    }
  }

  const rapport = rapportRentabilite({
    from: debut,
    to: fin,
    params,
    modeles: [...prod.values()],
    jours: [...parJour.values()],
  });
  return { ...rapport, configure: paramsComplets(params) };
}

/** Point mort du mois en cours — pour la carte du Cockpit. */
export async function pointMortMoisCourant() {
  const auj = new Date().toISOString().slice(0, 10);
  const r = await rentabiliteGpao(`${auj.slice(0, 7)}-01`, auj);
  return {
    configure: r.configure,
    ca: r.bilan.ca,
    charges: r.bilan.chargesPeriode,
    marge: r.bilan.marge,
    couverture: r.bilan.chargesPeriode > 0 ? r.bilan.ca / r.bilan.chargesPeriode : null,
    caJour: r.pointMort.caJour,
    joursAtteints: r.pointMort.joursAtteints,
    joursProduits: r.pointMort.jours.length,
    rendement: r.rendementGlobal,
    modelesPerdants: r.modeles.filter((m) => m.verdict === "perd").length,
  };
}
