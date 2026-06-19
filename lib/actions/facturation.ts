"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth/server";
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
    await assertUser();
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
    await assertUser();
    await svc.softDeleteFacture(num, type);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function restoreFacturesAction(): Promise<Result> {
  try {
    await assertUser();
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
    await assertUser();
    await svc.setCostLine(num, type, lineIdx, data);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
