"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as fx from "@/lib/domain/feux";
import * as fo from "@/lib/domain/fournitures";
import { journaliser } from "@/lib/services/activite";
import { getRoleModules, setSetting } from "@/lib/services/permissions";
import * as svc from "@/lib/services/fournitures";

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });

function revalider() {
  for (const p of ["/magfour", "/magfour/nomenclature", "/magfour/reception", "/magfour/restes", "/magfour/manques", "/dt", "/cockpit", "/alertes"]) {
    revalidatePath(p);
  }
}

/** Mêmes droits que l'écran Magasin fournitures (rôle ou module ouvert). */
async function exigerFour() {
  const user = await assertUser();
  const role = userRole(user);
  let autorise = fx.peutModifier("four", role);
  if (!autorise) autorise = (await getRoleModules(role)).magfour === true;
  if (!autorise) throw new Error(`Modification réservée à ${fx.RESPONSABLE_DOMAINE.four}`);
  return { id: user.id, name: user.name, role };
}

const nombre = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/* ─────────── nomenclature par modèle ─────────── */

export async function ajouterLigneNomenclature(cle: string, label: string, v: { designation?: string; qteParPiece?: string; unite?: string; cassePct?: string; origine?: string; fournisseur?: string }): Promise<Result<{ synchronisees: number }>> {
  try {
    const a = await exigerFour();
    await svc.ajouterLigneNomenclature(cle, label, {
      designation: v.designation ?? "",
      qteParPiece: Math.max(0, nombre(v.qteParPiece ?? 0)),
      unite: v.unite || "pcs",
      cassePct: Math.max(0, nombre(v.cassePct ?? 0)),
      origine: fo.origineFourniture(v.origine ?? "client"),
      fournisseur: v.fournisseur ?? "",
    });
    const n = await svc.synchroniserModele(cle, a);
    revalider();
    return { ok: true, synchronisees: n };
  } catch (e) {
    return fail(e);
  }
}

export async function majLigneNomenclature(id: number, champ: svc.ChampNomenclature, valeur: string): Promise<Result<{ synchronisees: number }>> {
  try {
    const a = await exigerFour();
    const cle = await svc.majLigneNomenclature(id, champ, valeur);
    const n = await svc.synchroniserModele(cle, a);
    revalider();
    return { ok: true, synchronisees: n };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerLigneNomenclature(id: number): Promise<Result> {
  try {
    await exigerFour();
    await svc.supprimerLigneNomenclature(id);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function copierNomenclature(source: string, cible: string, labelCible: string): Promise<Result<{ synchronisees: number }>> {
  try {
    const a = await exigerFour();
    await svc.copierNomenclature(source, cible, labelCible);
    const n = await svc.synchroniserModele(cible, a);
    revalider();
    return { ok: true, synchronisees: n };
  } catch (e) {
    return fail(e);
  }
}

/** Depuis la fiche commande : (re)calculer le prévu depuis la nomenclature. */
export async function appliquerNomenclature(commandeId: number): Promise<Result<{ synchronisees: number }>> {
  try {
    const a = await exigerFour();
    const n = await svc.synchroniserCommande(commandeId, a);
    revalider();
    return { ok: true, synchronisees: n };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── réception par bon client ─────────── */

export async function creerReceptionFournitures(v: {
  date: string;
  client: string;
  blClient: string;
  note: string;
  lignes: { ligneId: number; qte: string }[];
}): Promise<Result<{ id: number; numero: string }>> {
  try {
    const a = await exigerFour();
    const r = await svc.creerReceptionFournitures(
      { ...v, lignes: v.lignes.map((l) => ({ ligneId: l.ligneId, qte: Math.max(0, nombre(l.qte)) })) },
      a,
    );
    await journaliser("creation", "Magasin fournitures", `bon ${r.numero} — ${v.client}${v.blClient ? ` · BL ${v.blClient}` : ""}`);
    revalider();
    return { ok: true, ...r };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerReceptionFournitures(id: number): Promise<Result> {
  try {
    const a = await exigerFour();
    await svc.supprimerReceptionFournitures(id, a);
    await journaliser("suppression", "Magasin fournitures", `bon de réception fournitures id ${id}`);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── restes ─────────── */

export async function mettreEnReste(ligneId: number): Promise<Result> {
  try {
    const a = await exigerFour();
    await svc.mettreEnReste(ligneId, a);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function creerReste(v: { client: string; designation: string; unite: string; qte: string; origineOf: string; note: string }): Promise<Result> {
  try {
    await exigerFour();
    await svc.creerReste({ ...v, qte: nombre(v.qte) });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function reutiliserReste(resteId: number, ligneId: number, qte: string): Promise<Result> {
  try {
    const a = await exigerFour();
    await svc.reutiliserReste(resteId, ligneId, nombre(qte), a);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function rendreRestes(ids: number[]): Promise<Result<{ numero: string }>> {
  try {
    await exigerFour();
    const numero = await svc.rendreRestes(ids);
    await journaliser("modification", "Magasin fournitures", `restes rendus au client — bon ${numero}`);
    revalider();
    return { ok: true, numero };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerReste(id: number): Promise<Result> {
  try {
    await exigerFour();
    await svc.supprimerReste(id);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── réglage : délai d'alerte ─────────── */

export async function majJoursAlerte(jours: string): Promise<Result> {
  try {
    await exigerFour();
    const n = Math.round(nombre(jours));
    if (n < 1 || n > 120) return { ok: false, error: "Entre 1 et 120 jours" };
    await setSetting(fo.CLE_JOURS_ALERTE, n);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}
