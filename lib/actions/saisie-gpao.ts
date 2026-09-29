"use server";

import { revalidatePath } from "next/cache";
import { auteurGpao } from "@/lib/auth/gpao";
import type { Saisie } from "@/lib/domain/saisie-gpao";
import { creerJournee } from "@/lib/services/gpao";
import * as svc from "@/lib/services/saisie-gpao";

/* Saisie de production GPAO — tablette de l'agent de méthode ET écran du
 * bureau. Une case = une saisie, écrite une seule fois, au bon endroit. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

export async function saisirProduction(journeeId: number, saisies: Saisie[]): Promise<Result<{ journee: svc.JourneeRow }>> {
  try {
    await auteurGpao();
    const journee = await svc.saisirJournee(journeeId, saisies);
    // Pas de revalidatePath ici : chaque case tapée rechargerait toute la page
    // GPAO. Les écrans ouverts relisent la journée d'eux-mêmes.
    return { ok: true, journee };
  } catch (e) {
    return fail(e);
  }
}

/** Relecture d'une journée (rafraîchissement automatique des écrans ouverts). */
export async function relireJournee(journeeId: number): Promise<Result<{ journee: svc.JourneeRow }>> {
  try {
    await auteurGpao();
    const journee = await svc.lireJournee(journeeId);
    if (!journee) return { ok: false, error: "Journée introuvable (supprimée au bureau ?)." };
    return { ok: true, journee };
  } catch (e) {
    return fail(e);
  }
}

/** Crée la journée du jour depuis la tablette. Si la même chaîne a déjà une
 * journée pour ce modèle à cette date, on la rouvre au lieu d'en créer une
 * deuxième (pas de production comptée deux fois). */
export async function ouvrirJourneeTablette(input: {
  date: string;
  chaineId: number;
  modeleId: number;
  nbHeures: string;
  effectif: string;
}): Promise<Result<{ id: number; existait: boolean }>> {
  try {
    await auteurGpao();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) return { ok: false, error: "Date invalide." };
    if (!input.chaineId || !input.modeleId) return { ok: false, error: "Choisissez la chaîne et le modèle." };
    const deja = await svc.journeeExistante(input.date, input.chaineId, input.modeleId);
    if (deja) return { ok: true, id: deja, existait: true };
    const nbHeures = Number(String(input.nbHeures).replace(",", "."));
    if (!(nbHeures > 0 && nbHeures <= 16)) return { ok: false, error: "Nombre d'heures invalide (1 à 16)." };
    const effectif = Math.trunc(Number(input.effectif));
    if (!(effectif > 0 && effectif <= 500)) return { ok: false, error: "Effectif présent invalide." };
    const row = await creerJournee({ date: input.date, chaineId: input.chaineId, modeleId: input.modeleId, nbHeures, effectif });
    revalidatePath("/gpao_prod");
    return { ok: true, id: row.id, existait: false };
  } catch (e) {
    return fail(e);
  }
}
