"use server";

import { revalidatePath } from "next/cache";
import { assertModule, userRole } from "@/lib/auth/server";
/** Pages d'où ces actions s'utilisent : le rôle doit avoir au moins un de ces modules (Paramètres → Rôles). */
const MODULES = ["dt", "modelisme", "nomen", "magfour", "magtissu"] as const;

import { peutModifier } from "@/lib/domain/feux";
import * as svc from "@/lib/services/documents-modele";
import { journaliser } from "@/lib/services/activite";

export type Result = { ok: true } | { ok: false; error: string };

async function dt() {
  const u = await assertModule(...MODULES);
  if (!peutModifier("tds", userRole(u))) throw new Error("Réservé à la direction technique.");
  return { id: u.id as string, nom: u.name as string };
}

/** Retire une fiche : elle n'est plus montrée (ni chez nous, ni à l'atelier) ; rien n'est effacé. */
export async function retirerDocument(id: number): Promise<Result> {
  try {
    const moi = await dt();
    const nom = await svc.retirerDocument(id, moi);
    await journaliser("suppression", "Direction technique", `fiche « ${nom} » retirée`);
    revalidatePath("/dt");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}

export async function visibiliteDocument(id: number, visible: boolean): Promise<Result> {
  try {
    await dt();
    await svc.visibiliteDocument(id, visible);
    revalidatePath("/dt");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Erreur" };
  }
}
