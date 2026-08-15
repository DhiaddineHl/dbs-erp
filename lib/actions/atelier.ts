"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { assertUser, userRole } from "@/lib/auth/server";
import * as at from "@/lib/domain/atelier";
import * as svc from "@/lib/services/atelier";
import { journaliser } from "@/lib/services/activite";

export type Result<T = undefined> = { ok: true; data?: T } | { ok: false; error: string };
export type ImportResult = { ok: true; count: number } | { ok: false; error: string };

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

/* ─────────── lecture de fichier ───────────
   Même moteur que l'import des commandes : .csv comme .xlsx, séparateur
   deviné. L'original refusait le .xlsx et demandait un « Enregistrer sous »
   dans Excel — cette contrainte-là n'a pas de raison d'être portée. */

async function lireFichier(formData: FormData): Promise<Record<string, unknown>[]> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Aucun fichier fourni");
  const buf = Buffer.from(await file.arrayBuffer());
  /* `cellDates` : sans lui, une date au format AAAA-MM-JJ ressort en numéro de
   * série Excel (46054.04…) et la colonne d'entrée arrive vide. */
  const opts: XLSX.ParsingOptions = { type: "buffer", raw: false, cellDates: true };
  if (file.name.toLowerCase().endsWith(".csv")) {
    const premiere = buf.toString("utf8").replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
    opts.FS = (premiere.match(/;/g) ?? []).length >= (premiere.match(/,/g) ?? []).length ? ";" : ",";
  }
  const wb = XLSX.read(buf, opts);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

/** Lit une colonne quel que soit son intitulé exact : « Nom », « nom et
 * prénom », « NOM ET PRENOM » désignent la même chose. */
function champ(ligne: Record<string, unknown>, ...alias: string[]): unknown {
  const par = new Map<string, unknown>();
  for (const [k, v] of Object.entries(ligne)) par.set(at.cleOperation(k), v);
  for (const a of alias) {
    const v = par.get(at.cleOperation(a));
    if (v !== undefined && v !== null && String(v).trim() !== "") return v;
  }
  return "";
}

const texte = (ligne: Record<string, unknown>, ...alias: string[]) => String(champ(ligne, ...alias)).trim();

/** Date d'un tableur : objet Date (Excel, .xlsx), AAAA-MM-JJ ou JJ/MM/AAAA.
 * Tout le reste vaut « pas de date » plutôt qu'une date fausse. */
function dateISO(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Composantes locales : la conversion UTC reculerait la date d'un jour.
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  const s = String(v ?? "").trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

const STATUTS_FICHIER: Record<string, string> = {
  active: "active", actif: "active", "en poste": "active", presente: "active",
  absente: "absente", absent: "absente",
  conge: "conge", "en conge": "conge",
  sortie: "sortie", sorti: "sortie", inactive: "sortie", parti: "sortie",
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

/* ─────────── imports ─────────── */

export type BilanImport = svc.BilanImportPersonnel;

export async function importerPersonnel(formData: FormData): Promise<Result<BilanImport>> {
  try {
    await exigerAtelier();
    const brutes = await lireFichier(formData);
    if (!brutes.length) return { ok: false, error: "Fichier vide ou illisible" };

    const lignes: svc.LignePersonnel[] = [];
    for (const r of brutes) {
      const nom = texte(r, "Nom", "Nom et prénom", "Nom et prenom", "Name", "Nom complet");
      if (!nom) continue;
      const statutBrut = at.cleOperation(texte(r, "Statut", "Etat", "État"));
      lignes.push({
        matricule: texte(r, "Matricule", "Mat", "Matricule paie"),
        nom,
        atelier: texte(r, "Atelier", "Site"),
        fonction: texte(r, "Fonction", "Metier", "Métier"),
        dateEntree: dateISO(champ(r, "DateEntree", "Date entrée", "Date entree", "Date d'entrée", "Date")),
        statut: STATUTS_FICHIER[statutBrut] ?? "active",
        poste: texte(r, "Poste", "Operation", "Opération"),
        sam: entier(texte(r, "SAM", "Temps standard")),
      });
    }
    if (!lignes.length)
      return { ok: false, error: "Aucune ligne exploitable — la colonne « Nom » est obligatoire" };

    const bilan = await svc.importerPersonnel(lignes);
    await journaliser(
      "import",
      "Personnel",
      `${bilan.crees} création(s), ${bilan.majs} mise(s) à jour`,
    );
    revalider();
    return ok(bilan);
  } catch (e) {
    return fail(e);
  }
}

export async function importerOperations(formData: FormData): Promise<ImportResult> {
  try {
    await exigerAtelier();
    const brutes = await lireFichier(formData);
    if (!brutes.length) return { ok: false, error: "Fichier vide ou illisible" };

    const lignes: svc.LigneOperation[] = [];
    for (const r of brutes) {
      const nom = texte(r, "Operation", "Opération", "Nom", "Libellé", "Libelle", "Poste");
      if (!nom) continue;
      lignes.push({ nom, sam: entier(texte(r, "SAM", "Temps standard", "Temps")) });
    }
    if (!lignes.length)
      return { ok: false, error: "Aucune ligne exploitable — la colonne « Operation » est obligatoire" };

    const n = await svc.importerOperations(lignes);
    await journaliser("import", "Opérations", `${n} nouvelle(s) opération(s) sur ${lignes.length} ligne(s)`);
    revalider();
    return { ok: true, count: n };
  } catch (e) {
    return fail(e) as ImportResult;
  }
}

/** Rattrapage du catalogue depuis tout ce qui a déjà été saisi. */
export async function synchroniserOperations(): Promise<Result<number>> {
  try {
    await exigerAtelier();
    const n = await svc.synchroniserOperations();
    if (n) await journaliser("modification", "Opérations", `${n} opération(s) récupérée(s) des saisies`);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

/** Capture silencieuse appelée par les écrans de saisie GPAO. */
export async function assurerOperations(entrees: { nom: string; sam?: number }[]): Promise<Result<number>> {
  try {
    await assertUser();
    const n = await svc.assurerOperations(entrees, "saisie");
    if (n) revalidatePath("/operations");
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

export async function affecterAChaine(
  chaineId: number,
  personnes: { personnelId: number; poste: string; sam: number }[],
): Promise<Result<number>> {
  try {
    await exigerAtelier();
    const n = await svc.affecterAChaine(chaineId, personnes);
    await journaliser("modification", "Personnel", `${n} affectation(s) à une chaîne`);
    revalider();
    return ok(n);
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── fusion ─────────── */

export async function appliquerFusion(liens: { nom: string; personnelId: number }[]): Promise<Result<svc.BilanFusion>> {
  try {
    await exigerAtelier();
    const bilan = await svc.appliquerFusion(liens);
    await journaliser(
      "modification",
      "Personnel",
      `fusion : ${bilan.ouvrieres} ouvrière(s) et ${bilan.journees} journée(s) rattachées`,
    );
    revalider();
    return ok(bilan);
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
