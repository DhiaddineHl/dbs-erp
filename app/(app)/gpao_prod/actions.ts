"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as g from "@/lib/services/gpao";
import * as at from "@/lib/services/atelier";
import { cleNom } from "@/lib/domain/atelier";
import { setSetting } from "@/lib/services/permissions";
import * as rent from "@/lib/services/rentabilite";
import * as ident from "@/lib/services/identite-ouvrieres";
import { completerFiches } from "@/lib/services/identite-ouvrieres";
import { normaliserParams, type ParamsUsine } from "@/lib/domain/cout-usine";
import type { journee as journeeTable } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";

/* Shared DB persistence for GPAO Production. Each mutation writes to Postgres
 * so journées/chaînes/modèles are visible to every user (no more localStorage).
 * Reads happen in the page server component; these only mutate + revalidate. */

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const PATH = "/gpao_prod";

/** Une saisie GPAO peut désormais créer une opération ou une fiche personnel :
 * les écrans du référentiel doivent se rafraîchir avec elle. */
function revalider() {
  for (const p of [PATH, "/operations", "/personnel"]) revalidatePath(p);
}

type JourneeInsert = typeof journeeTable.$inferInsert;

export async function createDay(input: {
  date: string;
  chaineId: number;
  modeleId: number;
  effectif: number;
  nbHeures: number;
}) {
  try {
    await assertUser();
    const row = await g.creerJournee(input);
    revalidatePath(PATH);
    return { ok: true as const, row };
  } catch (e) {
    return fail(e);
  }
}

/** Duplicate a day's header (chaîne/modèle/effectif/heures) with blank entry.
 * L'effectif recopié est celui de la journée d'origine — renforts du jour
 * compris — et non celui de la chaîne, qui a pu bouger depuis. */
export async function duplicateDay(input: {
  date: string;
  chaineId: number;
  modeleId: number;
  effectif: number;
  nbHeures: number;
  cols: string[];
  ouvrieres: JourneeOuvriere[];
  objManuel?: number | null;
}) {
  try {
    await assertUser();
    const row = await g.insertJournee({
      date: input.date,
      chaineId: input.chaineId,
      modeleId: input.modeleId,
      effectif: input.effectif,
      nbHeures: input.nbHeures,
      cols: input.cols,
      // L'équipe recopiée reçoit les fiches connues AUJOURD'HUI : une journée
      // dupliquée ne doit pas propager une ligne restée « sans fiche ».
      ouvrieres: await completerFiches(input.ouvrieres),
      objManuel: input.objManuel ?? null,
      sortie: {},
      ops: {},
      ret: {},
      opsSam: {},
      opsPoste: {},
      opsDetail: {},
      cloture: false,
    });
    revalidatePath(PATH);
    return { ok: true as const, row };
  } catch (e) {
    return fail(e);
  }
}

export async function updateDay(id: number, patch: Record<string, unknown>) {
  try {
    await assertUser();
    await g.updateJournee(id, patch as Partial<JourneeInsert>);
    // Si la production a bougé, remonter l'avancement de la commande liée.
    if ("sortie" in patch) await g.synchroniserAvancementJournee(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteDay(id: number) {
  try {
    await assertUser();
    await g.deleteJournee(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveChaine(input: { id?: number; nom: string; chef: string; effectif?: number }) {
  try {
    await assertUser();
    const effectif = Math.max(0, Math.trunc(input.effectif ?? 0));
    if (input.id) {
      await g.updateChaine(input.id, { nom: input.nom, chef: input.chef, effectif });
      revalidatePath(PATH);
      return { ok: true as const, id: input.id };
    }
    const row = await g.insertChaine({ nom: input.nom, chef: input.chef, effectif });
    revalidatePath(PATH);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteChaine(id: number) {
  try {
    await assertUser();
    await g.deleteChaine(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveOuvriere(input: {
  id?: number;
  chaineId: number;
  nom: string;
  poste: string;
  sam: number;
}) {
  try {
    await assertUser();
    /* Toute saisie alimente le référentiel : le poste entre au catalogue, la
     * personne entre au registre. C'est ce qui empêche les variantes
     * orthographiques de proliférer sans que rien ne les rattrape. */
    const [, personne] = await Promise.all([
      at.assurerOperations([{ nom: input.poste, sam: input.sam }], "saisie"),
      at.assurerPersonne(input.nom, input.poste),
    ]);

    if (input.id) {
      /* Renommer une ligne, c'est souvent la donner à une autre ouvrière : sa
       * fiche doit suivre le NOUVEAU nom (les journées passées gardent la leur). */
      const patch: Parameters<typeof g.updateOuvriere>[1] = { nom: input.nom, poste: input.poste, sam: input.sam };
      const actuelle = await g.getOuvriere(input.id);
      if (!actuelle || actuelle.personnelId == null || cleNom(actuelle.nom) !== cleNom(input.nom)) {
        patch.personnelId = personne.personnelId;
      }
      await g.updateOuvriere(input.id, patch);
      revalider();
      return { ok: true as const, id: input.id, personne };
    }
    const row = await g.insertOuvriere({
      chaineId: input.chaineId,
      nom: input.nom,
      poste: input.poste,
      sam: input.sam,
      personnelId: personne.personnelId,
    });
    revalider();
    return { ok: true as const, id: row.id, personne };
  } catch (e) {
    return fail(e);
  }
}

/** Enregistre l'effectif figé d'une journée après ajout ou modification d'une
 * ligne, en complétant au passage le catalogue et le registre.
 *
 * `cibleId` désigne la ligne qui vient de changer : elle seule déclenche les
 * créations. Rejouer tout l'effectif à chaque frappe créerait des fiches pour
 * des noms que personne n'a touchés. */
export async function enregistrerEffectifJour(
  journeeId: number,
  roster: JourneeOuvriere[],
  cibleId: number,
) {
  try {
    await assertUser();
    const cible = roster.find((o) => o.id === cibleId);
    let personne: at.ResolutionPersonne = { personnelId: null, creee: false, matricule: "" };

    if (cible) {
      const [, p] = await Promise.all([
        at.assurerOperations([{ nom: cible.poste, sam: cible.sam }], "saisie"),
        cible.personnelId != null
          ? Promise.resolve({ personnelId: cible.personnelId, creee: false, matricule: "" })
          : at.assurerPersonne(cible.nom, cible.poste),
      ]);
      personne = p;
    }

    const suivant = roster.map((o) =>
      o.id === cibleId && personne.personnelId != null ? { ...o, personnelId: personne.personnelId } : o,
    );
    await g.updateJournee(journeeId, { ouvrieres: suivant });
    revalider();
    return { ok: true as const, roster: suivant, personne };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteOuvriere(id: number) {
  try {
    await assertUser();
    await g.deleteOuvriere(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function saveModele(input: {
  id?: number;
  nom: string;
  ref: string;
  client: string;
  sam: number;
  qte: number;
  estimEff: number;
  commandeId?: number | null;
}) {
  try {
    await assertUser();
    const champs = {
      nom: input.nom,
      ref: input.ref,
      client: input.client,
      sam: input.sam,
      qte: input.qte,
      estimEff: input.estimEff,
      commandeId: input.commandeId ?? null,
    };
    if (input.id) {
      await g.updateModele(input.id, champs);
      await g.synchroniserAvancementModele(input.id);
      revalidatePath(PATH);
      return { ok: true as const, id: input.id };
    }
    const row = await g.insertModele(champs);
    await g.synchroniserAvancementModele(row.id);
    revalidatePath(PATH);
    return { ok: true as const, id: row.id };
  } catch (e) {
    return fail(e);
  }
}

/** Range ou ressort un modèle. Rien n'est supprimé : les journées et le cumul
 * restent consultables via le filtre « Archivés ». */
export async function archiverModele(id: number, archive: boolean) {
  try {
    await assertUser();
    await g.updateModele(id, { archive });
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteModele(id: number) {
  try {
    await assertUser();
    await g.deleteModele(id);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── réglages de l'écran ─────────── */

/** Seuil d'alerte et cadence de rotation TV : réglés une fois, partagés par
 * tous les postes — l'atelier n'a pas à les reconfigurer écran par écran. */
export async function enregistrerReglages(r: { seuilAlerte?: number; tvRotSec?: number }) {
  try {
    await assertUser();
    if (r.seuilAlerte !== undefined) {
      await setSetting("gpao.seuilAlerte", Math.max(1, Math.min(200, Math.round(r.seuilAlerte))));
    }
    if (r.tvRotSec !== undefined) {
      await setSetting("gpao.tvRotSec", Math.max(3, Math.min(300, Math.round(r.tvRotSec))));
    }
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── import d'ouvrières ─────────── */

export type LigneImportOuvriere = { nom: string; poste: string; sam: number };

/** Importe un lot d'ouvrières dans une chaîne (fichier ou copier-coller depuis
 * Excel). Chaque ligne alimente au passage le catalogue et le registre, comme
 * une saisie manuelle — l'import n'est pas une porte dérobée. */
export async function importerOuvrieres(chaineId: number, lignes: LigneImportOuvriere[]) {
  try {
    await assertUser();
    const valides = lignes
      .map((l) => ({ nom: l.nom.trim(), poste: l.poste.trim(), sam: Math.max(0, Math.round(l.sam)) || 100 }))
      .filter((l) => l.nom);
    if (!valides.length) return { ok: false as const, error: "Aucune ligne exploitable" };

    await at.assurerOperations(
      valides.map((l) => ({ nom: l.poste, sam: l.sam })),
      "import",
    );

    let creees = 0;
    let fiches = 0;
    for (const l of valides) {
      const personne = await at.assurerPersonne(l.nom, l.poste);
      if (personne.creee) fiches++;
      await g.insertOuvriere({
        chaineId,
        nom: l.nom,
        poste: l.poste,
        sam: l.sam,
        personnelId: personne.personnelId,
      });
      creees++;
    }
    revalider();
    return { ok: true as const, creees, fiches };
  } catch (e) {
    return fail(e);
  }
}

/** Simulation : pièces produites & CA depuis les journées GPAO, sur une période. */
export async function simuler(from: string, to: string) {
  try {
    await assertUser();
    const data = await g.simulationGpao(from, to);
    return { ok: true as const, data };
  } catch (e) {
    return fail(e);
  }
}

/** Rapprochement automatique modèle↔commande par référence/nom (valorisation
 * de l'historique GPAO en une fois). */
export async function rapprocherModelesCommandes() {
  try {
    await assertUser();
    const bilan = await g.rapprocherModelesCommandes();
    revalidatePath(PATH);
    return { ok: true as const, ...bilan };
  } catch (e) {
    return fail(e);
  }
}

/** Lie manuellement un modèle à une commande (archivée acceptée) ou détache. */
export async function lierModele(modeleId: number, commandeId: number | null) {
  try {
    await assertUser();
    await g.lierModeleCommande(modeleId, commandeId);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/** Fixe/efface le prix de vente manuel d'un modèle (€/pièce). */
export async function majPrixManuel(modeleId: number, prix: number | null) {
  try {
    await assertUser();
    await g.majPrixManuelModele(modeleId, prix);
    revalidatePath(PATH);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/** Commandes internes, archivées incluses — pour le rattachement manuel. */
export async function commandesPourLien() {
  try {
    await assertUser();
    return { ok: true as const, data: await g.listCommandesInternes(true) };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── coût de l'heure usine & rentabilité ───────────
 *
 * Paramètres partagés par tous les postes (réglage « gpao.coutUsine ») :
 * charges mensuelles, ouvrières directes, heures/mois, et les objectifs
 * (rendement cible, marge cible, minutes par retouche). Tout le monde qui a
 * accès à la GPAO peut les lire ; seuls l'administrateur et le responsable
 * production peuvent les modifier (ce sont des chiffres de gestion). */
const ROLES_COUT_USINE = ["admin", "resp"];

export async function lireParamsUsine() {
  try {
    const user = await assertUser();
    const params = await rent.lireParamsUsine();
    return { ok: true as const, params, modifiable: ROLES_COUT_USINE.includes(userRole(user)) };
  } catch (e) {
    return fail(e);
  }
}

/** Enregistre tout ou partie des paramètres : les champs absents gardent leur
 * valeur actuelle (la Simulation règle le coût, la Rentabilité les objectifs). */
export async function enregistrerParamsUsine(input: Partial<ParamsUsine>) {
  try {
    const user = await assertUser();
    if (!ROLES_COUT_USINE.includes(userRole(user))) {
      throw new Error("Réservé à l'administrateur et au responsable production");
    }
    const actuels = await rent.lireParamsUsine();
    const params = normaliserParams({ ...actuels, ...input });
    await setSetting(rent.CLE_COUT_USINE, params);
    revalidatePath("/cockpit");
    return { ok: true as const, params };
  } catch (e) {
    return fail(e);
  }
}

/** Rapport de rentabilité d'une période (marge par modèle, pertes, point mort…). */
export async function rentabilite(from: string, to: string) {
  try {
    await assertUser();
    return { ok: true as const, data: await rent.rentabiliteGpao(from, to) };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── identité des ouvrières (fusion / réparation) ───────────
 *
 * Une personne = une fiche, partout : écran TV, historique, classement, QR.
 * « Vérifier » calcule le bilan sans rien écrire ; « Appliquer » fusionne les
 * fiches en double et relie toutes les journées. Réservé admin + resp. */
async function exigerGestion() {
  const user = await assertUser();
  if (!["admin", "resp"].includes(userRole(user))) throw new Error("Réservé à l'administrateur et au responsable production");
}

export async function verifierIdentites() {
  try {
    await exigerGestion();
    return { ok: true as const, bilan: await ident.reparerIdentites(false) };
  } catch (e) {
    return fail(e);
  }
}

export async function appliquerIdentites() {
  try {
    await exigerGestion();
    const bilan = await ident.reparerIdentites(true);
    for (const p of [PATH, "/qrouv", "/personnel"]) revalidatePath(p);
    return { ok: true as const, bilan };
  } catch (e) {
    return fail(e);
  }
}

/** Fusion manuelle de fiches homonymes : on choisit celle qu'on garde. */
export async function fusionnerFichesPersonnel(gardeId: number, autresIds: number[]) {
  try {
    await exigerGestion();
    const bilan = await ident.fusionnerFiches(gardeId, autresIds);
    for (const p of [PATH, "/qrouv", "/personnel"]) revalidatePath(p);
    return { ok: true as const, bilan };
  } catch (e) {
    return fail(e);
  }
}
