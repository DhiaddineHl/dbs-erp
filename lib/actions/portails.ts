"use server";

import { revalidatePath } from "next/cache";
import { assertModule, userRole } from "@/lib/auth/server";
/** Pages d'où ces actions s'utilisent : le rôle doit avoir au moins un de ces modules (Paramètres → Rôles). */
const MODULES = ["portails"] as const;

import * as acc from "@/lib/services/portail-acces";

/* Gestion des accès aux portails (bureau) : responsable de production et
 * administrateur seulement. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

async function gestionnaire() {
  const u = await assertModule(...MODULES);
  if (!["admin", "resp"].includes(userRole(u))) throw new Error("Réservé au responsable de production et à l'administrateur.");
  return { name: u.name as string };
}

export async function creerAcces(v: { type: acc.TypeAcces; cibleId: number; nom: string; avecPin: boolean }): Promise<Result<{ id: number; cle: string; pin: string }>> {
  try {
    const u = await gestionnaire();
    const r = await acc.creerAcces(v, u.name);
    revalidatePath("/portails");
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function regenererCle(id: number): Promise<Result<{ cle: string }>> {
  try {
    await gestionnaire();
    const cle = await acc.regenererCle(id);
    revalidatePath("/portails");
    return { ok: true, cle };
  } catch (e) {
    return fail(e);
  }
}

export async function regenererPin(id: number): Promise<Result<{ pin: string }>> {
  try {
    await gestionnaire();
    const pin = await acc.regenererPin(id);
    revalidatePath("/portails");
    return { ok: true, pin };
  } catch (e) {
    return fail(e);
  }
}

export async function retirerPin(id: number): Promise<Result> {
  try {
    await gestionnaire();
    await acc.retirerPin(id);
    revalidatePath("/portails");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function activerAcces(id: number, actif: boolean): Promise<Result> {
  try {
    await gestionnaire();
    await acc.activerAcces(id, actif);
    revalidatePath("/portails");
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
