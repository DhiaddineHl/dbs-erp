import "server-only";
import { eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, journee, modele } from "@/lib/db/schema";
import { paramsComplets } from "@/lib/domain/cout-usine";
import { type Devise, deviseOu } from "@/lib/domain/montants";
import { prixUsine } from "@/lib/domain/prix-usine";
import {
  rapportRentabilite,
  type JourProduction,
  type ProductionModele,
  type RapportRentabilite,
} from "@/lib/domain/rentabilite";
import {
  type CommandePrix,
  heuresJournee,
  lireParamsUsine,
  prixSourceModele,
  sommeSortie,
} from "@/lib/services/gpao";
import { listTauxChange } from "@/lib/services/taux-change";

/* Rentabilité de l'atelier — lecture. Agrège les journées GPAO d'une période
 * par modèle (heures saisies, pièces, arrêts, retouches) et par jour (CA,
 * pièces), récupère prix de vente et prix façon des commandes liées — chacun
 * converti dans la devise de l'usine au taux du jour de production — puis
 * délègue tout le calcul au domaine (lib/domain/rentabilite.ts). */

export { CLE_COUT_USINE, lireParamsUsine } from "@/lib/services/gpao";

export type RapportGpao = RapportRentabilite & {
  configure: boolean;
  /** Pièces dont le prix n'a pu être converti faute de taux (hors CA). */
  piecesSansTaux: number;
  devisesSansTaux: Devise[];
};

export async function rentabiliteGpao(from: string, to: string): Promise<RapportGpao> {
  const [params, journees, modeles, taux] = await Promise.all([
    lireParamsUsine(),
    db.select().from(journee).orderBy(journee.date),
    db.select().from(modele),
    listTauxChange(),
  ]);
  const devise = params.deviseUsine;
  const parModele = new Map(modeles.map((m) => [m.id, m]));

  const commandeIds = [...new Set(modeles.map((m) => m.commandeId).filter((x): x is number => x != null))];
  const cmdInfo = new Map<number, CommandePrix & { client: string; label: string }>();
  if (commandeIds.length) {
    const cmds = await db
      .select({
        id: commande.id,
        of: commande.ofNumber,
        modele: commande.modele,
        prixVente: commande.prixVente,
        prixFacon: commande.prixFacon,
        devise: commande.devise,
        clientNom: client.nom,
      })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .where(inArray(commande.id, commandeIds));
    for (const c of cmds) {
      cmdInfo.set(c.id, {
        prixVente: c.prixVente ?? null,
        prixFacon: c.prixFacon ?? null,
        devise: deviseOu(c.devise),
        client: c.clientNom ?? "",
        label: [c.of, c.modele].filter(Boolean).join(" · "),
      });
    }
  }

  // Bornes effectives : champs vides → première journée / aujourd'hui.
  const dansPeriode = journees.filter((j) => (!from || j.date >= from) && (!to || j.date <= to));
  const debut = from || dansPeriode[0]?.date || new Date().toISOString().slice(0, 10);
  const fin = to || new Date().toISOString().slice(0, 10);

  const prod = new Map<number, ProductionModele & { ca: number; piecesValorisees: number }>();
  const parJour = new Map<string, JourProduction>();
  let piecesSansTaux = 0;
  const devisesSansTaux = new Set<Devise>();

  for (const j of dansPeriode) {
    const m = parModele.get(j.modeleId);
    const info = m?.commandeId != null ? cmdInfo.get(m.commandeId) : undefined;
    // Chaque prix (commande ou manuel, façon) est converti au taux du jour produit.
    const origine = prixSourceModele(m, info);
    const { prix, sansTaux } = prixUsine(origine, devise, j.date, taux);
    const facon =
      info?.prixFacon != null && info.prixFacon > 0
        ? prixUsine({ montant: info.prixFacon, devise: info.devise }, devise, j.date, taux).prix
        : null;
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
        prixVente: null,
        prixFacon: null,
        commande: info?.label ?? "",
        arretsSec: 0,
        retouches: 0,
        ca: 0,
        piecesValorisees: 0,
      } satisfies ProductionModele & { ca: number; piecesValorisees: number });
    e.heures += heures;
    e.pieces += pieces;
    if (prix != null) {
      e.ca += pieces * prix;
      e.piecesValorisees += pieces;
      // Prix affiché : moyen sur la période (le taux varie d'un jour à l'autre).
      e.prixVente = e.piecesValorisees > 0 ? e.ca / e.piecesValorisees : prix;
    } else if (sansTaux && origine && pieces > 0) {
      // Sans taux, le modèle reste « sans prix » : signalé plutôt que sous-évalué.
      piecesSansTaux += pieces;
      devisesSansTaux.add(origine.devise);
    }
    // Prix façon au taux du dernier jour produit sur la période.
    if (facon != null) e.prixFacon = facon;
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
  return {
    ...rapport,
    configure: paramsComplets(params),
    piecesSansTaux,
    devisesSansTaux: [...devisesSansTaux],
  };
}

/** Point mort du mois en cours — pour la carte du Cockpit. */
export async function pointMortMoisCourant() {
  const auj = new Date().toISOString().slice(0, 10);
  const r = await rentabiliteGpao(`${auj.slice(0, 7)}-01`, auj);
  return {
    configure: r.configure,
    devise: r.params.deviseUsine,
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
