"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import { enregistrerFichier } from "@/lib/services/fichiers";
import * as svc from "@/lib/services/qc";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

const CONTROLE = ["admin", "resp", "chef", "qualitycontrol"];

/** Le contrôle qualité est saisi par la qualité, la direction et la production. */
async function exigerControle(): Promise<svc.Auteur> {
  const user = await assertUser();
  const role = userRole(user);
  if (role !== "admin" && !CONTROLE.includes(role)) {
    throw new Error("Saisie réservée au contrôle qualité");
  }
  return { id: user.id, name: user.name, role };
}

function revalider() {
  revalidatePath("/qc");
  revalidatePath("/qrqc");
  revalidatePath("/cockpit");
}

/** Une inspection clôturée est un document : elle ne se modifie plus. */
async function exigerBrouillon(inspectionId: number) {
  const insp = await svc.getInspection(inspectionId);
  if (!insp) throw new Error("Inspection introuvable");
  if (insp.statut === "cloture") throw new Error("Inspection clôturée — rouvrez-la pour la modifier");
  return insp;
}

/* ─────────── inspection ─────────── */

export async function creerInspection(): Promise<Result<number>> {
  try {
    const auteur = await exigerControle();
    const id = await svc.creerInspection(auteur);
    revalider();
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function majInspection(id: number, champ: svc.ChampInspection, valeur: string): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(id);
    await svc.majInspection(id, champ, valeur);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function lierCommande(id: number, commandeId: number | null): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(id);
    await svc.lierCommande(id, commandeId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerInspection(id: number): Promise<Result> {
  try {
    await exigerControle();
    await svc.supprimerInspection(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── défauts ─────────── */

export async function ajouterDefaut(inspectionId: number, famille: string): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.ajouterDefaut(inspectionId, famille);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majDefaut(
  inspectionId: number,
  defautId: number,
  champ: "description" | "gravite" | "nombre",
  valeur: string,
): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.majDefaut(defautId, champ, valeur);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerDefaut(inspectionId: number, defautId: number): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.supprimerDefaut(defautId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── mesures ─────────── */

export async function ajouterMesure(inspectionId: number): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.ajouterMesure(inspectionId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majMesure(
  inspectionId: number,
  mesureId: number,
  champ: "point" | "taille" | "spec" | "tolerance" | "mesure",
  valeur: string,
): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.majMesure(mesureId, champ, valeur);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerMesure(inspectionId: number, mesureId: number): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.supprimerMesure(mesureId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function chargerBareme(inspectionId: number, baremeId: number, taille: string): Promise<Result<number>> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    const n = await svc.chargerBareme(inspectionId, baremeId, taille);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── photos ─────────── */

export async function televerserPhoto(formData: FormData): Promise<Result<{ hash: string }>> {
  try {
    await exigerControle();
    const inspectionId = Number(formData.get("inspectionId"));
    const brut = formData.get("defautId");
    const defautId = brut && brut !== "" ? Number(brut) : null;
    const f = formData.get("fichier");
    if (!(f instanceof File)) return { ok: false, error: "Aucun fichier fourni" };

    await exigerBrouillon(inspectionId);
    const { hash } = await enregistrerFichier(Buffer.from(await f.arrayBuffer()), f.type);
    await svc.attacherPhoto(inspectionId, hash, defautId);
    revalider();
    return ok({ hash });
  } catch (e) {
    return fail(e);
  }
}

export async function retirerPhoto(inspectionId: number, photoId: number): Promise<Result> {
  try {
    await exigerControle();
    await exigerBrouillon(inspectionId);
    await svc.detacherPhoto(photoId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── cycle de vie ─────────── */

export async function cloturer(id: number): Promise<Result<{ verdict: string; qrqcCree: boolean }>> {
  try {
    const auteur = await exigerControle();
    const r = await svc.cloturer(id, auteur);
    await journaliser(
      "validation",
      "Contrôle qualité",
      `inspection ${id} clôturée — verdict ${r.verdict}${r.qrqcCree ? " · QRQC ouvert" : ""}`,
    );
    revalider();
    return ok({ verdict: r.verdict, qrqcCree: r.qrqcCree });
  } catch (e) {
    return fail(e);
  }
}

export async function rouvrir(id: number): Promise<Result> {
  try {
    await exigerControle();
    await svc.rouvrir(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function creerRecontrole(id: number): Promise<Result<number>> {
  try {
    const auteur = await exigerControle();
    const nouveau = await svc.creerRecontrole(id, auteur);
    revalider();
    return ok(nouveau);
  } catch (e) {
    return fail(e);
  }
}

export async function dupliquer(id: number): Promise<Result<number>> {
  try {
    const auteur = await exigerControle();
    const copie = await svc.dupliquer(id, auteur);
    revalider();
    return ok(copie);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── barèmes ─────────── */

export async function creerBareme(nom: string): Promise<Result<number>> {
  try {
    await exigerControle();
    const propre = nom.trim();
    if (!propre) return { ok: false, error: "Donnez un nom au barème" };
    const id = await svc.creerBareme(propre);
    revalider();
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function majBareme(
  id: number,
  patch: { nom?: string; client?: string; refs?: string[]; tailles?: string[] },
): Promise<Result> {
  try {
    await exigerControle();
    await svc.majBareme(id, patch);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerBareme(id: number): Promise<Result> {
  try {
    await exigerControle();
    await svc.supprimerBareme(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function ajouterPointBareme(baremeId: number, label: string): Promise<Result> {
  try {
    await exigerControle();
    await svc.ajouterPointBareme(baremeId, label.trim() || "Nouveau point");
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majPointBareme(
  id: number,
  patch: { label?: string; tolerance?: number; valeurs?: Record<string, number> },
): Promise<Result> {
  try {
    await exigerControle();
    await svc.majPointBareme(id, patch);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerPointBareme(id: number): Promise<Result> {
  try {
    await exigerControle();
    await svc.supprimerPointBareme(id);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}
