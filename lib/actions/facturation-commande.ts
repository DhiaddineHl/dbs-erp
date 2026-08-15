"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import type { Divergence } from "@/lib/domain/facturation-commande";
import * as svc from "@/lib/services/facturation-commande";
import { deleteCommandes, setArchived } from "@/lib/services/commandes";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/** Facturer engage l'entreprise vis-à-vis du client : même périmètre que la
 * suppression de commandes. */
const PEUT_FACTURER = ["admin", "resp"];

async function exigerFacturation() {
  const user = await assertUser();
  if (!PEUT_FACTURER.includes(userRole(user)))
    throw new Error("Facturation réservée aux administrateurs et responsables");
  return user;
}

function revalider() {
  for (const p of ["/commandes", "/factures", "/archives", "/stats"]) revalidatePath(p);
}

export async function peutFacturer(): Promise<boolean> {
  try {
    const user = await assertUser();
    return PEUT_FACTURER.includes(userRole(user));
  } catch {
    return false;
  }
}

/* ─────────── B1 ─────────── */

export async function chargerCibles(clientNom: string, commandeId: number) {
  try {
    await assertUser();
    const [cibles, numero] = await Promise.all([
      svc.facturesDuClient(clientNom),
      svc.prochainNumeroPasserelle(),
    ]);
    return ok({ cibles, numero, commandeId });
  } catch (e) {
    return fail(e);
  }
}

export async function facturerCommande(
  commandeId: number,
  saisie: { qte: number; pu: number; ref?: string; desig?: string; cible?: string; numero?: string },
): Promise<Result<svc.ResultatFacturation>> {
  try {
    await exigerFacturation();
    const r = await svc.facturerCommande(commandeId, saisie);
    await journaliser(
      "facturation",
      "Commandes",
      `${r.qte} pcs → ${r.numero}${r.complete ? " (soldée)" : ` (reste ${r.reste})`}`,
    );
    revalider();
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── B3 ─────────── */

export async function controlerPrixFacon(): Promise<Result<Divergence[]>> {
  try {
    await assertUser();
    return ok(await svc.controlerPrixFacon());
  } catch (e) {
    return fail(e);
  }
}

export async function alignerPrixFacon(divergences: Divergence[]): Promise<Result<number>> {
  try {
    await exigerFacturation();
    const n = await svc.alignerPrixFacon(divergences);
    await journaliser("modification", "Commandes", `${n} prix façon aligné(s) sur la facture`);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

export async function propagerPrixFacon(commandeId: number): Promise<Result<number>> {
  try {
    await exigerFacturation();
    const n = await svc.propagerPrixFacon(commandeId);
    if (n) await journaliser("modification", "Facturation", `prix façon reporté sur ${n} ligne(s) de facture`);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── B10 ─────────── */

export async function listerSoldees(): Promise<Result<svc.Soldee[]>> {
  try {
    await assertUser();
    return ok(await svc.listerSoldees());
  } catch (e) {
    return fail(e);
  }
}

export async function purgerSoldees(mode: "archiver" | "supprimer"): Promise<Result<number>> {
  try {
    const user = await exigerFacturation();
    const cibles = await svc.listerSoldees();
    if (!cibles.length) return ok(0);
    const ids = cibles.map((c) => c.id);

    if (mode === "supprimer") {
      await deleteCommandes(ids, user.id);
      await journaliser("suppression", "Commandes", `purge : ${ids.length} commande(s) soldée(s) supprimée(s)`);
    } else {
      await setArchived(ids, true);
      await journaliser("archivage", "Commandes", `purge : ${ids.length} commande(s) soldée(s) archivée(s)`);
    }
    revalider();
    return ok(ids.length);
  } catch (e) {
    return fail(e);
  }
}
