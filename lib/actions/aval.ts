"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as av from "@/lib/domain/aval";
import * as svc from "@/lib/services/aval";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

async function exigerAval() {
  const user = await assertUser();
  const role = userRole(user);
  if (role !== "admin" && !PRODUCTION.includes(role)) {
    throw new Error("Saisie réservée à la production et au magasin");
  }
  return { id: user.id, name: user.name, role };
}

function revalider() {
  for (const p of ["/br", "/magasin", "/bl", "/commandes", "/archives", "/tracabilite", "/prevexport", "/cockpit"]) {
    revalidatePath(p);
  }
}

const entier = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/* ─────────── réception sous-traitance ─────────── */

/** Aperçu des contrôles de cohérence, avant enregistrement. */
export async function verifierReception(
  commandeId: number,
  qteRecue: number,
  qteOk: number,
  qteNc: number,
): Promise<Result<av.AlerteReception[]>> {
  try {
    await exigerAval();
    const ctx = await svc.contexteReception(commandeId);
    if (!ctx) return { ok: false, error: "Commande introuvable" };
    return ok(av.verifierReception({ ...ctx, qteRecue, qteOk, qteNc }));
  } catch (e) {
    return fail(e);
  }
}

export async function creerBr(v: {
  commandeId: number;
  date: string;
  qteRecue: string | number;
  qteOk: string | number;
  qteNc: string | number;
  controle: string;
  note?: string;
  /** Passe outre les avertissements non bloquants (surproduction déclarée). */
  forcer?: boolean;
}): Promise<Result<{ numero: string; alertes: av.AlerteReception[] }>> {
  try {
    await exigerAval();
    const qteRecue = entier(v.qteRecue);
    const qteOk = entier(v.qteOk) || qteRecue;
    const qteNc = entier(v.qteNc);
    if (!v.date) return { ok: false, error: "Renseignez la date de réception" };
    if (qteRecue <= 0) return { ok: false, error: "La quantité reçue doit être supérieure à zéro" };

    const ctx = await svc.contexteReception(v.commandeId);
    if (!ctx) return { ok: false, error: "Commande introuvable" };
    const alertes = av.verifierReception({ ...ctx, qteRecue, qteOk, qteNc });

    if (av.receptionBloquee(alertes)) {
      return { ok: false, error: alertes.find((a) => a.niveau === "bloquant")!.message };
    }
    // Les avertissements demandent une confirmation explicite de l'opérateur.
    if (!v.forcer && alertes.some((a) => a.niveau === "warn")) {
      return { ok: false, error: alertes.find((a) => a.niveau === "warn")!.message };
    }

    const r = await svc.creerBr({
      commandeId: v.commandeId, date: v.date, qteRecue, qteOk, qteNc,
      controle: v.controle, note: v.note ?? "",
    });
    await journaliser("creation", "Réception ST", `${r.numero} — ${qteOk} conformes, ${qteNc} NC`);
    revalider();
    return ok({ numero: r.numero, alertes });
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerBr(id: number): Promise<Result> {
  try {
    await exigerAval();
    await svc.supprimerBr(id);
    await journaliser("suppression", "Réception ST", `bon de réception id ${id}`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── coupe ─────────── */

export async function ajouterCoupe(v: {
  commandeId: number;
  date: string;
  qte: string | number;
  taille?: string;
  type?: string;
  note?: string;
}): Promise<Result> {
  try {
    await exigerAval();
    const qte = entier(v.qte);
    if (qte <= 0) return { ok: false, error: "La quantité coupée doit être supérieure à zéro" };
    await svc.ajouterCoupe({
      commandeId: v.commandeId, date: v.date, qte,
      taille: v.taille ?? "", type: v.type ?? "interne", note: v.note ?? "",
    });
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerCoupe(id: number): Promise<Result> {
  try {
    await exigerAval();
    await svc.supprimerCoupe(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── magasin ─────────── */

export async function receptionMagasin(v: {
  commandeId: number;
  date: string;
  qte: string | number;
  note?: string;
}): Promise<Result> {
  try {
    await exigerAval();
    const qte = entier(v.qte);
    if (qte <= 0) return { ok: false, error: "La quantité reçue doit être supérieure à zéro" };
    await svc.receptionMagasin({ commandeId: v.commandeId, date: v.date, qte, note: v.note ?? "" });
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerMouvementMagasin(id: number): Promise<Result> {
  try {
    await exigerAval();
    await svc.supprimerMouvementMagasin(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function marquerPrepare(commandeId: number, prepare: boolean): Promise<Result> {
  try {
    await exigerAval();
    await svc.marquerPrepare(commandeId, prepare);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function marquerExpedie(commandeId: number, expedie: boolean): Promise<Result> {
  try {
    await exigerAval();
    await svc.marquerExpedie(commandeId, expedie);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── bons de livraison ─────────── */

export async function creerBl(v: {
  date: string;
  clientId: number | null;
  clientNom: string;
  transporteur?: string;
  adresseLivraison?: string;
  note?: string;
  lignes: { commandeId: number; qteLivree: number }[];
}): Promise<Result<{ id: number; numero: string }>> {
  try {
    await exigerAval();
    if (!v.date) return { ok: false, error: "Renseignez la date du bon de livraison" };
    if (!v.clientNom) return { ok: false, error: "Choisissez un client" };
    const lignes = v.lignes.filter((l) => l.qteLivree > 0);
    if (!lignes.length) return { ok: false, error: "Sélectionnez au moins une commande" };

    const r = await svc.creerBl({
      date: v.date, clientId: v.clientId, clientNom: v.clientNom,
      transporteur: v.transporteur ?? "", adresseLivraison: v.adresseLivraison ?? "",
      note: v.note ?? "", lignes,
    });
    await journaliser("creation", "Bons de livraison", `${r.numero} — ${v.clientNom}, ${lignes.length} ligne(s)`);
    revalider();
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}

export async function majStatutBl(id: number, statut: string): Promise<Result> {
  try {
    await exigerAval();
    await svc.majStatutBl(id, statut);
    await journaliser("modification", "Bons de livraison", `BL id ${id} → ${statut}`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerBl(id: number): Promise<Result> {
  try {
    await exigerAval();
    await svc.supprimerBl(id);
    await journaliser("suppression", "Bons de livraison", `BL id ${id}`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── rapprochement facturation ─────────── */

/** Aperçu : ce que le rapprochement changerait, sans rien écrire. */
export async function apercuRapprochement(): Promise<Result<svc.ResultatRapprochement>> {
  try {
    await exigerAval();
    return ok(await svc.rapprocherFacturation(false));
  } catch (e) {
    return fail(e);
  }
}

export async function appliquerRapprochement(): Promise<Result<svc.ResultatRapprochement>> {
  try {
    await exigerAval();
    const r = await svc.rapprocherFacturation(true);
    await journaliser(
      "validation",
      "Rapprochement facturation",
      `${r.affectations.length} commande(s) mise(s) à jour, ${r.archivees} archivée(s)`,
    );
    revalider();
    revalidatePath("/factures");
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── archives ─────────── */

export async function desarchiver(ids: number[]): Promise<Result> {
  try {
    await exigerAval();
    await svc.desarchiver(ids);
    await journaliser("modification", "Archives", `${ids.length} commande(s) désarchivée(s)`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── prévision export ─────────── */

export async function majPrevisionExport(commandeId: number, date: string): Promise<Result> {
  try {
    await exigerAval();
    await svc.majPrevisionExport(commandeId, date || null);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majStatutLogistique(commandeId: number, statut: string): Promise<Result> {
  try {
    await exigerAval();
    if (!av.estStatutLogistique(statut)) return { ok: false, error: "Statut logistique inconnu" };
    await svc.majStatutLogistique(commandeId, statut);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}
