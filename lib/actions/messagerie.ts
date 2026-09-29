"use server";

import { revalidatePath } from "next/cache";
import { assertUser } from "@/lib/auth/server";
import * as svc from "@/lib/services/messagerie";

/* Messagerie interne — actions. Tout compte connecté peut écrire ; les
 * contrôles d'appartenance sont dans le service (lib/services/messagerie). */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

async function moi(): Promise<svc.Moi> {
  const u = await assertUser();
  return { id: u.id, nom: u.name as string };
}

export async function listeDiscussions(): Promise<Result<{ conversations: svc.ConversationResume[] }>> {
  try {
    return { ok: true, conversations: await svc.listConversations(await moi()) };
  } catch (e) {
    return fail(e);
  }
}

/** Ouvre une discussion et marque ses messages comme lus. */
export async function ouvrirDiscussion(id: number, avant?: number): Promise<Result<{ vue: svc.ConversationVue }>> {
  try {
    const m = await moi();
    if (avant == null) await svc.marquerLu(id, m);
    return { ok: true, vue: await svc.ouvrirConversation(id, m, avant) };
  } catch (e) {
    return fail(e);
  }
}

export async function marquerLu(id: number): Promise<Result> {
  try {
    await svc.marquerLu(id, await moi());
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function envoyerMessage(
  id: number,
  contenu: { texte?: string; fichier?: { hash: string; nom: string; mime: string; taille: number } | null; commandeId?: number | null },
): Promise<Result<{ messageId: number }>> {
  try {
    const messageId = await svc.envoyer(id, await moi(), contenu);
    return { ok: true, messageId };
  } catch (e) {
    return fail(e);
  }
}

export async function discussionAvec(userId: string): Promise<Result<{ id: number }>> {
  try {
    return { ok: true, id: await svc.discussionAvec(await moi(), userId) };
  } catch (e) {
    return fail(e);
  }
}

export async function creerGroupe(nom: string, membres: string[]): Promise<Result<{ id: number }>> {
  try {
    const id = await svc.creerGroupe(await moi(), nom, membres);
    revalidatePath("/messagerie");
    return { ok: true, id };
  } catch (e) {
    return fail(e);
  }
}

export async function modifierGroupe(id: number, v: { nom?: string; ajouter?: string[]; retirer?: string[] }): Promise<Result> {
  try {
    await svc.majGroupe(id, await moi(), v);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function quitterGroupe(id: number): Promise<Result> {
  try {
    await svc.quitterGroupe(id, await moi());
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerMessage(messageId: number): Promise<Result> {
  try {
    await svc.supprimerMessage(messageId, await moi());
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function chercherCommandes(q: string): Promise<Result<{ commandes: { id: number; of: string; modele: string }[] }>> {
  try {
    await moi();
    return { ok: true, commandes: q.trim().length < 2 ? [] : await svc.commandesACiter(q) };
  } catch (e) {
    return fail(e);
  }
}
