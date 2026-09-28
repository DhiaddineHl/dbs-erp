"use server";

import type { EntityName } from "@/lib/services/modules";
import {
  deleteClientsAction,
  deleteCommandesAction,
  deleteFaconniersAction,
  updateClientRow,
  updateCommandeRow,
  updateFaconnierRow,
} from "@/lib/actions/commandes";

type Result = { ok: true } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/* Point d'entrée du tableau éditable partagé : chaque référentiel a ses
 * actions typées (colonnes, clés étrangères, journal des prix). */
export async function updateEntity(entity: EntityName, id: number, patch: Record<string, string>): Promise<Result> {
  try {
    if (entity === "commande") return await updateCommandeRow(id, patch);
    if (entity === "client") return await updateClientRow(id, patch);
    if (entity === "faconnier") return await updateFaconnierRow(id, patch);
    return { ok: false, error: "Entité inconnue" };
  } catch (e) {
    return fail(e);
  }
}

export async function deleteEntities(entity: EntityName, ids: number[]): Promise<Result> {
  try {
    if (entity === "commande") return await deleteCommandesAction(ids);
    if (entity === "client") return await deleteClientsAction(ids);
    if (entity === "faconnier") return await deleteFaconniersAction(ids);
    return { ok: false, error: "Entité inconnue" };
  } catch (e) {
    return fail(e);
  }
}
