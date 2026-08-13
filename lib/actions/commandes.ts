"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { assertUser } from "@/lib/auth/server";
import * as biz from "@/lib/domain/commande";
import * as svc from "@/lib/services/commandes";
import { COMMANDE_COLUMNS, CLIENT_COLUMNS, FACONNIER_COLUMNS, mapRow } from "@/lib/modules/columns";
import { journaliser } from "@/lib/services/activite";

export type Result = { ok: true } | { ok: false; error: string };
export type ImportResult = { ok: true; count: number } | { ok: false; error: string };
type Data = Record<string, string>;

const ok: Result = { ok: true };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/** Accepts "12,40", "12.40 €", "1 200,50" and "" (→ null). */
function parseMontant(v: string | undefined | null): number | null {
  if (v == null) return null;
  const cleaned = String(v)
    .replace(/[  \s]/g, "")
    .replace(/[€%]/g, "")
    .replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const parseEntier = (v: string | undefined | null) => {
  const n = parseMontant(v);
  return n == null ? 0 : Math.round(n);
};

/** Empty string means "no date", which is null in a `date` column. */
const parseDate = (v: string | undefined | null) => {
  const s = (v ?? "").trim();
  return s ? s : null;
};

function parseTailles(raw: string | undefined): { taille: string; qte: number }[] {
  if (!raw) return [];
  try {
    const arr = JSON.parse(raw) as { taille: string; qte: number }[];
    return Array.isArray(arr)
      ? arr.filter((t) => t && t.taille).map((t) => ({ taille: String(t.taille), qte: Number(t.qte) || 0 }))
      : [];
  } catch {
    return [];
  }
}

async function parseUpload(formData: FormData): Promise<Record<string, unknown>[]> {
  const file = formData.get("file");
  if (!(file instanceof File)) throw new Error("Aucun fichier fourni");
  const buf = Buffer.from(await file.arrayBuffer());
  const opts: XLSX.ParsingOptions = { type: "buffer", raw: false };
  if (file.name.toLowerCase().endsWith(".csv")) {
    const firstLine = buf.toString("utf8").replace(/^﻿/, "").split(/\r?\n/)[0] ?? "";
    const semi = (firstLine.match(/;/g) ?? []).length;
    const comma = (firstLine.match(/,/g) ?? []).length;
    opts.FS = semi >= comma ? ";" : ",";
  }
  const wb = XLSX.read(buf, opts);
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
}

const auteurDe = (u: { id: string; name: string }) => ({ id: u.id, name: u.name });

/* ─────────── commandes ─────────── */

export async function createCommande(d: Data): Promise<Result> {
  try {
    await assertUser();
    const tailles = parseTailles(d.tailles);
    const qteTailles = tailles.reduce((s, t) => s + t.qte, 0);
    await svc.insertCommande({
      ofNumber: d.of?.trim() || (await svc.prochainNumeroOF()),
      modele: d.modele,
      refArticle: d.refArticle ?? "",
      couleur: d.couleur ?? "",
      saison: d.saison ?? "",
      note: d.note ?? "",
      clientId: await svc.resolveClientId(d.client),
      faconnierId: await svc.resolveFaconnierId(d.faconnier),
      chaineId: d.chaineId ? Number(d.chaineId) : null,
      qte: qteTailles || parseEntier(d.qte),
      tailles,
      prixVente: parseMontant(d.prixVente),
      prixFacon: parseMontant(d.prixFacon),
      consoTheo: parseMontant(d.consoTheo),
      receptTissu: parseDate(d.receptTissu),
      dateExport: parseDate(d.dateExport),
      dateExportReel: parseDate(d.dateExportReel),
      produit: parseEntier(d.produit),
      statutManuel: biz.isStatut(d.statutManuel) ? d.statutManuel : null,
    });
    await journaliser("creation", "Commandes", `${d.modele ?? ""} — ${d.client ?? ""}`);
    revalidatePath("/commandes");
    revalidatePath("/clients");
    revalidatePath("/facon");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** Inline-grid patch. Keys are the CommandeRow display keys. */
export async function updateCommandeRow(id: number, patch: Data): Promise<Result> {
  try {
    const user = await assertUser();
    const out: Parameters<typeof svc.updateCommande>[1] = {};

    for (const [k, raw] of Object.entries(patch)) {
      const v = raw ?? "";
      switch (k) {
        case "of":
          out.ofNumber = v.trim();
          break;
        case "client":
          out.clientId = await svc.resolveClientId(v);
          break;
        case "faconnier":
          out.faconnierId = await svc.resolveFaconnierId(v);
          break;
        case "chaineId":
          out.chaineId = v ? Number(v) : null;
          break;
        case "qte":
        case "produit":
        case "coupeQte":
        case "magasinQte":
        case "factureQte":
          out[k] = parseEntier(v);
          break;
        case "prixVente":
        case "prixFacon":
        case "consoTheo":
        case "consoReel":
        case "chutePct":
          out[k] = parseMontant(v);
          break;
        case "tissuRecu":
          // NOT NULL in the schema — an emptied cell means zero metres received.
          out.tissuRecu = parseMontant(v) ?? 0;
          break;
        case "receptTissu":
        case "dateExport":
        case "dateExportReel":
        case "dateLivraison":
        case "exportPrev":
          out[k] = parseDate(v);
          break;
        case "statutManuel":
          out.statutManuel = biz.isStatut(v) ? v : null;
          break;
        case "modele":
        case "refArticle":
        case "couleur":
        case "saison":
        case "note":
        case "statutLog":
          out[k] = v;
          break;
        default:
          // Derived columns (statut, retard, marge, av, ca…) are read-only.
          break;
      }
    }

    if (Object.keys(out).length) await svc.updateCommande(id, out, auteurDe(user));
    revalidatePath("/commandes");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCommandesAction(ids: number[]): Promise<Result> {
  try {
    const user = await assertUser();
    await svc.deleteCommandes(ids, user.id);
    await journaliser("suppression", "Commandes", `${ids.length} commande(s)`);
    revalidatePath("/commandes");
    revalidatePath("/archives");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function archiverCommandes(ids: number[], archived: boolean): Promise<Result> {
  try {
    await assertUser();
    await svc.setArchived(ids, archived);
    await journaliser("modification", "Commandes", `${ids.length} commande(s) ${archived ? "archivée(s)" : "désarchivée(s)"}`);
    revalidatePath("/commandes");
    revalidatePath("/archives");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function importCommandes(formData: FormData): Promise<ImportResult> {
  try {
    await assertUser();
    const raw = await parseUpload(formData);
    if (!raw.length) return { ok: false, error: "Fichier vide ou illisible" };

    const values: svc.CommandeInput[] = [];
    const annee = new Date().getFullYear();
    // Rows without an OF number continue the existing sequence.
    let seq = Number((await svc.prochainNumeroOF(annee)).split("-").pop()) || 1;

    for (const r of raw) {
      const d = mapRow(COMMANDE_COLUMNS, r);
      if (!d.modele || !d.client) continue;
      values.push({
        ofNumber: d.of?.trim() || biz.numeroOF(seq++, annee),
        modele: d.modele,
        refArticle: d.refArticle ?? "",
        couleur: d.couleur ?? "",
        saison: d.saison ?? "",
        clientId: await svc.resolveClientId(d.client),
        faconnierId: await svc.resolveFaconnierId(d.faconnier),
        qte: parseEntier(d.qte),
        prixVente: parseMontant(d.prixVente),
        prixFacon: parseMontant(d.prixFacon),
        produit: parseEntier(d.produit),
        dateExport: parseDate(d.dateExport),
      });
    }
    if (!values.length)
      return { ok: false, error: "Aucune ligne valide (colonnes « Modèle » et « Client » requises)" };

    await svc.insertManyCommandes(values);
    await journaliser("import", "Commandes", `${values.length} ligne(s) importée(s)`);
    revalidatePath("/commandes");
    revalidatePath("/clients");
    revalidatePath("/facon");
    return { ok: true, count: values.length };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── clients ─────────── */

export async function createClient(d: Data): Promise<Result> {
  try {
    await assertUser();
    const nom = (d.nom ?? "").trim();
    if (!nom) return { ok: false, error: "La raison sociale est obligatoire" };
    // resolveClientId creates the row (with key + code) when the name is new.
    const id = await svc.resolveClientId(nom);
    if (id)
      await svc.updateClient(id, {
        contact: d.contact ?? "",
        email: d.email ?? "",
        tel: d.tel ?? "",
        ville: d.ville ?? "",
        pays: d.pays ?? "",
        tva: d.tva ?? "",
        adresse: d.adresse ?? "",
      });
    revalidatePath("/clients");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function updateClientRow(id: number, patch: Data): Promise<Result> {
  try {
    await assertUser();
    const allowed = ["code", "nom", "marque", "contact", "email", "tel", "ville", "pays", "tva", "adresse"] as const;
    const out: Record<string, string> = {};
    for (const k of allowed) if (k in patch) out[k] = patch[k] ?? "";
    if (Object.keys(out).length) await svc.updateClient(id, out);
    revalidatePath("/clients");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteClientsAction(ids: number[]): Promise<Result> {
  try {
    await assertUser();
    await svc.deleteClients(ids);
    revalidatePath("/clients");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function importClients(formData: FormData): Promise<ImportResult> {
  try {
    await assertUser();
    const raw = await parseUpload(formData);
    if (!raw.length) return { ok: false, error: "Fichier vide ou illisible" };
    let n = 0;
    for (const r of raw) {
      const d = mapRow(CLIENT_COLUMNS, r);
      if (!d.nom) continue;
      const id = await svc.resolveClientId(d.nom);
      if (!id) continue;
      await svc.updateClient(id, {
        ...(d.code ? { code: d.code } : {}),
        contact: d.contact,
        email: d.email,
        tel: d.tel,
        ville: d.ville,
        pays: d.pays,
        tva: d.tva,
      });
      n++;
    }
    if (!n) return { ok: false, error: "Aucune ligne valide (colonne « Raison sociale » requise)" };
    revalidatePath("/clients");
    return { ok: true, count: n };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── façonniers ─────────── */

export async function createFaconnier(d: Data): Promise<Result> {
  try {
    await assertUser();
    const nom = (d.nom ?? "").trim();
    if (!nom) return { ok: false, error: "Le nom est obligatoire" };
    const id = await svc.resolveFaconnierId(nom);
    if (id)
      await svc.updateFaconnier(id, {
        specialite: d.specialite ?? "",
        contact: d.contact ?? "",
        tel: d.tel ?? "",
        prixFacon: parseMontant(d.prixFacon),
      });
    revalidatePath("/facon");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function updateFaconnierRow(id: number, patch: Data): Promise<Result> {
  try {
    await assertUser();
    const out: Record<string, unknown> = {};
    for (const k of ["nom", "specialite", "contact", "tel"] as const) {
      if (k in patch) out[k] = patch[k] ?? "";
    }
    if ("prixFacon" in patch) out.prixFacon = parseMontant(patch.prixFacon);
    if (Object.keys(out).length) await svc.updateFaconnier(id, out);
    revalidatePath("/facon");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteFaconniersAction(ids: number[]): Promise<Result> {
  try {
    await assertUser();
    await svc.deleteFaconniers(ids);
    revalidatePath("/facon");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function importFaconniers(formData: FormData): Promise<ImportResult> {
  try {
    await assertUser();
    const raw = await parseUpload(formData);
    if (!raw.length) return { ok: false, error: "Fichier vide ou illisible" };
    let n = 0;
    for (const r of raw) {
      const d = mapRow(FACONNIER_COLUMNS, r);
      if (!d.nom) continue;
      const id = await svc.resolveFaconnierId(d.nom);
      if (!id) continue;
      await svc.updateFaconnier(id, {
        specialite: d.specialite,
        contact: d.contact,
        tel: d.tel,
        prixFacon: parseMontant(d.prixFacon),
      });
      n++;
    }
    if (!n) return { ok: false, error: "Aucune ligne valide (colonne « Nom » requise)" };
    revalidatePath("/facon");
    return { ok: true, count: n };
  } catch (e) {
    return fail(e);
  }
}
