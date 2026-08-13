"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as at from "@/lib/domain/atelier";
import * as svc from "@/lib/services/atelier";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/** L'atelier est tenu par la production ; l'admin passe partout. */
const ATELIER = ["admin", "resp", "chef"];

async function exigerAtelier() {
  const user = await assertUser();
  const role = userRole(user);
  if (!ATELIER.includes(role)) throw new Error("Saisie réservée à la direction de production");
  return user;
}

function revalider() {
  for (const p of ["/personnel", "/operations", "/qrouv", "/gpao_prod"]) revalidatePath(p);
}

const entier = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? Math.max(0, Math.round(n)) : 0;
};

/* ─────────── personnel ─────────── */

export async function creerPersonne(v: {
  matricule: string;
  nom: string;
  fonction?: string;
  atelier?: string;
  statut?: string;
  dateEntree?: string;
}): Promise<Result> {
  try {
    await exigerAtelier();
    const matricule = v.matricule.trim();
    const nom = v.nom.trim();
    if (!matricule) return { ok: false, error: "Le matricule est obligatoire" };
    if (!nom) return { ok: false, error: "Le nom est obligatoire" };
    const statut = v.statut && at.estStatutPersonnel(v.statut) ? v.statut : "active";

    await svc.creerPersonne({
      matricule, nom, fonction: v.fonction?.trim() ?? "", atelier: v.atelier?.trim() ?? "",
      statut, dateEntree: v.dateEntree || null,
    });
    await journaliser("creation", "Personnel", `${matricule} · ${nom}`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majPersonne(
  id: number,
  patch: { matricule?: string; nom?: string; fonction?: string; atelier?: string; statut?: string; dateEntree?: string },
): Promise<Result> {
  try {
    await exigerAtelier();
    const out: Record<string, unknown> = {};
    if (patch.matricule !== undefined) {
      if (!patch.matricule.trim()) return { ok: false, error: "Le matricule ne peut pas être vide" };
      out.matricule = patch.matricule.trim();
    }
    if (patch.nom !== undefined) {
      if (!patch.nom.trim()) return { ok: false, error: "Le nom ne peut pas être vide" };
      out.nom = patch.nom.trim();
    }
    if (patch.fonction !== undefined) out.fonction = patch.fonction.trim();
    if (patch.atelier !== undefined) out.atelier = patch.atelier.trim();
    if (patch.statut !== undefined) {
      if (!at.estStatutPersonnel(patch.statut)) return { ok: false, error: "Statut inconnu" };
      out.statut = patch.statut;
    }
    if (patch.dateEntree !== undefined) out.dateEntree = patch.dateEntree || null;

    await svc.majPersonne(id, out);
    await journaliser("modification", "Personnel", Object.keys(out).join(", "));
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerPersonne(id: number): Promise<Result> {
  try {
    await exigerAtelier();
    await svc.supprimerPersonne(id);
    await journaliser("suppression", "Personnel", `id ${id}`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function regenererCle(id: number): Promise<Result> {
  try {
    await exigerAtelier();
    await svc.regenererCle(id);
    await journaliser("modification", "Personnel", `nouvelle clé de portail (id ${id}) — anciens QR invalidés`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── rattachement ─────────── */

export async function rattacher(ouvriereId: number, personnelId: number | null): Promise<Result> {
  try {
    await exigerAtelier();
    await svc.rattacher(ouvriereId, personnelId);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function rattacherAuto(): Promise<Result<{ lies: number; restants: number }>> {
  try {
    await exigerAtelier();
    const r = await svc.rattacherAuto();
    await journaliser("modification", "Personnel", `rapprochement automatique : ${r.lies} lien(s)`);
    revalider();
    return ok(r);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── opérations ─────────── */

export async function creerOperation(v: { nom: string; sam: string | number }): Promise<Result> {
  try {
    await exigerAtelier();
    const nom = v.nom.trim();
    if (!nom) return { ok: false, error: "Le libellé est obligatoire" };
    await svc.creerOperation({ nom, sam: entier(v.sam) });
    await journaliser("creation", "Opérations", nom);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majOperation(
  id: number,
  patch: { nom?: string; sam?: string | number; archive?: boolean },
): Promise<Result> {
  try {
    await exigerAtelier();
    const out: Record<string, unknown> = {};
    if (patch.nom !== undefined) {
      if (!patch.nom.trim()) return { ok: false, error: "Le libellé ne peut pas être vide" };
      out.nom = patch.nom.trim();
    }
    if (patch.sam !== undefined) out.sam = entier(patch.sam);
    if (patch.archive !== undefined) out.archive = patch.archive;
    await svc.majOperation(id, out);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerOperations(ids: number[]): Promise<Result> {
  try {
    await exigerAtelier();
    await svc.supprimerOperations(ids);
    await journaliser("suppression", "Opérations", `${ids.length} ligne(s)`);
    revalider();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function fusionnerOperations(gardeeId: number, autresIds: number[]): Promise<Result<number>> {
  try {
    await exigerAtelier();
    const n = await svc.fusionnerOperations(gardeeId, autresIds);
    await journaliser("modification", "Opérations", `${n} doublon(s) archivé(s)`);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}
