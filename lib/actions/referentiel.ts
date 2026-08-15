"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as svc from "@/lib/services/referentiel";
import { journaliser } from "@/lib/services/activite";

export type Retour<T> = { ok: true; data: T } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/* Fusionner deux fiches ou réaffecter une facture touche au CA par client.
 * Réservé à ceux qui répondent des chiffres. */
const RESPONSABLE = ["admin", "resp"];

async function exigerResponsable() {
  const user = await assertUser();
  if (!RESPONSABLE.includes(userRole(user)))
    throw new Error("Réservé aux administrateurs et responsables");
  return user;
}

export async function peutNettoyerReferentiel(): Promise<boolean> {
  try {
    const user = await assertUser();
    return RESPONSABLE.includes(userRole(user));
  } catch {
    return false;
  }
}

/* ─────────── B12 · ventilation ─────────── */

export async function facturesAVentiler(): Promise<Retour<svc.Ventilation>> {
  try {
    await exigerResponsable();
    return { ok: true, data: await svc.facturesAVentiler() };
  } catch (e) {
    return fail(e);
  }
}

export async function ventiler(
  choix: { factureId: number; clientNom: string }[],
): Promise<Retour<number>> {
  try {
    await exigerResponsable();
    const n = await svc.ventiler(choix);
    if (!n) return { ok: false, error: "Aucune facture à ventiler — choisissez au moins une société" };
    await journaliser("facturation", "Ventilation", `${n} facture(s) rattachée(s) à leur société`);
    for (const p of ["/factures", "/clients", "/stats", "/grand_livre"]) revalidatePath(p);
    return { ok: true, data: n };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── B17 · fusion des clients ─────────── */

export async function propositionsFusionClients(): Promise<Retour<svc.GroupeFusion[]>> {
  try {
    await exigerResponsable();
    return { ok: true, data: await svc.propositionsFusionClients() };
  } catch (e) {
    return fail(e);
  }
}

export async function apercuFusion(absorbesIds: number[]): Promise<Retour<svc.BilanFusion>> {
  try {
    await exigerResponsable();
    return { ok: true, data: await svc.apercuFusion(absorbesIds) };
  } catch (e) {
    return fail(e);
  }
}

export async function fusionnerClients(
  gardeId: number,
  absorbesIds: number[],
): Promise<Retour<svc.BilanFusion>> {
  try {
    await exigerResponsable();
    if (!absorbesIds.length) return { ok: false, error: "Aucune fiche à absorber" };
    const bilan = await svc.fusionnerClients(gardeId, absorbesIds);
    await journaliser(
      "modification",
      "Clients",
      `Fusion : ${bilan.fiches} fiche(s) absorbée(s) — ${bilan.commandes} commande(s), ${bilan.bls} BL, ${bilan.factures} facture(s) rattachés`,
    );
    for (const p of ["/clients", "/commandes", "/factures", "/bl", "/stats"]) revalidatePath(p);
    return { ok: true, data: bilan };
  } catch (e) {
    return fail(e);
  }
}
