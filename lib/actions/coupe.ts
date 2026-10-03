"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as av from "@/lib/domain/aval";
import * as cp from "@/lib/domain/coupe";
import { journaliser } from "@/lib/services/activite";
import { setSetting } from "@/lib/services/permissions";
import * as svc from "@/lib/services/coupe";

/* Module Coupe — écritures. Mêmes droits que l'ancienne saisie des lâchers
 * (production et magasin, voir lib/actions/aval → exigerAval). */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

async function exigerCoupe() {
  const user = await assertUser();
  const role = userRole(user);
  if (role !== "admin" && !av.ROLES_SAISIE_MAGASIN.includes(role)) throw new Error("Saisie de coupe réservée à la production et au magasin.");
  return { id: user.id, name: user.name, role };
}

const revalider = () => {
  for (const p of ["/coupe", "/commandes", "/magtissu", "/m/tissu", "/tracabilite", "/cockpit", "/archives"]) revalidatePath(p);
};

export async function validerFicheCoupe(input: svc.SaisieFiche): Promise<Result<{ numero: string; id: number }>> {
  try {
    const a = await exigerCoupe();
    const res = await svc.validerFiche(input, a.name);
    await journaliser("validation", "Coupe", `Fiche de coupe ${res.numero} validée`);
    revalider();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

export async function annulerFicheCoupe(id: number, motif: string): Promise<Result<{ numero: string }>> {
  try {
    const a = await exigerCoupe();
    const numero = await svc.annulerFiche(id, motif ?? "", a.name);
    await journaliser("modification", "Coupe", `Fiche de coupe ${numero} annulée — motif : ${motif}`);
    revalider();
    return { ok: true, numero };
  } catch (e) {
    return fail(e);
  }
}

export async function genererPvCoupe(ficheId: number): Promise<Result<{ numero: string; version: number }>> {
  try {
    const a = await exigerCoupe();
    const res = await svc.genererPv(ficheId, a.name);
    await journaliser("impression", "Coupe", `PV de coupe ${res.numero} v${res.version} généré`);
    revalider();
    return { ok: true, ...res };
  } catch (e) {
    return fail(e);
  }
}

/** Seuil d'écart (% par taille) au-delà duquel le motif est exigé. */
export async function majSeuilEcart(valeur: string): Promise<Result> {
  try {
    const user = await assertUser();
    if (!["admin", "resp"].includes(userRole(user))) return { ok: false, error: "Réservé aux administrateurs et responsables." };
    const n = Number(String(valeur).replace(",", "."));
    if (!Number.isFinite(n) || n < 0 || n > 50) return { ok: false, error: "Seuil entre 0 et 50 %." };
    await setSetting(cp.CLE_SEUIL_ECART, Math.round(n * 10) / 10);
    await journaliser("modification", "Coupe", `Seuil d'écart de coupe : ${n} %`);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
