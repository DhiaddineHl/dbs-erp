/* Rentabilité de l'atelier — calculs purs (aucune base, aucun écran).
 *
 * Tout part du coût de l'heure usine (voir ./cout-usine.ts) : les ouvrières
 * directes paient l'usine entière. Ce module répond à six questions :
 *
 *   1. Quels modèles gagnent ou perdent de l'argent ?      → analyserModeles
 *   2. À quel prix minimum accepter un modèle ?           → prixPlancher
 *   3. Où part l'argent (heures non saisies, rendement,    → pertesPeriode
 *      arrêts, retouches) ?
 *   4. Combien faut-il produire par jour pour couvrir      → pointMort
 *      les charges ?
 *   5. Vaut-il mieux produire en interne ou sous-traiter ? → comparerSousTraitance
 *   6. Tout ça en une page pour la direction              → (écran + impression)
 *
 * Conventions :
 *   - SAM en SECONDES par pièce (comme dans la GPAO : 1800 = 30 min).
 *   - Rendement et marges en fraction (0,8 = 80 %) dans les calculs ; les
 *     paramètres saisis en % sont convertis à l'entrée.
 *   - La marge cible est une marge sur PRIX DE VENTE : prix = coût ÷ (1 − marge).
 *   - Les charges de la période sont réparties entre modèles au prorata des
 *     heures saisies : la somme des coûts des modèles = charges de la période,
 *     donc la somme des marges des modèles = marge de la période. */

import type { ParamsUsine } from "./cout-usine";
import { bilanCoutUsine, coutHoraireStandard } from "./cout-usine";

/* ─────────── 2. prix plancher ─────────── */

export type PrixPlancher = {
  /** Minutes standard d'une pièce (SAM ÷ 60). */
  minutesSam: number;
  /** Minutes réellement payées par pièce au rendement retenu. */
  minutesPayees: number;
  /** Coût de revient main d'œuvre + usine d'une pièce. */
  cout: number;
  /** Prix minimum pour tenir la marge cible. */
  prix: number;
};

/** Coût et prix minimum d'une pièce : SAM × coût minute ÷ rendement, puis marge. */
export function prixPlancher(input: {
  samSec: number;
  coutHoraire: number;
  /** Rendement retenu (fraction). */
  rendement: number;
  /** Marge visée sur prix de vente (fraction). */
  marge: number;
}): PrixPlancher | null {
  const { samSec, coutHoraire, rendement } = input;
  if (!(samSec > 0) || !(coutHoraire > 0) || !(rendement > 0)) return null;
  const marge = Math.min(Math.max(input.marge, 0), 0.9);
  const minutesSam = samSec / 60;
  const minutesPayees = minutesSam / rendement;
  const cout = (minutesPayees / 60) * coutHoraire;
  return { minutesSam, minutesPayees, cout, prix: cout / (1 - marge) };
}

/* ─────────── 1. marge par modèle ─────────── */

/** Ce que la GPAO sait d'un modèle sur la période (agrégé par le service). */
export type ProductionModele = {
  modeleId: number;
  nom: string;
  ref: string;
  client: string;
  samSec: number;
  /** Heures saisies (une case horaire = 1 h ouvrière). */
  heures: number;
  pieces: number;
  /** Prix de vente retenu (commande liée, sinon prix manuel), null si inconnu. */
  prixVente: number | null;
  /** Prix façon connu pour ce modèle (commande liée), null si aucun. */
  prixFacon: number | null;
  /** Libellé de la commande liée (OF · modèle), "" si non reliée. */
  commande: string;
  arretsSec: number;
  retouches: number;
};

export type VerdictModele = "gagne" | "juste" | "perd" | "sans-prix";

export type AnalyseModele = ProductionModele & {
  ca: number;
  /** Part des charges de la période imputée au modèle (heures × coût réel). */
  cout: number;
  marge: number;
  tauxMarge: number | null;
  coutPiece: number | null;
  /** Minutes payées réellement par pièce (heures × 60 ÷ pièces). */
  minutesReellesPiece: number | null;
  /** Rendement réel = heures standard produites ÷ heures saisies. */
  rendement: number | null;
  plancher: PrixPlancher | null;
  verdict: VerdictModele;
  /** Interne vs façon : coût interne/pièce − prix façon (négatif = interne moins cher). */
  ecartFacon: number | null;
};

export function analyserModeles(
  modeles: ProductionModele[],
  opts: { coutHoraireReel: number | null; coutHoraireStandard: number | null; rendementCible: number; margeCible: number },
): AnalyseModele[] {
  const tauxH = opts.coutHoraireReel ?? 0;
  return modeles
    .map((m) => {
      const ca = m.prixVente != null ? m.pieces * m.prixVente : 0;
      const cout = m.heures * tauxH;
      const marge = ca - cout;
      const coutPiece = m.pieces > 0 && cout > 0 ? cout / m.pieces : null;
      const rendement = m.heures > 0 && m.samSec > 0 ? (m.pieces * m.samSec) / 3600 / m.heures : null;
      const plancher =
        opts.coutHoraireStandard != null
          ? prixPlancher({
              samSec: m.samSec,
              coutHoraire: opts.coutHoraireStandard,
              rendement: opts.rendementCible,
              marge: opts.margeCible,
            })
          : null;
      let verdict: VerdictModele;
      if (m.prixVente == null) verdict = "sans-prix";
      else if (marge < 0) verdict = "perd";
      else if (ca > 0 && marge / ca < opts.margeCible) verdict = "juste";
      else verdict = "gagne";
      return {
        ...m,
        ca,
        cout,
        marge,
        tauxMarge: ca > 0 ? marge / ca : null,
        coutPiece,
        minutesReellesPiece: m.pieces > 0 ? (m.heures * 60) / m.pieces : null,
        rendement,
        plancher,
        verdict,
        ecartFacon: coutPiece != null && m.prixFacon != null && m.prixFacon > 0 ? coutPiece - m.prixFacon : null,
      };
    })
    // Perdants d'abord ; les modèles sans prix (marge inconnue) en fin de liste.
    .sort(
      (a, b) =>
        Number(a.verdict === "sans-prix") - Number(b.verdict === "sans-prix") ||
        a.marge - b.marge ||
        a.nom.localeCompare(b.nom, "fr"),
    );
}

/* ─────────── 3. où part l'argent ─────────── */

export type Pertes = {
  /** Heures payées non retrouvées dans la GPAO (absences, arrêts non saisis, oublis). */
  heuresNonSaisies: number;
  eurosNonSaisies: number;
  /** Heures standard manquantes pour atteindre le rendement cible. */
  heuresSousRendement: number;
  eurosSousRendement: number;
  /** Partie du sous-rendement expliquée par les arrêts déclarés. */
  heuresArrets: number;
  eurosArrets: number;
  /** Sous-rendement non expliqué par un arrêt déclaré (organisation, équilibrage, formation…). */
  eurosAutresCauses: number;
  retouches: number;
  /** Chiffré seulement si des minutes par retouche sont réglées ; null sinon. */
  eurosRetouches: number | null;
  /** Total des pertes chiffrées (retouches exclues : déjà dans le rendement). */
  total: number;
};

export function pertesPeriode(input: {
  heuresTheoriques: number;
  heuresSaisies: number;
  /** Heures standard produites = Σ pièces × SAM ÷ 3600. */
  heuresStandard: number;
  arretsSec: number;
  retouches: number;
  coutHoraire: number;
  rendementCible: number;
  minutesRetouche: number;
}): Pertes {
  const h = input.coutHoraire;
  const heuresNonSaisies = Math.max(0, input.heuresTheoriques - input.heuresSaisies);
  const heuresSousRendement = Math.max(0, input.heuresSaisies * input.rendementCible - input.heuresStandard);
  // Un arrêt ne peut pas expliquer plus que l'écart total de rendement.
  const heuresArrets = Math.min(input.arretsSec / 3600, heuresSousRendement);
  const eurosNonSaisies = heuresNonSaisies * h;
  const eurosSousRendement = heuresSousRendement * h;
  const eurosArrets = heuresArrets * h;
  return {
    heuresNonSaisies,
    eurosNonSaisies,
    heuresSousRendement,
    eurosSousRendement,
    heuresArrets,
    eurosArrets,
    eurosAutresCauses: eurosSousRendement - eurosArrets,
    retouches: input.retouches,
    eurosRetouches: input.minutesRetouche > 0 ? (input.retouches * input.minutesRetouche * h) / 60 : null,
    total: eurosNonSaisies + eurosSousRendement,
  };
}

/** Valeur d'un point de rendement sur la période (heures saisies × 1 % × coût horaire). */
export const valeurPointRendement = (heuresSaisies: number, coutHoraire: number) => heuresSaisies * 0.01 * coutHoraire;

/* ─────────── 4. point mort ─────────── */

export type JourPointMort = { date: string; ca: number; pieces: number; atteint: boolean; ecart: number; cumulCa: number; cumulCharges: number };

export type PointMort = {
  /** CA à produire par jour de production pour couvrir les charges de la période. */
  caJour: number;
  /** Pièces par jour au prix de vente moyen de la période (null sans CA). */
  piecesJour: number | null;
  joursAtteints: number;
  jours: JourPointMort[];
};

export function pointMort(jours: { date: string; ca: number; pieces: number }[], chargesPeriode: number): PointMort {
  const n = jours.length;
  const caJour = n > 0 ? chargesPeriode / n : 0;
  const caTotal = jours.reduce((s, j) => s + j.ca, 0);
  const piecesTotal = jours.reduce((s, j) => s + j.pieces, 0);
  const prixMoyen = piecesTotal > 0 && caTotal > 0 ? caTotal / piecesTotal : null;
  let cumulCa = 0;
  let cumulCharges = 0;
  const lignes = [...jours]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((j) => {
      cumulCa += j.ca;
      cumulCharges += caJour;
      return { ...j, atteint: j.ca >= caJour - 0.005, ecart: j.ca - caJour, cumulCa, cumulCharges };
    });
  return {
    caJour,
    piecesJour: prixMoyen ? caJour / prixMoyen : null,
    joursAtteints: lignes.filter((l) => l.atteint).length,
    jours: lignes,
  };
}

/* ─────────── 5. interne ou sous-traitance ─────────── */

export type ComparaisonST = {
  coutInternePiece: number;
  totalInterne: number;
  totalSousTraitance: number;
  /** totalInterne − totalSousTraitance : négatif = l'interne coûte moins cher. */
  ecart: number;
  heuresNecessaires: number;
  /** Jours de l'usine entière (effectif direct × heures/jour) mobilisés. */
  joursUsine: number;
  choix: "interne" | "sous-traitance" | "equivalent";
};

export function comparerSousTraitance(input: {
  samSec: number;
  qte: number;
  prixFacon: number;
  coutHoraire: number;
  rendement: number;
  effectifDirect: number;
  heuresJour: number;
}): ComparaisonST | null {
  const { samSec, qte, prixFacon, coutHoraire, rendement } = input;
  if (!(samSec > 0) || !(qte > 0) || !(prixFacon > 0) || !(coutHoraire > 0) || !(rendement > 0)) return null;
  const heuresNecessaires = (qte * samSec) / 3600 / rendement;
  const totalInterne = heuresNecessaires * coutHoraire;
  const totalSousTraitance = qte * prixFacon;
  const ecart = totalInterne - totalSousTraitance;
  const capaciteJour = input.effectifDirect * input.heuresJour;
  const seuil = 0.02 * totalSousTraitance;
  return {
    coutInternePiece: totalInterne / qte,
    totalInterne,
    totalSousTraitance,
    ecart,
    heuresNecessaires,
    joursUsine: capaciteJour > 0 ? heuresNecessaires / capaciteJour : 0,
    choix: Math.abs(ecart) <= seuil ? "equivalent" : ecart < 0 ? "interne" : "sous-traitance",
  };
}

/* ─────────── assemblage : le rapport complet d'une période ─────────── */

export type JourProduction = { date: string; ca: number; pieces: number };

export type RapportRentabilite = {
  from: string;
  to: string;
  params: ParamsUsine;
  bilan: ReturnType<typeof bilanCoutUsine>;
  heuresStandard: number;
  rendementGlobal: number | null;
  valeurPointRendement: number;
  modeles: AnalyseModele[];
  pertes: Pertes;
  pointMort: PointMort;
};

export function rapportRentabilite(input: {
  from: string;
  to: string;
  params: ParamsUsine;
  modeles: ProductionModele[];
  jours: JourProduction[];
}): RapportRentabilite {
  const p = input.params;
  const heuresSaisies = input.modeles.reduce((s, m) => s + m.heures, 0);
  const pieces = input.modeles.reduce((s, m) => s + m.pieces, 0);
  const ca = input.modeles.reduce((s, m) => s + (m.prixVente != null ? m.pieces * m.prixVente : 0), 0);
  const heuresStandard = input.modeles.reduce((s, m) => s + (m.pieces * m.samSec) / 3600, 0);
  // Charges au prorata des jours réellement travaillés (au moins une saisie).
  const bilan = bilanCoutUsine(p, { from: input.from, to: input.to, heuresSaisies, ca, pieces, joursTravailles: input.jours.length });
  const standard = coutHoraireStandard(p);
  const rendementCible = p.rendementCible / 100;
  const modeles = analyserModeles(input.modeles, {
    coutHoraireReel: bilan.coutHoraireReel,
    coutHoraireStandard: standard,
    rendementCible,
    margeCible: p.margeCible / 100,
  });
  const pertes = pertesPeriode({
    heuresTheoriques: bilan.heuresTheoriques,
    heuresSaisies,
    heuresStandard,
    arretsSec: input.modeles.reduce((s, m) => s + m.arretsSec, 0),
    retouches: input.modeles.reduce((s, m) => s + m.retouches, 0),
    coutHoraire: standard ?? 0,
    rendementCible,
    minutesRetouche: p.minutesRetouche,
  });
  return {
    from: input.from,
    to: input.to,
    params: p,
    bilan,
    heuresStandard,
    rendementGlobal: heuresSaisies > 0 ? heuresStandard / heuresSaisies : null,
    valeurPointRendement: valeurPointRendement(heuresSaisies, standard ?? 0),
    modeles,
    pertes,
    pointMort: pointMort(input.jours, bilan.chargesPeriode),
  };
}
