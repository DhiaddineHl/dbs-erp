"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as svc from "@/lib/services/prevision-client";
import { journaliser } from "@/lib/services/activite";

/* Publier la prévision d'export aux clients : un engagement envers eux,
 * réservé au responsable de production et à l'administrateur. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

export async function publierPrevision(v: { exclus: number[]; qtes: Record<string, number>; commentaires: Record<string, string> }): Promise<Result<{ lignes: number; clients: number }>> {
  try {
    const u = await assertUser();
    if (!["admin", "resp"].includes(userRole(u))) throw new Error("Publication réservée au responsable de production et à l'administrateur.");
    const r = await svc.publier(v, { id: u.id as string, nom: u.name as string });
    await journaliser("validation", "Prévision export clients", `semaine du ${r.debut} : ${r.lignes} ligne(s), ${r.clients} client(s)`);
    revalidatePath("/prevexport");
    return { ok: true, lignes: r.lignes, clients: r.clients };
  } catch (e) {
    return fail(e);
  }
}
