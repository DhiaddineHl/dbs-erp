"use server";

import { revalidatePath } from "next/cache";
import { assertModule, userRole } from "@/lib/auth/server";
/** Pages d'où ces actions s'utilisent : le rôle doit avoir au moins un de ces modules (Paramètres → Rôles). */
const MODULES = ["paquets", "gpao_prod"] as const;

import { auteurGpao } from "@/lib/auth/gpao";
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
  const u = await assertModule(...MODULES);
  const role = userRole(u);
  if (!(await svc.peutRelever(role))) {
    throw new Error("Votre rôle n'est pas autorisé à faire la tournée des paquets (réglage dans l'écran Suivi paquets).");
  }
  return { name: u.name as string, role };
}

export async function lirePaquet(code: string): Promise<Result<{ paquet: svc.PaquetVue }>> {
  try {
    await assertModule(...MODULES);
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

/** Réglages du suivi : responsable de production et administrateur
 * seulement (avant, tout compte connecté pouvait les changer). */
async function regleur() {
  const u = await assertModule(...MODULES);
  const role = userRole(u);
  if (!["admin", "resp"].includes(role)) throw new Error("Réservé au responsable de production et à l'administrateur.");
  return { name: u.name as string, role };
}

export async function enregistrerReglages(v: { actif?: boolean; roles?: string[] }): Promise<Result> {
  try {
    await regleur();
    await svc.enregistrerReglagesPaquets(v);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enregistrerGabarit(v: { id?: number; nom: string; liasses: string[] }): Promise<Result<{ id: number }>> {
  try {
    const u = await regleur();
    const id = await svc.enregistrerGabarit(v, u.name);
    revalidatePath(PATH);
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerGabarit(id: number): Promise<Result> {
  try {
    await regleur();
    await svc.supprimerGabarit(id);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function enregistrerLiasses(commandeId: number, liasses: string[]): Promise<Result<{ liasses: string[] }>> {
  try {
    await regleur();
    const l = await svc.enregistrerLiassesPlan(commandeId, liasses);
    revalidatePath(PATH);
    revalidatePath("/modelisme");
    return { ok: true, liasses: l };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── « fini au poste » : le scan dans la saisie horaire ─────────── */

/** Le scan de l'agent : ce morceau est fini à ce poste, par cette ouvrière,
 * dans cette heure. Peut répondre « choisissez » (OF, morceau ou poste). */
export async function finirAuPoste(input: {
  journeeId: number;
  ouvId: number;
  col: string;
  scan: string;
  code?: string;
  morceau?: string;
  poste?: string;
}): Promise<Result<{ passage?: svc.PassageVue; besoin?: svc.BesoinChoix }>> {
  try {
    const a = await auteurGpao();
    const r = await svc.finirAuPoste({ ...input, par: a.name });
    return "passage" in r ? { ok: true, passage: r.passage } : { ok: true, besoin: r };
  } catch (e) {
    return fail(e);
  }
}

export async function passagesJournee(journeeId: number): Promise<Result<{ passages: svc.PassageVue[] }>> {
  try {
    await auteurGpao();
    return { ok: true, passages: await svc.passagesDeJournee(journeeId) };
  } catch (e) {
    return fail(e);
  }
}

export async function annulerPassage(releveId: number, motif: string): Promise<Result> {
  try {
    const a = await auteurGpao();
    await svc.annulerPassage(releveId, motif, a.name);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── corrections tracées (coupe, responsable) ─────────── */

export async function corrigerQuantitePaquet(paquetId: number, qte: string, motif: string): Promise<Result> {
  try {
    const a = await auteurTournee();
    await svc.corrigerQuantite(paquetId, Number(String(qte).trim()), motif, a.name);
    revalidatePath(PATH);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function ajouterMorceau(commandeId: number, nom: string): Promise<Result<{ n: number }>> {
  try {
    await auteurTournee();
    const n = await svc.ajouterMorceau(commandeId, nom);
    revalidatePath(PATH);
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

export async function annulerMorceau(commandeId: number, nom: string): Promise<Result<{ n: number }>> {
  try {
    await auteurTournee();
    const n = await svc.annulerMorceau(commandeId, nom);
    revalidatePath(PATH);
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

/** Fiche validée avant l'activation du suivi : ses paquets, après coup. */
export async function creerPaquetsApresCoup(ficheId: number): Promise<Result<{ n: number }>> {
  try {
    const a = await regleur();
    const n = await svc.creerPaquetsApresCoup(ficheId, a.name);
    revalidatePath(PATH);
    return { ok: true, n };
  } catch (e) {
    return fail(e);
  }
}

/** « Qui a fait ce paquet ? » — tout son journal, à partir de l'étiquette. */
export async function historique(code: string): Promise<
  Result<{ paquet: NonNullable<Awaited<ReturnType<typeof svc.historiquePaquet>>>["paquet"]; lignes: NonNullable<Awaited<ReturnType<typeof svc.historiquePaquet>>>["lignes"] }>
> {
  try {
    await assertModule(...MODULES);
    const h = await svc.historiquePaquet(code);
    if (!h) return { ok: false, error: "Paquet introuvable : vérifiez l'étiquette (PQ-AAAA-NNNNNN)." };
    return { ok: true, ...h };
  } catch (e) {
    return fail(e);
  }
}
