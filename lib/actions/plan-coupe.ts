"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as fx from "@/lib/domain/feux";
import * as pc from "@/lib/domain/plan-coupe";
import { journaliser } from "@/lib/services/activite";
import * as svc from "@/lib/services/plan-coupe";
import { majEtape } from "@/lib/services/preparation";
import { revaliderCarnet } from "@/lib/revalidation";

/* Les actions du plan de coupe.
 *
 * Toutes exigent le droit « modélisme » — le même que le patronage et le
 * tirage des tracés, puisque c'est le même bureau qui prépare le plan. La
 * lecture, elle, reste libre : l'atelier consulte la fiche de matelassage sans
 * pouvoir la changer. */

export type Result<T = undefined> = { ok: true; data: T } | { ok: false; error: string };

const ok = <T>(data: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

const ECRANS = ["/dt", "/modelisme", "/nomen", "/magtissu", "/magfour"];

function revalider(commandeId: number) {
  for (const p of ECRANS) revalidatePath(p);
  // Chemin littéral : un segment dynamique demanderait le paramètre `type`.
  revalidatePath(`/modelisme/${commandeId}/plan`);
  revalidatePath("/commandes");
  revalidatePath("/tracabilite");
  revalidatePath("/cockpit");
  revaliderCarnet();
}

async function exigerModeliste() {
  const user = await assertUser();
  const role = userRole(user);
  if (!fx.peutModifier("modelisme", role)) {
    throw new Error(`Modification réservée à ${fx.RESPONSABLE_DOMAINE.modelisme}`);
  }
  return { id: user.id, name: user.name, role };
}

/** Le contexte est relu côté serveur à chaque écriture : le client affiche des
 * boutons, il ne décide pas de ce qui est permis. */
async function exigerContexte(commandeId: number) {
  const ctx = await svc.contexteCommande(commandeId);
  if (!ctx) throw new Error("Commande introuvable");
  return ctx;
}

/* ─────────── enregistrement ─────────── */

/** Ce que l'éditeur peut proposer à la modéliste après un enregistrement
 * réussi — les deux automatismes de PilotPro v7.5.1, mais décidés par le
 * serveur, qui seul connaît l'état réel de la commande. */
export type SuitesEnregistrement = {
  /** La grille du plan détaille la commande autrement : proposer de la corriger. */
  corrigerTailles: { grille: pc.LigneTaille[]; avant: string; apres: string; total: number } | null;
  /** Refus motivé quand la grille diffère mais que la commande est verrouillée. */
  correctionRefusee: string | null;
  /** Le plan est complet : proposer de valider « Tirage des tracés ». */
  validerTraces: boolean;
  /** Signature retenue en base, pour que l'éditeur l'affiche sans recharger. */
  par: string;
  date: string;
};

export async function enregistrerPlan(commandeId: number, plan: pc.Plan): Promise<Result<SuitesEnregistrement>> {
  try {
    const auteur = await exigerModeliste();
    const ctx = await exigerContexte(commandeId);
    if (ctx.parentId != null) {
      throw new Error(`Sous-commande : le plan de coupe se prépare sur ${ctx.porteurOf || "l'OF porteur"}.`);
    }

    const enregistre = await svc.enregistrerPlan(commandeId, plan, auteur);

    /* ── suite 1 : la grille du plan détaille la commande ──
     * Cas courant : une commande saisie en taille unique que la modéliste
     * ventile en S/M/L/XL au moment du matelassage. */
    const grille = pc.grilleDetaillee(enregistre);
    let corrigerTailles: SuitesEnregistrement["corrigerTailles"] = null;
    let correctionRefusee: string | null = null;
    if (pc.grilleDetaille(grille) && pc.grilleDifferente(ctx.tailles, grille)) {
      const refus = svc.motifRefusCorrectionTailles(ctx);
      if (refus) correctionRefusee = refus;
      else {
        corrigerTailles = {
          grille,
          avant: ctx.tailles.length
            ? ctx.tailles.map((t) => `${t.taille}:${t.qte}`).join(" · ")
            : `TU (${ctx.qte} pcs)`,
          apres: grille.map((t) => `${t.taille}:${t.qte}`).join(" · "),
          total: grille.reduce((a, t) => a + t.qte, 0),
        };
      }
    }

    /* ── suite 2 : le plan est complet, l'étape « tracés » peut suivre ── */
    const dejaFait = await svc.etapeTracesFaite(commandeId);
    const validerTraces = pc.planComplet(enregistre) && !dejaFait;

    revalider(commandeId);
    return ok({ corrigerTailles, correctionRefusee, validerTraces, par: enregistre.par, date: enregistre.date ?? "" });
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── reports vers la commande ─────────── */

/** Consommation réellement constatée, en mètres par pièce.
 *
 * Refusée tant qu'une longueur est estimée : une prévision du proposeur qui
 * descendrait dans la nomenclature deviendrait, deux écrans plus loin, le
 * besoin tissu que le magasin achète. */
export async function reporterConsoReelle(commandeId: number, rangMatiere: number): Promise<Result<number>> {
  try {
    const auteur = await exigerModeliste();
    const plan = await svc.getPlan(commandeId);
    if (!plan) throw new Error("Enregistrez d'abord le plan");
    const m = plan.matieres.find((x) => x.rang === rangMatiere);
    if (!m) throw new Error("Matière introuvable");
    if (pc.estEstime(m)) {
      throw new Error("Longueurs encore estimées — saisissez les vraies longueurs après placement avant de reporter");
    }
    const conso = pc.consoReellePiece(m, plan.sizes);
    if (conso == null || conso <= 0) throw new Error("Aucune pièce coupée dans le plan");

    const valeur = +conso.toFixed(3);
    await svc.reporterConsoReelle(commandeId, valeur, auteur);
    await journaliser("modification", "Plan de coupe", `conso réelle ${valeur} m/pièce reportée (commande ${commandeId})`);
    revalider(commandeId);
    return ok(valeur);
  } catch (e) {
    return fail(e);
  }
}

export async function reporterConsoPrevue(commandeId: number, rangMatiere: number): Promise<Result<number>> {
  try {
    const auteur = await exigerModeliste();
    const plan = await svc.getPlan(commandeId);
    if (!plan) throw new Error("Enregistrez d'abord le plan");
    const m = plan.matieres.find((x) => x.rang === rangMatiere);
    if (!m) throw new Error("Matière introuvable");
    const valeur = m.consoPrevue ?? 0;
    if (valeur <= 0) throw new Error("Saisissez d'abord la consommation prévue dans le plan");

    await svc.reporterConsoPrevue(commandeId, valeur, auteur);
    await journaliser("modification", "Plan de coupe", `conso prévue ${valeur} m/pièce reportée (commande ${commandeId})`);
    revalider(commandeId);
    return ok(valeur);
  } catch (e) {
    return fail(e);
  }
}

/** Sens inverse (point 2) : déduit du magasin tissu le métrage réellement
 * consommé par une matière liée à un lot. Total = conso réelle/pièce × pièces
 * coupées de cette matière. Idempotent (n'ajoute que le delta). */
export async function deduireDuMagasin(commandeId: number, rangMatiere: number): Promise<Result<{ sortie: number; lot: string }>> {
  try {
    const auteur = await exigerModeliste();
    const plan = await svc.getPlan(commandeId);
    if (!plan) throw new Error("Enregistrez d'abord le plan");
    const m = plan.matieres.find((x) => x.rang === rangMatiere);
    if (!m) throw new Error("Matière introuvable");
    if (m.lotId == null) throw new Error("Liez d'abord cette matière à un lot (bouton « Importer du magasin »)");
    if (pc.estEstime(m)) throw new Error("Longueurs encore estimées — saisissez les vraies longueurs avant de déduire");

    const consoPiece = pc.consoReellePiece(m, plan.sizes);
    const pieces = pc.piecesTotales(m, plan.sizes);
    if (consoPiece == null || consoPiece <= 0 || pieces <= 0) throw new Error("Aucune pièce coupée dans le plan");
    const total = +(consoPiece * pieces).toFixed(2);

    const r = await svc.consommerDepuisPlan(commandeId, rangMatiere, total, auteur);
    if (!r.ok) throw new Error(r.error);
    await journaliser("modification", "Magasin tissu", `sortie ${r.sortie} m du lot ${r.lot} (coupe commande ${commandeId})`);
    revalider(commandeId);
    return ok({ sortie: r.sortie, lot: r.lot });
  } catch (e) {
    return fail(e);
  }
}

/** Réécrit la grille de tailles de la commande depuis celle du plan.
 *
 * Le garde de `motifRefusCorrectionTailles` est appliqué ICI, sur le contexte
 * relu : c'est une quantité commerciale qui change, pas un champ de fiche. */
export async function reporterTailles(commandeId: number): Promise<Result<{ total: number; lignes: number }>> {
  try {
    const auteur = await exigerModeliste();
    const ctx = await exigerContexte(commandeId);
    const refus = svc.motifRefusCorrectionTailles(ctx);
    if (refus) throw new Error(refus);

    const plan = await svc.getPlan(commandeId);
    if (!plan) throw new Error("Enregistrez d'abord le plan");
    const grille = pc.grilleDetaillee(plan);
    if (!grille.length) throw new Error("Saisissez d'abord les quantités par taille");

    await svc.reporterTailles(commandeId, grille, auteur);
    const total = grille.reduce((a, t) => a + t.qte, 0);
    await journaliser(
      "modification",
      "Plan de coupe",
      `grille de tailles de la commande ${commandeId} corrigée depuis le plan (${ctx.qte} → ${total} pcs)`,
    );
    revalider(commandeId);
    return ok({ total, lignes: grille.length });
  } catch (e) {
    return fail(e);
  }
}

/** Valide « Tirage des tracés » depuis le plan — même écriture que la case à
 * cocher de l'écran Modélisme, donc même service. */
export async function validerTraces(commandeId: number): Promise<Result> {
  try {
    const auteur = await exigerModeliste();
    const plan = await svc.getPlan(commandeId);
    if (!plan || !pc.planComplet(plan)) {
      throw new Error("Le plan n'est pas complet — longueurs réelles et commande couverte sont nécessaires");
    }
    await majEtape(commandeId, "traces", true, auteur);
    revalider(commandeId);
    return ok(undefined);
  } catch (e) {
    return fail(e);
  }
}
