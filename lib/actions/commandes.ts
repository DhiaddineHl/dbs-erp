"use server";

import { revalidatePath } from "next/cache";
import * as XLSX from "xlsx";
import { assertUser, userRole } from "@/lib/auth/server";
import * as biz from "@/lib/domain/commande";
import * as svc from "@/lib/services/commandes";
import * as gpao from "@/lib/services/gpao";
import { COMMANDE_COLUMNS, CLIENT_COLUMNS, FACONNIER_COLUMNS, mapRow } from "@/lib/modules/columns";
import { journaliser } from "@/lib/services/activite";
import { enregistrerFichier } from "@/lib/services/fichiers";

export type Result = { ok: true } | { ok: false; error: string };
/** Variante des actions qui rapportent quelque chose à l'écran. */
export type Retour<T> = { ok: true; data: T } | { ok: false; error: string };
export type ImportResult = { ok: true; count: number } | { ok: false; error: string };
type Data = Record<string, string>;

const ok: Result = { ok: true };
const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof Error ? e.message : "Erreur",
});

/** Lecture d'un montant saisi : « 12,40 », « 12.40 € », « 1 200,50 », "" → null.
 *
 * Partagé avec le formulaire via le domaine, pour que la saisie à l'écran et
 * l'import acceptent exactement les mêmes écritures. */
const parseMontant = biz.montantSaisi;

const parseEntier = (v: string | undefined | null) => {
  const n = parseMontant(v);
  return n == null ? 0 : Math.round(n);
};

/** Date d'un tableur : objet Date (.xlsx), AAAA-MM-JJ ou JJ/MM/AAAA.
 *
 * Une chaîne vide vaut « pas de date », donc null dans une colonne `date`.
 * Tout ce qui n'est pas reconnu vaut null aussi : une colonne vide se corrige
 * d'un coup d'œil, une date fausse se propage jusqu'au retard affiché. */
function parseDate(v: unknown): string | null {
  if (v instanceof Date && !isNaN(v.getTime())) {
    // Composantes locales : passer par l'UTC reculerait la date d'un jour.
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
  /* `cellDates` : sans lui, une date d'une feuille Excel ressort en numéro de
   * série (46054.04…) et la colonne arrive vide en base. */
  const opts: XLSX.ParsingOptions = { type: "buffer", raw: false, cellDates: true };
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

/** Passerelle Commandes → GPAO (B22).
 *
 * Enregistrer une commande fait exister son modèle côté production, pour que
 * la chaîne n'ait pas à le ressaisir avant d'ouvrir sa première journée.
 *
 * Ne lève jamais : la commande est enregistrée, et une passerelle en panne ne
 * doit pas faire croire le contraire. L'écran GPAO reste saisissable à la
 * main, c'est le filet. */
async function synchroniserVersGpao(nomModele: string | undefined) {
  try {
    const etat = await gpao.synchroniserModele(nomModele ?? "");
    if (etat !== "aucun") revalidatePath("/gpao_prod");
  } catch {
    /* silencieux par conception */
  }
}

/* ─────────── commandes ─────────── */

export async function createCommande(d: Data): Promise<Result> {
  try {
    await assertUser();
    const tailles = parseTailles(d.tailles);
    const qteTailles = tailles.reduce((s, t) => s + t.qte, 0);
    /* Règle DBS, appliquée ici et pas seulement dans le formulaire : une
     * action serveur est appelable directement, et une règle qui ne tient que
     * dans l'écran ne tient pas. En interne le prix façon suit le prix de
     * vente, donc marge nulle — DBS n'achète pas sa propre façon. */
    const apercu = biz.apercuCommande(d);
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
      prixFacon: apercu.interne ? parseMontant(d.prixVente) : parseMontant(d.prixFacon),
      consoTheo: parseMontant(d.consoTheo),
      receptTissu: parseDate(d.receptTissu),
      dateExport: parseDate(d.dateExport),
      dateExportReel: parseDate(d.dateExportReel),
      produit: parseEntier(d.produit),
      statutManuel: biz.isStatut(d.statutManuel) ? d.statutManuel : null,
    });
    await journaliser("creation", "Commandes", `${d.modele ?? ""} — ${d.client ?? ""}`);
    await synchroniserVersGpao(d.modele);
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

    /* Le modèle, la quantité ou le client changent : la fiche GPAO doit
     * suivre, sinon la chaîne travaille sur une quantité périmée. Le nom
     * d'avant est relevé maintenant, car après un renommage il faut
     * rafraîchir les deux fiches — celle qu'on quitte garde les commandes qui
     * lui restent. La fiche qui n'en a plus aucune est laissée telle quelle :
     * elle porte peut-être des journées de production. */
    const touche = "modele" in patch || "qte" in patch || "client" in patch;
    const nomAvant = touche ? await svc.nomModele(id) : "";

    if (Object.keys(out).length) await svc.updateCommande(id, out, auteurDe(user));

    if (touche) {
      for (const n of new Set([nomAvant, out.modele ?? nomAvant].filter(Boolean))) {
        await synchroniserVersGpao(n);
      }
    }
    revalidatePath("/commandes");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

export async function deleteCommandesAction(ids: number[]): Promise<Result> {
  try {
    const user = await assertUser();
    /* Le contrôle est ici, pas seulement dans l'écran : une action serveur est
     * appelable directement, un bouton masqué ne protège rien. */
    if (!PEUT_SUPPRIMER.includes(userRole(user)))
      return { ok: false, error: "Suppression réservée aux administrateurs et responsables" };
    await svc.deleteCommandes(ids, user.id);
    await journaliser("suppression", "Commandes", `${ids.length} commande(s)`);
    revalidatePath("/commandes");
    revalidatePath("/archives");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** Marque une sélection comme livrée.
 *
 * C'est un statut FORCÉ, pas un fait constaté : on écrit `statutManuel`, ce
 * qui laisse les compteurs (produit, facturé) dire la vérité par ailleurs.
 * Remettre « Automatique » rend la commande à son statut dérivé. */
export async function marquerLivrees(ids: number[]): Promise<Result> {
  try {
    const user = await assertUser();
    if (!ids.length) return { ok: false, error: "Aucune commande sélectionnée" };
    for (const id of ids) await svc.updateCommande(id, { statutManuel: "livree" }, auteurDe(user));
    await purgerPhotosSilencieux();
    await journaliser("modification", "Commandes", `${ids.length} commande(s) marquée(s) livrée(s)`);
    revalidatePath("/commandes");
    revalidatePath("/archives");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** La suppression définitive est réservée : elle retire la commande de tous
 * les calculs (CA, marges, quantités) et de tous les postes à la fois. */
const PEUT_SUPPRIMER = ["admin", "resp"];

export async function peutSupprimerCommandes(): Promise<boolean> {
  try {
    const user = await assertUser();
    return PEUT_SUPPRIMER.includes(userRole(user));
  } catch {
    return false;
  }
}

export async function archiverCommandes(ids: number[], archived: boolean): Promise<Result> {
  try {
    await assertUser();
    await svc.setArchived(ids, archived);
    if (archived) await purgerPhotosSilencieux();
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

/* ─────────── photo du modèle (B7) ─────────── */

/** Attache une photo à une commande.
 *
 * Le navigateur réduit l'image à 380 px avant l'envoi ; la borne du service
 * (4 Mo) ne sert qu'à arrêter un original envoyé directement. Le stockage est
 * adressé par contenu : la même photo sur deux commandes n'occupe la place
 * qu'une fois. */
export async function televerserPhotoCommande(formData: FormData): Promise<Retour<{ hash: string }>> {
  try {
    await assertUser();
    const id = Number(formData.get("commandeId"));
    if (!Number.isFinite(id) || id <= 0) return { ok: false, error: "Commande inconnue" };
    const f = formData.get("photo");
    if (!(f instanceof File)) return { ok: false, error: "Aucun fichier fourni" };

    const { hash } = await enregistrerFichier(Buffer.from(await f.arrayBuffer()), f.type);
    await svc.attacherPhoto(id, hash);
    revalidatePath("/commandes");
    return { ok: true, data: { hash } };
  } catch (e) {
    return fail(e);
  }
}

export async function retirerPhotoCommande(id: number): Promise<Result> {
  try {
    await assertUser();
    await svc.retirerPhoto(id);
    revalidatePath("/commandes");
    return ok;
  } catch (e) {
    return fail(e);
  }
}

/** Purge les photos des commandes livrées ou archivées.
 *
 * Appelée après une livraison ou un archivage, comme le faisait l'original.
 * Ne lève jamais : la commande est bien livrée, et un ménage raté ne doit pas
 * faire croire le contraire. */
async function purgerPhotosSilencieux() {
  try {
    await svc.purgerPhotosLivrees();
  } catch {
    /* silencieux par conception */
  }
}

/* ─────────── journal des prix (B16) ─────────── */

export type MouvementPrix = {
  id: number;
  ts: string;
  champ: string;
  ancien: number | null;
  nouveau: number | null;
  userName: string;
};

/** Historique des prix d'une commande.
 *
 * Le journal était déjà écrit à chaque modification ; il n'était lu nulle
 * part. Un prix qui change sans qu'on puisse dire quand ni par qui rend toute
 * discussion de marge impossible. */
export async function historiquePrix(commandeId: number): Promise<Retour<MouvementPrix[]>> {
  try {
    await assertUser();
    const rows = await svc.historiquePrix(commandeId);
    return {
      ok: true,
      data: rows.map((r) => ({
        id: r.id,
        ts: r.ts.toISOString(),
        champ: r.champ,
        ancien: r.ancien,
        nouveau: r.nouveau,
        userName: r.userName,
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── doublons (B11) ─────────── */

export type GroupeDoublon = {
  cle: string;
  lignes: {
    id: number;
    of: string;
    modele: string;
    client: string;
    refArticle: string;
    couleur: string;
    qte: number;
    ca: number;
    produit: number;
    factureQte: number;
    dateExport: string;
    archived: boolean;
  }[];
};

/** Commandes partageant la clé (client, modèle, référence).
 *
 * On ne propose aucune fusion automatique : deux commandes identiques peuvent
 * parfaitement être deux vraies commandes — un réassort porte le même modèle
 * pour le même client. C'est l'humain qui tranche, l'écran ne fait que
 * montrer, avec de quoi trancher (produit, facturé, date). */
export async function listerDoublons(): Promise<Retour<GroupeDoublon[]>> {
  try {
    await assertUser();
    const groupes = await svc.detecterDoublons();
    return {
      ok: true,
      data: groupes.map((g) => ({
        cle: `${g[0].client || "sans client"} · ${g[0].modele} · ${g[0].refArticle || "sans réf"}`,
        lignes: g.map((c) => ({
          id: c.id,
          of: c.of,
          modele: c.modele,
          client: c.client,
          refArticle: c.refArticle,
          couleur: c.couleur,
          qte: c.qte,
          ca: c.ca,
          produit: c.produit,
          factureQte: c.factureQte,
          dateExport: c.dateExport,
          archived: c.archived,
        })),
      })),
    };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── prévision export (B15) ─────────── */

export async function planifierExport(ids: number[], date: string): Promise<Retour<number>> {
  try {
    await assertUser();
    if (!ids.length) return { ok: false, error: "Aucune commande sélectionnée" };
    const iso = parseDate(date);
    if (date.trim() && !iso) return { ok: false, error: "Date illisible" };
    const n = await svc.planifierExport(ids, iso);
    await journaliser(
      "modification",
      "Prévision Export",
      iso ? `${n} commande(s) planifiée(s) au ${iso}` : `${n} commande(s) rendues à leur date contractuelle`,
    );
    revalidatePath("/commandes");
    revalidatePath("/prevexport");
    return { ok: true, data: n };
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
