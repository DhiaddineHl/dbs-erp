"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth/server";
import { journaliser } from "@/lib/services/activite";
import * as ind from "@/lib/services/industriel";
import * as sam from "@/lib/services/sam";
import { rattacherToutesReferences } from "@/lib/services/reference";

/* Actions serveur des capacités industrielles ajoutées au bloc 2. Chacune
 * vérifie la session ; les écrans qui les appelleront (bloc UI) restent à
 * brancher, mais la capacité serveur est en place et testable. */

const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

/* ─────────── arrêts ─────────── */
export async function ajouterArretAction(input: ind.ArretInput) {
  try {
    await assertUser();
    const id = await ind.ajouterArret(input);
    revalidatePath("/gpao_prod");
    return { ok: true as const, id };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerArretAction(id: number) {
  try {
    await assertUser();
    await ind.supprimerArret(id);
    revalidatePath("/gpao_prod");
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── confiage façonnier ─────────── */
export async function ajouterConfiageAction(input: ind.ConfiageInput) {
  try {
    await assertUser();
    const id = await ind.ajouterConfiage(input);
    revalidatePath("/planfacon");
    revalidatePath("/facon");
    return { ok: true as const, id };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── versions de plan ─────────── */
export async function archiverVersionPlanAction(commandeId: number, motif = "") {
  try {
    const u = await assertUser();
    const version = await ind.archiverVersionPlan(commandeId, u?.name ?? "", motif);
    await journaliser("modification", `Plan de coupe commande #${commandeId}`, `Archivage version ${version} — ${motif}`);
    revalidatePath("/modelisme");
    return { ok: true as const, version };
  } catch (e) {
    return fail(e);
  }
}

export async function figerConfigLancementAction(commandeId: number, config: ind.ConfigLancement) {
  try {
    await assertUser();
    await ind.figerConfigLancement(commandeId, config);
    await journaliser("validation", `Lancement commande #${commandeId}`, "Configuration technique figée au OK production");
    revalidatePath("/dt");
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── mémoire du SAM ─────────── */
export async function archiverSerieAction(commandeId: number, libelle = "") {
  try {
    await assertUser();
    const id = await sam.archiverSerie(commandeId, libelle);
    revalidatePath("/gpao_prod");
    return { ok: true as const, id };
  } catch (e) {
    return fail(e);
  }
}

export async function validerSamDbsAction(referenceId: number, valeur: number) {
  try {
    const u = await assertUser();
    await sam.validerSamDbs(referenceId, valeur, u?.name ?? "");
    await journaliser("validation", `Référence #${referenceId}`, `SAM DBS validé à ${Math.round(valeur)} s/pc`);
    return { ok: true as const };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── reprise : rattacher les commandes aux références ─────────── */
export async function rattacherToutesReferencesAction() {
  try {
    await assertUser();
    const n = await rattacherToutesReferences();
    revalidatePath("/commandes");
    return { ok: true as const, rattachees: n };
  } catch (e) {
    return fail(e);
  }
}
