"use server";

import * as acc from "@/lib/services/portail-acces";
import * as svc from "@/lib/services/portail-soustraitant";
import { enregistrerFichier } from "@/lib/services/fichiers";
import type { Cumuls, Ligne } from "@/lib/domain/soustraitant";
import type { ConstatsCoupe } from "@/lib/domain/pv-client";

/* Actions du PORTAIL SOUS-TRAITANT — sans compte. Chaque appel revérifie la
 * clé du lien ET le PIN mémorisé sur le téléphone, puis que la commande est
 * bien confiée à CET atelier. Rien ici n'écrit la production. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const acces = (cle: string) => acc.accesAutorise(cle, "soustraitant");

export async function entrerPin(cle: string, pin: string): Promise<Result> {
  try {
    return await acc.entrerPin(cle, "soustraitant", pin);
  } catch (e) {
    return fail(e);
  }
}

export async function declarer(cle: string, commandeId: number, cumuls: Cumuls, note: string): Promise<Result<{ alertes: string[] }>> {
  try {
    const r = await svc.declarer(await acces(cle), commandeId, cumuls, note);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function annoncerLivraison(cle: string, commandeId: number, lignes: Ligne[], motif: string, note: string): Promise<Result<{ numero: string }>> {
  try {
    const r = await svc.annoncerLivraison(await acces(cle), commandeId, lignes, motif, note);
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function annulerLivraison(cle: string, numero: string): Promise<Result> {
  try {
    await svc.annulerLivraison(await acces(cle), numero);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function confirmerTissu(cle: string, mouvementIds: number[], etat: string, metrage: number | null, note: string): Promise<Result> {
  try {
    await svc.confirmerTissu(await acces(cle), mouvementIds, etat, metrage, note);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function contexteRapport(cle: string, commandeId: number): Promise<Result<{ contexte: Awaited<ReturnType<typeof svc.contexteRapport>> }>> {
  try {
    return { ok: true, contexte: await svc.contexteRapport(await acces(cle), commandeId) };
  } catch (e) {
    return fail(e);
  }
}

export async function envoyerRapport(
  cle: string,
  commandeId: number,
  coupe: Record<string, Record<string, number>>,
  rouleaux: { code: string; consomme: number; chute: number; reste: number }[],
  note: string,
  constats?: Partial<ConstatsCoupe>,
): Promise<Result> {
  try {
    await svc.envoyerRapport(await acces(cle), commandeId, coupe, rouleaux, note, constats);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** « Un problème » : texte + photo facultative (FormData : cle, commandeId, texte, photo). */
export async function signalerProbleme(form: FormData): Promise<Result> {
  try {
    const a = await acces(String(form.get("cle") ?? ""));
    const commandeId = Number(form.get("commandeId")) || null;
    const photo = form.get("photo");
    let fichier: { hash: string; nom: string; mime: string; taille: number } | null = null;
    if (photo instanceof File && photo.size > 0) {
      const f = await enregistrerFichier(Buffer.from(await photo.arrayBuffer()), photo.type, {
        mimes: new Set(["image/jpeg", "image/png", "image/webp"]),
        libelle: "une photo JPEG, PNG ou WebP",
      });
      fichier = { hash: f.hash, nom: photo.name || "photo.jpg", mime: f.mime, taille: f.taille };
    }
    await svc.signalerProbleme(a, commandeId, String(form.get("texte") ?? ""), fichier);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
