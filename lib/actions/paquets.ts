"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as svc from "@/lib/services/paquets";

/* Suivi par paquets — actions.
 *
 * La TOURNÉE (relever une liasse, marquer un paquet assemblé) est réservée
 * aux rôles choisis dans le réglage : responsable de production, chef de
 * chaîne et administrateur par défaut. Les autres voient l'écran sans
 * pouvoir y écrire.
 *
 * Rien ici ne touche au comptage de la production. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const PATH = "/paquets";

/** Auteur autorisé à relever. Une seule règle, écran et tournée mobile. */
async function auteurTournee() {
  const u = await assertUser();
  const role = userRole(u);
  if (!(await svc.peutRelever(role))) {
    throw new Error("Votre rôle n'est pas autorisé à faire la tournée des paquets (réglage dans l'écran Suivi paquets).");
  }
  return { name: u.name as string, role };
}

export async function lirePaquet(code: string): Promise<Result<{ paquet: svc.PaquetVue }>> {
  try {
    await assertUser();
    const p = await svc.paquetParCode(code);
    if (!p) return { ok: false, error: `Paquet ${code} introuvable. Vérifiez le numéro imprimé sous le QR.` };
    return { ok: true, paquet: p };
  } catch (e) {
    return fail(e);
  }
}

export async function relever(input: {
  code: string;
  etape: "liasse" | "assemble" | "probleme";
  liasse?: string;
  qte?: string;
  note?: string;
  date?: string;
}): Promise<Result<{ paquet: svc.PaquetVue; message: string }>> {
  try {
    const a = await auteurTournee();
    const qte = (input.qte ?? "").trim() === "" ? null : Number(String(input.qte).replace(",", "."));
    const r = await svc.relever({ ...input, qte, par: a.name });
    revalidatePath(PATH);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function annulerReleve(releveId: number, motif: string): Promise<Result> {
  try {
    const a = await auteurTournee();
    await svc.annulerReleve(releveId, motif, a.name);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── réglages, gabarits, liasses d'un modèle ─────────── */

export async function enregistrerReglages(v: { actif?: boolean; roles?: string[] }): Promise<Result> {
  try {
    await assertUser();
    await svc.enregistrerReglagesPaquets(v);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enregistrerGabarit(v: { id?: number; nom: string; liasses: string[] }): Promise<Result<{ id: number }>> {
  try {
    const u = await assertUser();
    const id = await svc.enregistrerGabarit(v, u.name as string);
    revalidatePath(PATH);
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerGabarit(id: number): Promise<Result> {
  try {
    await assertUser();
    await svc.supprimerGabarit(id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enregistrerLiasses(commandeId: number, liasses: string[]): Promise<Result<{ liasses: string[] }>> {
  try {
    await assertUser();
    const l = await svc.enregistrerLiassesPlan(commandeId, liasses);
    revalidatePath(PATH);
    revalidatePath("/modelisme");
    return { ok: true, liasses: l };
  } catch (e) {
    return fail(e);
  }
}
