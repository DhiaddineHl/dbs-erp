"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as av from "@/lib/domain/aval";
import * as svc from "@/lib/services/suivi-soustraitants";
import { creerBr } from "@/lib/actions/aval";
import { journaliser } from "@/lib/services/activite";
import type { Ligne } from "@/lib/domain/soustraitant";

/* Suivi des sous-traitants — côté bureau. Valider une livraison crée le BR
 * par l'action habituelle (mêmes contrôles, mêmes droits que la saisie à la
 * main au magasin) ; valider un rapport de coupe passe par la fiche de coupe. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

async function magasin() {
  const u = await assertUser();
  const role = userRole(u);
  if (role !== "admin" && !av.ROLES_SAISIE_MAGASIN.includes(role)) throw new Error("Réservé à la production et au magasin.");
  return { id: u.id as string, nom: u.name as string };
}

function revalider(numero?: string) {
  revalidatePath("/suivi_st");
  if (numero) revalidatePath(`/suivi_st/livraison/${numero}`);
}

/** « Marchandise reçue » : on compte (1er / 2e choix par taille), le BR naît. */
export async function validerLivraison(numero: string, recues: Ligne[], forcer = false): Promise<Result<{ br: string }>> {
  let reserve: number | null = null;
  try {
    const moi = await magasin();
    const r = await svc.reserverLivraison(numero, recues);
    reserve = r.livraison.id;
    const t = r.br;
    const res = await creerBr({
      commandeId: r.livraison.commandeId,
      date: new Date().toISOString().slice(0, 10),
      qteRecue: t.qteRecue,
      qteOk: t.qteOk,
      qteNc: t.qteNc,
      controle: t.controle,
      note: `Livraison ${numero} (portail)${t.qteNc ? ` — ${t.qteNc} en 2e choix` : ""}`,
      forcer,
    });
    if (!res.ok) {
      await svc.relacherLivraison(r.livraison.id);
      return { ok: false, error: res.error };
    }
    reserve = null;
    const brNumero = res.data?.numero ?? "";
    await svc.marquerRecue(r.livraison.id, r.recues, brNumero, moi);
    await journaliser("creation", "Suivi sous-traitants", `${numero} reçue → ${brNumero}`);
    revalider(numero);
    return { ok: true, br: brNumero };
  } catch (e) {
    if (reserve != null) await svc.relacherLivraison(reserve);
    return fail(e);
  }
}

export async function validerRapport(id: number, motif: string, precision: string): Promise<Result<{ numero: string }>> {
  try {
    const moi = await magasin();
    const f = await svc.validerRapport(id, { motif, precision }, moi);
    await journaliser("creation", "Suivi sous-traitants", `rapport de coupe ${id} validé → ${f.numero}`);
    revalider();
    revalidatePath("/coupe");
    return { ok: true, numero: f.numero };
  } catch (e) {
    return fail(e);
  }
}

export async function refuserRapport(id: number, motif: string): Promise<Result> {
  try {
    const moi = await magasin();
    await svc.refuserRapport(id, motif, moi);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enregistrerReglages(v: { montrerClient: boolean; delai: number }): Promise<Result> {
  try {
    const u = await assertUser();
    if (!["admin", "resp"].includes(userRole(u))) throw new Error("Réservé au responsable de production et à l'administrateur.");
    await svc.enregistrerReglagesSt(v);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
