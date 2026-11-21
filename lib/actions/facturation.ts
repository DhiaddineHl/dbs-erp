"use server";

import { revalidatePath } from "next/cache";
import { assertModule } from "@/lib/auth/server";
/** Pages d'où ces actions s'utilisent : le rôle doit avoir au moins un de ces modules (Paramètres → Rôles). */
const MODULES = ["factures"] as const;

import * as svc from "@/lib/services/facturation";
import type { FactureDomain } from "@/lib/services/facturation";

/* Server actions for the Facturation module. All invoice state lives in Postgres
 * now (no more localStorage) so every user shares the same registre, marges and
 * cost entries. Each mutation asserts an authenticated user and revalidates. */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const PATH = "/factures";

export async function saveFactureAction(f: FactureDomain): Promise<Result<{ existed: boolean }>> {
  try {
    await assertModule(...MODULES);
    const existed = await svc.factureExists(f.id, f.type);
    await svc.saveFacture(f);
    revalidatePath(PATH);
    return { ok: true, existed };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFactureAction(num: string, type: string): Promise<Result> {
  try {
    await assertModule(...MODULES);
    await svc.softDeleteFacture(num, type);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreFacturesAction(): Promise<Result> {
  try {
    await assertModule(...MODULES);
    await svc.restoreAllFactures();
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function setCostLineAction(
  num: string,
  type: string,
  lineIdx: number,
  data: { lieu: string; faconnier: string; cout: number | null },
): Promise<Result> {
  try {
    await assertModule(...MODULES);
    await svc.setCostLine(num, type, lineIdx, data);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function suggererClientAction(
  lignes: { modele: string; ref: string }[],
): Promise<Result<{ suggestions: svc.SuggestionClient[] }>> {
  try {
    await assertModule(...MODULES);
    const suggestions = await svc.suggererClientPourFacture(lignes);
    return { ok: true, suggestions };
  } catch (e) {
    return fail(e);
  }
}

export async function reattribuerClientAction(num: string, type: string, clientKey: string): Promise<Result> {
  try {
    await assertModule(...MODULES);
    await svc.reattribuerClientFacture(num, type, clientKey);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
