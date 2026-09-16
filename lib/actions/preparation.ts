"use server";

import { revalidatePath } from "next/cache";
import { revaliderCarnet } from "@/lib/revalidation";
import { assertUser } from "@/lib/auth/server";
import { userRole } from "@/lib/auth/server";
import * as fx from "@/lib/domain/feux";
import * as svc from "@/lib/services/preparation";
import { resolveFaconnierId } from "@/lib/services/commandes";
import { journaliser } from "@/lib/services/activite";

export type Result = { ok: true } | { ok: false; error: string };

const ok: Result = { ok: true };
const fail = (e: unknown): Result => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/** Toutes les pages de préparation partagent les mêmes données. */
const ECRANS = ["/dt", "/modelisme", "/nomen", "/magtissu", "/magfour"];
function revalider() {
  for (const p of ECRANS) revalidatePath(p);
  revalidatePath("/cockpit");
  revaliderCarnet();
}

/** Authentifie et vérifie le droit d'écriture sur le domaine métier.
 * La permission de menu donne l'accès à l'écran ; celle-ci donne le droit de
 * modifier — un magasinier consulte la direction technique sans y toucher. */
async function exigerDroit(domaine: fx.DomaineDroit): Promise<svc.Auteur> {
  const user = await assertUser();
  const role = userRole(user);
  if (!fx.peutModifier(domaine, role)) {
    throw new Error(`Modification réservée à ${fx.RESPONSABLE_DOMAINE[domaine]}`);
  }
  return { id: user.id, name: user.name, role };
}

/* ─────────── têtes de série ─────────── */

export async function ajouterTds(commandeId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("tds");
    await svc.ajouterTds(commandeId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function majTds(
  tdsId: number,
  champ: "envoi" | "retour" | "verdict" | "commentaire",
  valeur: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("tds");
    await svc.majTds(tdsId, champ, valeur, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerTds(tdsId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("tds");
    await svc.supprimerTds(tdsId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── modélisme ─────────── */

export async function majEtape(
  commandeId: number,
  etape: "patronage" | "traces",
  fait: boolean,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("modelisme");
    await svc.majEtape(commandeId, etape, fait, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── champs portés par la commande (nomen / tissu / four) ─────────── */

export async function majChamp(
  commandeId: number,
  champ: svc.ChampCommandePrepa,
  valeur: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit(svc.champDomaine(champ));
    await svc.majChampCommande(commandeId, champ, valeur, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── lignes de fournitures ─────────── */

export async function ajouterLigneFourniture(commandeId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("four");
    await svc.ajouterLigneFourniture(commandeId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function majLigneFourniture(
  ligneId: number,
  champ: "designation" | "qtePrevue" | "qteRecue" | "unite",
  valeur: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("four");
    await svc.majLigneFourniture(ligneId, champ, valeur, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerLigneFourniture(ligneId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("four");
    await svc.supprimerLigneFourniture(ligneId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── tissu (détail par matière) ─────────── */

export async function ajouterLigneTissu(commandeId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("tissu");
    await svc.ajouterLigneTissu(commandeId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function majLigneTissu(
  ligneId: number,
  champ: svc.ChampLigneTissu,
  valeur: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("tissu");
    await svc.majLigneTissu(ligneId, champ, valeur, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerLigneTissu(ligneId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("tissu");
    await svc.supprimerLigneTissu(ligneId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── lancement ─────────── */

export async function lancer(
  commandeId: number,
  mode: svc.ModeLancement,
  faconnierNom?: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("lancement");
    // La règle est revérifiée ici : le client peut afficher un bouton, il ne
    // décide pas. Sans les cinq feux verts, il faut une dérogation.
    const ctx = await svc.contexteDe(commandeId);
    if (!ctx) return { ok: false, error: "Commande introuvable" };
    if (ctx.lancement) return { ok: false, error: "Commande déjà lancée" };
    if (!fx.estPret(ctx)) {
      const noms = fx.bloquants(ctx).map((f) => f.label).join(", ");
      return { ok: false, error: `Feux non satisfaits (${noms}) — une dérogation est nécessaire` };
    }

    let faconnierId: number | null = null;
    if (mode === "soustraitance") {
      faconnierId = await resolveFaconnierId(faconnierNom);
      if (!faconnierId) return { ok: false, error: "Choisissez un façonnier" };
    }
    await svc.lancer(commandeId, mode, auteur, { faconnierId });
    await journaliser("validation", "Lancement", `commande ${commandeId} lancée en ${mode}`);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function lancerParDerogation(
  commandeId: number,
  mode: svc.ModeLancement,
  motif: string,
  faconnierNom?: string,
): Promise<Result> {
  try {
    const auteur = await exigerDroit("derogation");
    const propre = (motif ?? "").trim();
    if (propre.length < 10) {
      return { ok: false, error: "Motif obligatoire (10 caractères minimum)" };
    }
    const ctx = await svc.contexteDe(commandeId);
    if (!ctx) return { ok: false, error: "Commande introuvable" };
    if (ctx.lancement) return { ok: false, error: "Commande déjà lancée" };

    // Les points non satisfaits sont figés au moment de la dérogation : c'est
    // ce que l'audit doit pouvoir relire, pas l'état d'aujourd'hui.
    const manques = fx.bloquants(ctx).map((f) => `${f.label} (${f.etat.label})`);

    let faconnierId: number | null = null;
    if (mode === "soustraitance") {
      faconnierId = await resolveFaconnierId(faconnierNom);
      if (!faconnierId) return { ok: false, error: "Choisissez un façonnier" };
    }
    await svc.lancer(commandeId, mode, auteur, { faconnierId, derogation: { motif: propre, manques } });
    await journaliser(
      "validation",
      "Lancement",
      `DÉROGATION commande ${commandeId} (${mode}) — non satisfaits : ${manques.join(", ") || "aucun"} — motif : ${propre}`,
    );
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function annulerLancement(commandeId: number): Promise<Result> {
  try {
    const auteur = await exigerDroit("lancement");
    await svc.annulerLancement(commandeId, auteur);
    revalider();
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── journal ─────────── */

export async function chargerJournal(commandeId: number, domaine?: string) {
  await assertUser();
  const rows = await svc.journalDe(commandeId, domaine);
  return rows.map((r) => ({
    id: r.id,
    ts: r.ts.toISOString(),
    par: r.par,
    role: r.role,
    domaine: r.domaine,
    action: r.action,
    detail: r.detail,
    avant: r.avant,
    apres: r.apres,
  }));
}
