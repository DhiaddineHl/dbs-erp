"use server";

import * as acc from "@/lib/services/portail-acces";
import * as svc from "@/lib/services/portail-client";
import { majTds } from "@/lib/services/preparation";
import { messageExterieur } from "@/lib/services/messagerie";
import * as pt from "@/lib/domain/portail";

/* Actions du PORTAIL CLIENT — sans compte. Chaque appel revérifie la clé du
 * lien ET le PIN mémorisé sur le téléphone : une action ne fait confiance à
 * rien de ce que la page lui envoie d'autre. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const auteurDe = (a: acc.Acces) => ({ id: "", name: `Client · ${a.nom}`, role: "portail" });

export async function entrerPin(cle: string, pin: string): Promise<Result> {
  try {
    return await acc.entrerPin(cle, "client", pin);
  } catch (e) {
    return fail(e);
  }
}

export async function passeport(cle: string, commandeId: number): Promise<Result<{ passeport: svc.PasseportClient }>> {
  try {
    const a = await acc.accesAutorise(cle, "client");
    const p = await svc.passeportCommande(a.clientId ?? -1, commandeId);
    if (!p) return { ok: false, error: "Commande introuvable." };
    return { ok: true, passeport: p };
  } catch (e) {
    return fail(e);
  }
}

/** Le client répond à un envoi (tête de série, pièces pour l'OK livraison). */
export async function repondreEchantillon(cle: string, envoiId: number, verdict: "ok" | "refus", commentaire: string): Promise<Result> {
  try {
    const a = await acc.accesAutorise(cle, "client");
    if (verdict !== "ok" && verdict !== "refus") return { ok: false, error: "Réponse inconnue." };
    const e = await svc.envoiDuClient(a.clientId ?? -1, envoiId);
    if (!e) return { ok: false, error: "Envoi introuvable." };
    if (e.verdict !== "attente") return { ok: false, error: "Une réponse a déjà été donnée pour cet envoi." };
    if (verdict === "refus" && !commentaire.trim()) return { ok: false, error: "Dites en quelques mots ce qui ne va pas." };
    const auteur = auteurDe(a);
    if (commentaire.trim()) await majTds(envoiId, "commentaire", commentaire.trim().slice(0, 1000), auteur);
    await majTds(envoiId, "verdict", verdict, auteur);
    const quoi = e.nature === "ok" ? `pièces pour l'OK livraison ${e.n}` : `tête de série ${e.n}`;
    await acc.journal(a.id, "echantillon", e.commandeId, `${verdict === "ok" ? "OK" : "Refus"} — ${quoi}${commentaire.trim() ? ` : ${commentaire.trim()}` : ""}`);
    if (a.conversationId) {
      await messageExterieur(
        a.conversationId,
        a.nom,
        `${verdict === "ok" ? "✅ OK" : "❌ Refusé"} pour ${quoi}${commentaire.trim() ? ` — « ${commentaire.trim()} »` : ""}`,
        e.commandeId,
      );
    }
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Une question, rattachée (ou non) à une commande : elle arrive dans la
 * Messagerie, avec l'OF déjà indiqué. */
export async function poserQuestion(cle: string, texte: string, commandeId: number | null): Promise<Result> {
  try {
    const a = await acc.accesAutorise(cle, "client");
    if (!a.conversationId) return { ok: false, error: "Messagerie indisponible pour cet accès." };
    const t = (texte ?? "").trim();
    if (t.length < 2) return { ok: false, error: "Écrivez votre question." };
    const cmd = commandeId ? await svc.commandeDuClient(a.clientId ?? -1, commandeId) : null;
    if (commandeId && !cmd) return { ok: false, error: "Commande introuvable." };
    await messageExterieur(a.conversationId, a.nom, t.slice(0, 2000), cmd?.id ?? null);
    await acc.journal(a.id, "question", cmd?.id ?? null, t.slice(0, 200));
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Une décision en un clic (tissu manquant, reste de tissu). */
export async function decider(cle: string, decision: string, sujet: string, commandeId: number | null): Promise<Result> {
  try {
    const a = await acc.accesAutorise(cle, "client");
    if (!pt.estDecision(decision)) return { ok: false, error: "Décision inconnue." };
    const cmd = commandeId ? await svc.commandeDuClient(a.clientId ?? -1, commandeId) : null;
    const texte = `🖱 ${pt.DECISIONS[decision]}${sujet ? ` — ${sujet.slice(0, 200)}` : ""}`;
    await acc.journal(a.id, "decision", cmd?.id ?? null, texte);
    if (a.conversationId) await messageExterieur(a.conversationId, a.nom, texte, cmd?.id ?? null);
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
