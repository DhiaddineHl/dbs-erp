"use server";

import { revalidatePath } from "next/cache";
import { assertUser, userRole } from "@/lib/auth/server";
import * as svc from "@/lib/services/finance";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };

const ok = <T,>(data?: T): Result<T> => ({ ok: true, data });
const fail = (e: unknown): Result<never> => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

const COMPTA = ["admin", "resp", "jfl"];

/** La comptabilité est saisie par la direction et l'administration. */
async function exigerCompta() {
  const user = await assertUser();
  const role = userRole(user);
  if (role !== "admin" && !COMPTA.includes(role)) throw new Error("Saisie réservée à la comptabilité");
  return user;
}

const revaliderFactures = () => {
  revalidatePath("/factures");
  revalidatePath("/cockpit");
};
const revaliderGl = () => revalidatePath("/grand_livre");

const nombre = (v: string | number) => {
  const n = typeof v === "number" ? v : Number(String(v).replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : 0;
};

/* ─────────── règlements ─────────── */

export async function ajouterReglement(v: {
  factureId: number;
  date: string;
  montant: string | number;
  mode: string;
  compteId: number | null;
  ref?: string;
  note?: string;
}): Promise<Result<number>> {
  try {
    await exigerCompta();
    const montant = nombre(v.montant);
    if (!(montant > 0)) return { ok: false, error: "Le montant doit être supérieur à zéro" };
    if (!v.date) return { ok: false, error: "Renseignez la date du règlement" };
    const id = await svc.ajouterReglement({
      factureId: v.factureId, date: v.date, montant, mode: v.mode,
      compteId: v.compteId, ref: v.ref ?? "", note: v.note ?? "",
    });
    await journaliser("creation", "Encaissements", `facture id ${v.factureId} — ${montant} € en ${v.mode}`);
    revaliderFactures();
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function majReglement(
  id: number,
  champ: "date" | "montant" | "mode" | "compteId" | "ref" | "note",
  valeur: string,
): Promise<Result> {
  try {
    await exigerCompta();
    const patch =
      champ === "montant"
        ? { montant: nombre(valeur) }
        : champ === "compteId"
          ? { compteId: valeur ? Number(valeur) : null }
          : { [champ]: valeur };
    await svc.majReglement(id, patch);
    revaliderFactures();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerReglement(id: number): Promise<Result> {
  try {
    await exigerCompta();
    await svc.supprimerReglement(id);
    await journaliser("suppression", "Encaissements", `règlement id ${id}`);
    revaliderFactures();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── comptes bancaires ─────────── */

export async function ajouterCompteBancaire(libelle: string): Promise<Result> {
  try {
    await exigerCompta();
    const propre = libelle.trim();
    if (!propre) return { ok: false, error: "Donnez un libellé au compte" };
    await svc.ajouterCompteBancaire(propre);
    revaliderFactures();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function renommerCompteBancaire(id: number, libelle: string): Promise<Result> {
  try {
    await exigerCompta();
    await svc.renommerCompteBancaire(id, libelle.trim());
    revaliderFactures();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerCompteBancaire(id: number): Promise<Result> {
  try {
    await exigerCompta();
    await svc.supprimerCompteBancaire(id);
    revaliderFactures();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── grand livre ─────────── */

export async function creerCompteFournisseur(v: {
  nom: string;
  categorie: string;
  devise: string;
}): Promise<Result<number>> {
  try {
    await exigerCompta();
    const nom = v.nom.trim();
    if (!nom) return { ok: false, error: "Donnez un nom au fournisseur" };
    const id = await svc.creerCompteFournisseur({ nom, categorie: v.categorie, devise: v.devise });
    revaliderGl();
    return ok(id);
  } catch (e) {
    return fail(e);
  }
}

export async function majCompteFournisseur(
  id: number,
  champ: "nom" | "categorie" | "devise",
  valeur: string,
): Promise<Result> {
  try {
    await exigerCompta();
    await svc.majCompteFournisseur(id, { [champ]: valeur });
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerCompteFournisseur(id: number): Promise<Result> {
  try {
    await exigerCompta();
    await svc.supprimerCompteFournisseur(id);
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function ajouterTransaction(v: {
  compteId: number;
  date: string;
  libelle: string;
  debit: string | number;
  credit: string | number;
}): Promise<Result> {
  try {
    await exigerCompta();
    if (!v.date) return { ok: false, error: "Renseignez la date du mouvement" };
    const debit = nombre(v.debit);
    const credit = nombre(v.credit);
    if (debit <= 0 && credit <= 0) return { ok: false, error: "Renseignez un débit ou un crédit" };
    await svc.ajouterTransaction({ compteId: v.compteId, date: v.date, libelle: v.libelle, debit, credit });
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function majTransaction(
  id: number,
  champ: "date" | "libelle" | "debit" | "credit",
  valeur: string,
): Promise<Result> {
  try {
    await exigerCompta();
    const patch = champ === "debit" || champ === "credit" ? { [champ]: nombre(valeur) } : { [champ]: valeur };
    await svc.majTransaction(id, patch);
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerTransaction(id: number): Promise<Result> {
  try {
    await exigerCompta();
    await svc.supprimerTransactions([id]);
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}

export async function definirTauxEur(taux: string | number): Promise<Result> {
  try {
    await exigerCompta();
    const n = nombre(taux);
    if (!(n > 0)) return { ok: false, error: "Le taux doit être supérieur à zéro" };
    await svc.setTauxEur(n);
    revaliderGl();
    return ok();
  } catch (e) {
    return fail(e);
  }
}
