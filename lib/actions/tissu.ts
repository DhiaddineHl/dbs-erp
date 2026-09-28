"use server";

import { revalidatePath } from "next/cache";
import { and, eq } from "drizzle-orm";
import { assertUser, userRole } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { commande, tissuAffectation, tissuLot, tissuMouvement, tissuReception } from "@/lib/db/schema";
import { peutModifier, tissuLibereParLignes } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import * as tx from "@/lib/domain/tissu";
import * as svc from "@/lib/services/tissu";

/** Recalcule `commande.tissuLibere` pour une ou plusieurs commandes à partir
 * de ce que le magasin tissu leur a réellement affecté (lots + contrôle).
 * Reprend, sur le modèle par lots, ce que faisait l'ancien
 * `recalculerTissuLibere` de commande_tissu_ligne (supprimé en 0034) : appelé
 * chaque fois qu'une affectation ou le contrôle d'un lot change. */
async function recalculerTissuLibere(commandeIds: (number | null)[]) {
  const ids = [...new Set(commandeIds.filter((id): id is number => id != null))];
  if (!ids.length) return;
  const parCommande = await svc.ligneTissuParCommandes(ids);
  for (const id of ids) {
    const libere = tissuLibereParLignes(parCommande.get(id) ?? []);
    await db.update(commande).set({ tissuLibere: libere, updatedAt: new Date() }).where(eq(commande.id, id));
  }
}

/* Magasin tissu — écritures. Règle d'or : aucune quantité ne bouge sans un
 * mouvement. La création d'un lot écrit son mouvement d'entrée ; une sortie de
 * production écrit un mouvement de sortie. On ne modifie jamais un « stock »
 * global à la main. */

export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };
const fail = (e: unknown) => ({ ok: false as const, error: e instanceof Error ? e.message : "Erreur" });
const PATHS = ["/magtissu", "/commandes", "/preparation"];
const revalider = () => PATHS.forEach((p) => revalidatePath(p));

async function auteur() {
  const user = await assertUser();
  const role = userRole(user);
  let autorise = peutModifier("tissu", role);
  if (!autorise) {
    const modules = await getRoleModules(role);
    if (modules.magtissu) autorise = true;
  }
  if (!autorise) throw new Error("Réservé au magasin tissu");
  return { id: user.id, name: user.name as string, role };
}

/** Numéro de bon automatique : BR-AAAA-NNN (séquence annuelle). */
async function prochainNumeroReception(): Promise<string> {
  const annee = new Date().getFullYear();
  const prefixe = `BR-${annee}-`;
  const rows = await db.select({ numero: tissuReception.numero }).from(tissuReception);
  let max = 0;
  for (const r of rows) {
    if (r.numero?.startsWith(prefixe)) {
      const n = parseInt(r.numero.slice(prefixe.length), 10);
      if (Number.isFinite(n) && n > max) max = n;
    }
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

export type SaisieLot = {
  identifiant?: string;
  reference?: string;
  couleur?: string;
  composition?: string;
  saison?: string;
  laize?: string;
  quantiteRecue?: string;
  unite?: string;
  nbRouleaux?: string;
  note?: string;
  /** Contrôle à réception contre le BL du client. */
  quantiteAnnoncee?: string;
  laizeAnnoncee?: string;
  defauts?: string;
  controle?: string;
};

const CONTROLES_LOT = ["", "conforme", "reserve", "refuse"];

const nombre = (s: string | undefined): number => {
  const n = Number(String(s ?? "").replace(",", ".").trim());
  return Number.isFinite(n) && n > 0 ? n : 0;
};
const entierOuNull = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Math.trunc(Number(s));
  return Number.isFinite(n) && n > 0 ? n : null;
};
const nombreOuNull = (s: string | undefined): number | null => {
  if (!s || !s.trim()) return null;
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Crée un bon de réception et ses lots (réception globale possible), avec le
 * mouvement d'entrée de chaque lot. Un identifiant vide est attribué
 * automatiquement à partir de la couleur (AUBER-01…), sans doublon. */
export async function creerReception(input: {
  date?: string;
  fournisseur?: string;
  client?: string;
  blClient?: string;
  observations?: string;
  lots: SaisieLot[];
}): Promise<Result<{ receptionId: number }>> {
  try {
    const a = await auteur();
    const lotsValides = (input.lots ?? []).filter((l) => nombre(l.quantiteRecue) > 0 || (l.couleur ?? "").trim());
    if (lotsValides.length === 0) return { ok: false, error: "Ajoutez au moins un lot avec une quantité." };

    const numero = await prochainNumeroReception();
    const dateRecep = input.date || new Date().toISOString().slice(0, 10);

    const idsExistants = (await db.select({ id: tissuLot.identifiant }).from(tissuLot)).map((r) => r.id);
    const pris = [...idsExistants];

    const receptionId = await db.transaction(async (t) => {
      const [rec] = await t
        .insert(tissuReception)
        .values({
          numero,
          date: dateRecep,
          fournisseur: input.fournisseur ?? "",
          client: input.client ?? "",
          blClient: (input.blClient ?? "").trim(),
          observations: input.observations ?? "",
          createdBy: a.name,
        })
        .returning({ id: tissuReception.id });

      for (const l of lotsValides) {
        let identifiant = (l.identifiant ?? "").trim().toUpperCase();
        if (!identifiant) identifiant = tx.prochainIdentifiant(l.couleur ?? "", pris);
        // garantit l'unicité même si l'utilisateur saisit un identifiant déjà pris
        if (pris.map((x) => x.toUpperCase()).includes(identifiant)) {
          identifiant = tx.prochainIdentifiant(l.couleur ?? identifiant, pris);
        }
        pris.push(identifiant);

        const qte = nombre(l.quantiteRecue);
        const [lot] = await t
          .insert(tissuLot)
          .values({
            receptionId: rec.id,
            identifiant,
            reference: l.reference ?? "",
            couleur: l.couleur ?? "",
            composition: l.composition ?? "",
            saison: l.saison ?? "",
            laize: nombreOuNull(l.laize),
            quantiteRecue: qte,
            unite: l.unite || "m",
            nbRouleaux: entierOuNull(l.nbRouleaux),
            note: l.note ?? "",
            quantiteAnnoncee: nombreOuNull(l.quantiteAnnoncee),
            laizeAnnoncee: nombreOuNull(l.laizeAnnoncee),
            defauts: (l.defauts ?? "").trim(),
            controle: CONTROLES_LOT.includes(l.controle ?? "") ? (l.controle ?? "") : "",
          })
          .returning({ id: tissuLot.id });

        if (qte > 0) {
          await t.insert(tissuMouvement).values({
            lotId: lot.id,
            sens: "entree",
            quantite: qte,
            motif: `Réception ${numero}`,
            createdBy: a.name,
          });
        }
      }
      return rec.id;
    });

    revalider();
    return { ok: true, receptionId };
  } catch (e) {
    return fail(e);
  }
}

/** Ajoute un lot à une réception existante (réception partielle ultérieure). */
export async function ajouterLot(receptionId: number, lot: SaisieLot): Promise<Result> {
  try {
    const a = await auteur();
    const pris = (await db.select({ id: tissuLot.identifiant }).from(tissuLot)).map((r) => r.id);
    let identifiant = (lot.identifiant ?? "").trim().toUpperCase() || tx.prochainIdentifiant(lot.couleur ?? "", pris);
    if (pris.map((x) => x.toUpperCase()).includes(identifiant)) identifiant = tx.prochainIdentifiant(lot.couleur ?? identifiant, pris);
    const qte = nombre(lot.quantiteRecue);
    await db.transaction(async (t) => {
      const [row] = await t
        .insert(tissuLot)
        .values({
          receptionId,
          identifiant,
          reference: lot.reference ?? "",
          couleur: lot.couleur ?? "",
          composition: lot.composition ?? "",
          saison: lot.saison ?? "",
          laize: nombreOuNull(lot.laize),
          quantiteRecue: qte,
          unite: lot.unite || "m",
          nbRouleaux: entierOuNull(lot.nbRouleaux),
          note: lot.note ?? "",
        })
        .returning({ id: tissuLot.id });
      if (qte > 0)
        await t.insert(tissuMouvement).values({ lotId: row.id, sens: "entree", quantite: qte, motif: "Réception (ajout)", createdBy: a.name });
    });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export type ChampLot =
  | "reference"
  | "couleur"
  | "composition"
  | "saison"
  | "laize"
  | "unite"
  | "note"
  | "controle"
  | "identifiant"
  | "quantiteAnnoncee"
  | "laizeAnnoncee"
  | "defauts"
  | "rouleaux";

/** Fiche de contrôle rouleau par rouleau, reçue en JSON depuis l'écran. */
function lireRouleaux(valeur: string): tx.RouleauControle[] {
  let brut: unknown;
  try {
    brut = JSON.parse(valeur || "[]");
  } catch {
    throw new Error("Fiche rouleaux illisible");
  }
  if (!Array.isArray(brut)) throw new Error("Fiche rouleaux illisible");
  const num = (v: unknown) => {
    const n = Number(String(v ?? "").replace(",", "."));
    return v === "" || v == null || !Number.isFinite(n) || n < 0 ? null : n;
  };
  return brut.slice(0, 200).map((r: Record<string, unknown>, i) => ({
    n: String(r?.n ?? i + 1).slice(0, 20),
    annonce: num(r?.annonce),
    mesure: num(r?.mesure),
    laize: num(r?.laize),
    defauts: String(r?.defauts ?? "").slice(0, 300),
  }));
}

/** Modifie un champ descriptif d'un lot. La quantité reçue ne se modifie PAS
 * ici (elle correspond à l'entrée physique) : elle se corrige par un mouvement
 * d'ajustement d'inventaire. */
export async function majLot(lotId: number, champ: ChampLot, valeur: string): Promise<Result> {
  try {
    await auteur();
    if (champ === "controle" && !CONTROLES_LOT.includes(valeur)) return { ok: false, error: "Contrôle inconnu" };
    const patch: Record<string, unknown> =
      champ === "laize" || champ === "quantiteAnnoncee" || champ === "laizeAnnoncee"
        ? { [champ]: nombreOuNull(valeur) }
        : champ === "identifiant"
          ? { identifiant: valeur.trim().toUpperCase() }
          : champ === "rouleaux"
            ? { rouleaux: lireRouleaux(valeur) }
            : { [champ]: valeur };
    await db.update(tissuLot).set(patch).where(eq(tissuLot.id, lotId));
    // Le contrôle qualité du lot conditionne le feu tissu de chaque commande
    // à qui il est affecté : on le retient à jour tout de suite.
    if (champ === "controle") {
      const affs = await db.select({ commandeId: tissuAffectation.commandeId }).from(tissuAffectation).where(eq(tissuAffectation.lotId, lotId));
      await recalculerTissuLibere(affs.map((a) => a.commandeId));
    }
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerLot(lotId: number): Promise<Result> {
  try {
    await auteur();
    const affs = await db.select({ commandeId: tissuAffectation.commandeId }).from(tissuAffectation).where(eq(tissuAffectation.lotId, lotId));
    await db.delete(tissuLot).where(eq(tissuLot.id, lotId));
    // Les affectations de ce lot disparaissent en cascade : les commandes qui
    // en dépendaient perdent cette matière, leur feu tissu doit en tenir compte.
    await recalculerTissuLibere(affs.map((a) => a.commandeId));
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── affectations (réserver ≠ consommer) ─────────── */

export async function affecter(input: {
  lotId: number;
  commandeId: number | null;
  quantite: string;
  note?: string;
}): Promise<Result> {
  try {
    const a = await auteur();
    const q = nombre(input.quantite);
    if (q <= 0) return { ok: false, error: "Quantité à affecter invalide." };

    // Contrôle : on ne réserve pas plus que le libre du lot.
    const lot = (await svc.listLots()).find((l) => l.id === input.lotId);
    if (!lot) return { ok: false, error: "Lot introuvable." };
    if (q > lot.bilan.libre + 0.001) {
      return { ok: false, error: `Il ne reste que ${lot.bilan.libre} ${lot.unite} libres sur ce lot.` };
    }

    let label = "";
    if (input.commandeId) {
      const [c] = await db
        .select({ of: commande.ofNumber, modele: commande.modele })
        .from(commande)
        .where(eq(commande.id, input.commandeId));
      label = c ? `${c.of} · ${c.modele}` : "";
    }
    await db.insert(tissuAffectation).values({
      lotId: input.lotId,
      commandeId: input.commandeId,
      commandeLabel: label,
      quantite: q,
      note: input.note ?? "",
      createdBy: a.name,
    });
    await recalculerTissuLibere([input.commandeId]);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerAffectation(id: number): Promise<Result> {
  try {
    await auteur();
    const [a] = await db.select({ commandeId: tissuAffectation.commandeId }).from(tissuAffectation).where(eq(tissuAffectation.id, id));
    await db.delete(tissuAffectation).where(eq(tissuAffectation.id, id));
    await recalculerTissuLibere([a?.commandeId ?? null]);
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── mouvements (sortie / consommation, retour, ajustement) ─────────── */

export async function sortir(input: {
  lotId: number;
  commandeId: number | null;
  quantite: string;
  motif?: string;
}): Promise<Result> {
  try {
    const a = await auteur();
    const q = nombre(input.quantite);
    if (q <= 0) return { ok: false, error: "Quantité à sortir invalide." };
    const lot = (await svc.listLots()).find((l) => l.id === input.lotId);
    if (!lot) return { ok: false, error: "Lot introuvable." };
    if (q > lot.bilan.disponible + 0.001) {
      return { ok: false, error: `Il ne reste que ${lot.bilan.disponible} ${lot.unite} en stock sur ce lot.` };
    }
    let label = "";
    if (input.commandeId) {
      const [c] = await db
        .select({ of: commande.ofNumber, modele: commande.modele })
        .from(commande)
        .where(eq(commande.id, input.commandeId));
      label = c ? `${c.of} · ${c.modele}` : "";
    }
    await db.insert(tissuMouvement).values({
      lotId: input.lotId,
      sens: "sortie",
      quantite: q,
      commandeId: input.commandeId,
      commandeLabel: label,
      motif: input.motif ?? "Consommation production",
      createdBy: a.name,
    });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Ajustement d'inventaire : écart physique constaté (+ ou −), tracé comme
 * mouvement, jamais en modifiant la quantité reçue. */
export async function ajuster(input: { lotId: number; ecart: string; motif?: string }): Promise<Result> {
  try {
    const a = await auteur();
    const n = Number(String(input.ecart).replace(",", "."));
    if (!Number.isFinite(n) || n === 0) return { ok: false, error: "Écart d'ajustement invalide." };
    await db.insert(tissuMouvement).values({
      lotId: input.lotId,
      sens: "ajustement",
      quantite: n, // signé
      motif: input.motif || "Ajustement d'inventaire",
      createdBy: a.name,
    });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerMouvement(id: number): Promise<Result> {
  try {
    await auteur();
    // On ne supprime pas une entrée de réception (ça viderait le lot en douce).
    const [m] = await db.select().from(tissuMouvement).where(eq(tissuMouvement.id, id));
    if (m?.sens === "entree") return { ok: false, error: "Une entrée de réception ne se supprime pas ici." };
    await db.delete(tissuMouvement).where(and(eq(tissuMouvement.id, id)));
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

export async function supprimerReception(id: number): Promise<Result> {
  try {
    await auteur();
    await db.delete(tissuReception).where(eq(tissuReception.id, id));
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/* ─────────── reliquats rendus au client ───────────
 *
 * Rendre un reliquat, c'est une SORTIE du stock qui n'est pas une
 * consommation (sens « rendu ») : le bilan matière de la commande reste juste
 * et le client récupère un bon de retour numéroté RT-AAAA-NNN. */

async function prochainNumeroRetour(): Promise<string> {
  const annee = new Date().getFullYear();
  const prefixe = `RT-${annee}-`;
  const rows = await db.select({ motif: tissuMouvement.motif }).from(tissuMouvement).where(eq(tissuMouvement.sens, "rendu"));
  let max = 0;
  for (const r of rows) {
    if (!r.motif.startsWith(prefixe)) continue;
    const n = parseInt(r.motif.slice(prefixe.length), 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return `${prefixe}${String(max + 1).padStart(3, "0")}`;
}

/** Rend au client tout le disponible des lots choisis (ou une quantité par lot). */
export async function rendreAuClient(input: { lots: { lotId: number; quantite?: string }[] }): Promise<Result<{ numero: string }>> {
  try {
    const a = await auteur();
    if (!input.lots.length) return { ok: false, error: "Choisissez au moins un lot." };
    const tous = new Map((await svc.listLots()).map((l) => [l.id, l]));
    const lignes: { lotId: number; q: number; commandeId: number | null; label: string }[] = [];
    let client = "";
    for (const x of input.lots) {
      const l = tous.get(x.lotId);
      if (!l) return { ok: false, error: "Lot introuvable." };
      const q = x.quantite ? nombre(x.quantite) : l.bilan.disponible;
      if (q <= 0) continue;
      if (q > l.bilan.disponible + 0.001) return { ok: false, error: `${l.identifiant} : il ne reste que ${l.bilan.disponible} ${l.unite}.` };
      if (client && l.client && client.toLowerCase() !== l.client.toLowerCase()) {
        return { ok: false, error: "Un bon de retour ne concerne qu'un seul client." };
      }
      client = client || l.client;
      // Rattaché à la dernière commande servie par ce lot : le bilan matière la retrouve.
      const derniere = l.affectations.at(-1);
      lignes.push({ lotId: l.id, q, commandeId: derniere?.commandeId ?? null, label: derniere?.commandeLabel ?? "" });
    }
    if (!lignes.length) return { ok: false, error: "Rien à rendre : ces lots sont vides." };
    const numero = await prochainNumeroRetour();
    await db.insert(tissuMouvement).values(
      lignes.map((l) => ({
        lotId: l.lotId, sens: "rendu", quantite: Math.round(l.q * 100) / 100, commandeId: l.commandeId,
        commandeLabel: l.label, motif: numero, createdBy: a.name,
      })),
    );
    revalider();
    return { ok: true, numero };
  } catch (e) {
    return fail(e);
  }
}
