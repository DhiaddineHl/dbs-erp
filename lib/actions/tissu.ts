"use server";

import { revalidatePath } from "next/cache";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, tissuAffectation, tissuLot, tissuMouvement, tissuReception, tissuRouleau } from "@/lib/db/schema";
import { tissuLibereParLignes } from "@/lib/domain/feux";
import { auteurTissu } from "@/lib/auth/tissu";
import * as tx from "@/lib/domain/tissu";
import * as svc from "@/lib/services/tissu";
import * as rl from "@/lib/domain/rouleau";
import { creerEtiquettesAMesurer, prochainCodeRouleau, recalculerStatut, type Executeur } from "@/lib/services/rouleaux";
import { journaliser } from "@/lib/services/activite";

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
const PATHS = ["/magtissu", "/commandes", "/preparation", "/m/tissu"];
const revalider = () => PATHS.forEach((p) => revalidatePath(p));

const auteur = auteurTissu;

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
  lotFournisseur?: string;
  codeCouleur?: string;
  /** Rouleaux physiques du lot : chacun reçoit un ID permanent et son QR. Si
   * la liste est donnée, la quantité reçue du lot est leur somme. */
  rouleaux?: SaisieRouleau[];
  /** Nombre d'étiquettes « à mesurer » : rouleaux dont le métrage sera saisi
   * au scan, au magasin (en plus des rouleaux déjà saisis, le cas échéant). */
  aMesurer?: string;
};

export type SaisieRouleau = { metrage?: string; annonce?: string; laize?: string; poids?: string; observations?: string };

/** Rouleaux saisis valides (métrage > 0), dans l'ordre. */
function rouleauxSaisis(l: SaisieLot) {
  return (l.rouleaux ?? [])
    .map((r) => ({
      metrage: Math.round(nombre(r.metrage) * 100) / 100,
      annonce: nombreOuNull(r.annonce),
      laize: nombreOuNull(r.laize),
      poids: nombreOuNull(r.poids),
      observations: (r.observations ?? "").trim().slice(0, 300),
    }))
    .filter((r) => r.metrage > 0)
    .slice(0, 300);
}

/** Nombre d'étiquettes « à mesurer » demandées pour un lot (300 au plus). */
const nbAMesurer = (l: SaisieLot) => Math.min(300, entierOuNull(l.aMesurer) ?? 0);

/** Crée les rouleaux d'un lot à réception : un code R-AAAA-NNNNNN chacun, statut
 * « en attente » (le scan au magasin les passera « en stock »), et un mouvement
 * d'entrée par rouleau, rattaché au lot. */
async function creerRouleauxReception(
  t: Executeur,
  lotId: number,
  rouleaux: ReturnType<typeof rouleauxSaisis>,
  numero: string,
  par: string,
): Promise<number[]> {
  const ids: number[] = [];
  for (const r of rouleaux) {
    const code = await prochainCodeRouleau(t);
    const [row] = await t
      .insert(tissuRouleau)
      .values({ code, lotId, metrageInitial: r.metrage, metrageAnnonce: r.annonce, laize: r.laize, poids: r.poids, observations: r.observations, createdBy: par })
      .returning({ id: tissuRouleau.id });
    await t.insert(tissuMouvement).values({ lotId, rouleauId: row.id, sens: "entree", quantite: r.metrage, motif: `Réception ${numero}`, createdBy: par });
    ids.push(row.id);
  }
  return ids;
}

/** Le lot est-il suivi par rouleau ? Alors le stock ne bouge plus qu'au rouleau. */
async function lotAvecRouleaux(ex: Executeur, lotId: number): Promise<boolean> {
  const [r] = await ex.select({ id: tissuRouleau.id }).from(tissuRouleau).where(eq(tissuRouleau.lotId, lotId)).limit(1);
  return !!r;
}
const REFUS_LOT_ROULEAUX = "Ce lot est suivi par rouleau : passez le mouvement sur le rouleau (scan QR ou fiche rouleau).";

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
  commandeFournisseur?: string;
  lots: SaisieLot[];
}): Promise<Result<{ receptionId: number; rouleauIds: number[] }>> {
  try {
    const a = await auteur();
    const lotsValides = (input.lots ?? []).filter(
      (l) => nombre(l.quantiteRecue) > 0 || (l.couleur ?? "").trim() || rouleauxSaisis(l).length > 0 || nbAMesurer(l) > 0,
    );
    if (lotsValides.length === 0) return { ok: false, error: "Ajoutez au moins un lot avec une quantité." };

    const numero = await prochainNumeroReception();
    const dateRecep = input.date || new Date().toISOString().slice(0, 10);

    const idsExistants = (await db.select({ id: tissuLot.identifiant }).from(tissuLot)).map((r) => r.id);
    const pris = [...idsExistants];

    const rouleauIds: number[] = [];
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
          commandeFournisseur: (input.commandeFournisseur ?? "").trim(),
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

        const rouleaux = rouleauxSaisis(l);
        const aMesurer = nbAMesurer(l);
        // Lot suivi par rouleau : son reçu est la somme des rouleaux MESURÉS
        // (les étiquettes « à mesurer » l'augmenteront une à une, au scan).
        const qte = rouleaux.length || aMesurer
          ? Math.round(rouleaux.reduce((s, r) => s + r.metrage, 0) * 100) / 100
          : nombre(l.quantiteRecue);
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
            nbRouleaux: rouleaux.length + aMesurer || entierOuNull(l.nbRouleaux),
            note: l.note ?? "",
            lotFournisseur: (l.lotFournisseur ?? "").trim(),
            codeCouleur: (l.codeCouleur ?? "").trim(),
            quantiteAnnoncee: nombreOuNull(l.quantiteAnnoncee),
            laizeAnnoncee: nombreOuNull(l.laizeAnnoncee),
            defauts: (l.defauts ?? "").trim(),
            controle: CONTROLES_LOT.includes(l.controle ?? "") ? (l.controle ?? "") : "",
          })
          .returning({ id: tissuLot.id });

        if (rouleaux.length || aMesurer) {
          // Un mouvement d'entrée PAR rouleau (la somme fait l'entrée du lot).
          if (rouleaux.length) rouleauIds.push(...(await creerRouleauxReception(t, lot.id, rouleaux, numero, a.name)));
          if (aMesurer) rouleauIds.push(...(await creerEtiquettesAMesurer(t, lot.id, aMesurer, a.name)));
        } else if (qte > 0) {
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
    return { ok: true, receptionId, rouleauIds };
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
    const rouleaux = rouleauxSaisis(lot);
    const aMesurer = nbAMesurer(lot);
    const qte = rouleaux.length || aMesurer ? Math.round(rouleaux.reduce((s, r) => s + r.metrage, 0) * 100) / 100 : nombre(lot.quantiteRecue);
    const [rec] = await db.select({ numero: tissuReception.numero }).from(tissuReception).where(eq(tissuReception.id, receptionId));
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
          nbRouleaux: rouleaux.length + aMesurer || entierOuNull(lot.nbRouleaux),
          note: lot.note ?? "",
          lotFournisseur: (lot.lotFournisseur ?? "").trim(),
          codeCouleur: (lot.codeCouleur ?? "").trim(),
        })
        .returning({ id: tissuLot.id });
      if (rouleaux.length || aMesurer) {
        if (rouleaux.length) await creerRouleauxReception(t, row.id, rouleaux, `${rec?.numero ?? ""} (ajout)`.trim(), a.name);
        if (aMesurer) await creerEtiquettesAMesurer(t, row.id, aMesurer, a.name);
      } else if (qte > 0)
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
  | "lotFournisseur"
  | "codeCouleur"
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
    if (champ === "rouleaux" && (await lotAvecRouleaux(db, lotId))) {
      return { ok: false, error: "Ce lot a ses rouleaux étiquetés : c'est leur fiche qui fait foi." };
    }
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

/** Supprimer un lot n'est permis que pour une erreur de réception : le tissu
 * n'est jamais sorti, ni revenu, ni rendu (règle : tx.refusSuppressionLot).
 * Au-delà, l'historique ne s'efface pas : on archive le lot. */
async function refusSuppressionLots(lotIds: number[]): Promise<string | null> {
  if (!lotIds.length) return null;
  const ms = await db
    .select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
    .from(tissuMouvement)
    .where(inArray(tissuMouvement.lotId, lotIds));
  return tx.refusSuppressionLot(ms);
}

/** Supprime un lot ENTIER (ses rouleaux, étiquettes et mouvements d'entrée
 * partent avec lui). Motif obligatoire, écrit au journal d'activité. */
export async function supprimerLot(lotId: number, motif = ""): Promise<Result> {
  try {
    const a = await auteur();
    const [lot] = await db.select({ identifiant: tissuLot.identifiant, quantiteRecue: tissuLot.quantiteRecue, unite: tissuLot.unite }).from(tissuLot).where(eq(tissuLot.id, lotId));
    if (!lot) return { ok: false, error: "Lot introuvable (déjà supprimé ?)." };
    const refus = await refusSuppressionLots([lotId]);
    if (refus) return { ok: false, error: refus };
    const affs = await db.select({ commandeId: tissuAffectation.commandeId }).from(tissuAffectation).where(eq(tissuAffectation.lotId, lotId));
    const rouleaux = await db.select({ code: tissuRouleau.code }).from(tissuRouleau).where(eq(tissuRouleau.lotId, lotId));
    await db.delete(tissuLot).where(eq(tissuLot.id, lotId));
    // Les affectations de ce lot disparaissent en cascade : les commandes qui
    // en dépendaient perdent cette matière, leur feu tissu doit en tenir compte.
    await recalculerTissuLibere(affs.map((x) => x.commandeId));
    await journaliser(
      "suppression",
      "Magasin tissu",
      `Lot ${lot.identifiant} supprimé par ${a.name} (${lot.quantiteRecue} ${lot.unite}${rouleaux.length ? `, ${rouleaux.length} rouleau(x) : ${rouleaux.map((r) => r.code).join(", ")}` : ""}) — motif : ${motif.trim() || "non précisé"}`,
    );
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Archive (range) un lot, ou le ressort. Rien n'est effacé : il quitte les
 * listes de travail et reste consultable dans « Archivés ». */
export async function archiverLot(lotId: number, archive: boolean): Promise<Result> {
  try {
    const a = await auteur();
    const [lot] = await db
      .update(tissuLot)
      .set(archive ? { archive: true, archiveLe: new Date(), archivePar: a.name } : { archive: false, archiveLe: null, archivePar: "" })
      .where(eq(tissuLot.id, lotId))
      .returning({ identifiant: tissuLot.identifiant });
    if (!lot) return { ok: false, error: "Lot introuvable." };
    await journaliser("archivage", "Magasin tissu", `Lot ${lot.identifiant} ${archive ? "archivé" : "ressorti des archives"} par ${a.name}`);
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
    if (await lotAvecRouleaux(db, input.lotId)) return { ok: false, error: REFUS_LOT_ROULEAUX };
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
    if (await lotAvecRouleaux(db, input.lotId)) return { ok: false, error: `${REFUS_LOT_ROULEAUX} (correction du rouleau, avec motif)` };
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

/** Annule un mouvement : il reste dans l'historique, barré, et une ligne
 * « annulation » dit qui l'a annulé, quand et pourquoi. Remplace l'ancienne
 * suppression (qui effaçait l'historique sans trace).
 * Interdit sur une entrée de réception et sur un déplacement (ils ne changent
 * pas le stock ou le fondent) ; refusé si le stock deviendrait négatif. */
export async function annulerMouvement(id: number, motif: string): Promise<Result> {
  try {
    const a = await auteur();
    if (!motif.trim()) return { ok: false, error: "Le motif de l'annulation est obligatoire." };
    await db.transaction(async (t) => {
      const [m] = await t.select().from(tissuMouvement).where(eq(tissuMouvement.id, id)).for("update");
      if (!m) throw new Error("Mouvement introuvable.");
      if (["entree", "mise_en_stock", "deplacement", "annulation"].includes(m.sens)) {
        throw new Error(`Un mouvement « ${rl.sensLabel(m.sens)} » ne s'annule pas : passez une correction.`);
      }
      const [deja] = await t
        .select({ id: tissuMouvement.id })
        .from(tissuMouvement)
        .where(and(eq(tissuMouvement.sens, "annulation"), eq(tissuMouvement.annuleId, id)));
      if (deja) throw new Error("Ce mouvement est déjà annulé.");

      if (m.rouleauId != null) {
        const [r] = await t.select().from(tissuRouleau).where(eq(tissuRouleau.id, m.rouleauId)).for("update");
        const ms = await t
          .select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
          .from(tissuMouvement)
          .where(eq(tissuMouvement.rouleauId, m.rouleauId))
          .orderBy(asc(tissuMouvement.id));
        const apres = rl.bilanRouleau(r.metrageInitial, [...ms, { id: -1, sens: "annulation", quantite: 0, annuleId: id }]);
        if (apres.disponible < -0.001) throw new Error(`Annulation impossible : le rouleau ${r.code} tomberait à ${apres.disponible} m.`);
        if (apres.enCoupe < -0.001) throw new Error(`Annulation impossible : ${r.code} aurait plus de tissu déclaré (consommé, chute, retour) que sorti.`);
      } else {
        const [lot] = await t.select().from(tissuLot).where(eq(tissuLot.id, m.lotId));
        const ms = await t.select().from(tissuMouvement).where(eq(tissuMouvement.lotId, m.lotId));
        const apres = tx.bilanLot(lot?.quantiteRecue ?? 0, [], [...ms, { id: -1, sens: "annulation", quantite: 0, annuleId: id }]);
        if (apres.disponible < -0.001) throw new Error(`Annulation impossible : le lot tomberait à ${apres.disponible} ${lot?.unite ?? "m"}.`);
      }
      await t.insert(tissuMouvement).values({
        lotId: m.lotId,
        rouleauId: m.rouleauId,
        sens: "annulation",
        quantite: 0,
        annuleId: id,
        commandeId: m.commandeId,
        commandeLabel: m.commandeLabel,
        motif: motif.trim(),
        valeurAvant: `${rl.sensLabel(m.sens)} ${m.quantite}`,
        valeurApres: "annulé",
        createdBy: a.name,
      });
      if (m.rouleauId != null) await recalculerStatut(t, m.rouleauId);
    });
    revalider();
    return { ok: true };
  } catch (e) {
    return fail(e);
  }
}

/** Conservé pour les écrans existants : ne supprime plus, ANNULE (trace gardée). */
export async function supprimerMouvement(id: number, motif = "Annulé depuis le magasin tissu"): Promise<Result> {
  return annulerMouvement(id, motif);
}

export async function supprimerReception(id: number): Promise<Result> {
  try {
    await auteur();
    const lots = await db.select({ id: tissuLot.id }).from(tissuLot).where(eq(tissuLot.receptionId, id));
    const refus = await refusSuppressionLots(lots.map((l) => l.id));
    if (refus) return { ok: false, error: refus.replace("Ce lot", "Un lot de ce bon").replace("Archivez-le", "Archivez ses lots") };
    const [rec] = await db.select({ numero: tissuReception.numero }).from(tissuReception).where(eq(tissuReception.id, id));
    await db.delete(tissuReception).where(eq(tissuReception.id, id));
    await journaliser("suppression", "Magasin tissu", `Bon de réception ${rec?.numero ?? id} supprimé (${lots.length} lot(s))`);
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
    const lignes: { lotId: number; rouleauId: number | null; q: number; commandeId: number | null; label: string }[] = [];
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
      const base = { lotId: l.id, commandeId: derniere?.commandeId ?? null, label: derniere?.commandeLabel ?? "" };
      if (!l.rouleaux.length) {
        lignes.push({ ...base, rouleauId: null, q });
        continue;
      }
      // Lot suivi par rouleau : le rendu se répartit sur les rouleaux en stock,
      // les plus entamés d'abord, pour que chaque rouleau garde son bilan juste.
      let reste = q;
      const enStock = l.rouleaux
        .filter((r) => r.valide && r.bilan.disponible > 0.001)
        .sort((x, y) => x.bilan.disponible - y.bilan.disponible);
      for (const r of enStock) {
        if (reste <= 0.001) break;
        const part = Math.min(reste, r.bilan.disponible);
        lignes.push({ ...base, rouleauId: r.id, q: part });
        reste -= part;
      }
      if (reste > 0.001) {
        return { ok: false, error: `${l.identifiant} : ${Math.round(reste * 100) / 100} ${l.unite} sont sur des rouleaux pas encore réceptionnés au magasin.` };
      }
    }
    if (!lignes.length) return { ok: false, error: "Rien à rendre : ces lots sont vides." };
    const numero = await prochainNumeroRetour();
    await db.transaction(async (t) => {
      await t.insert(tissuMouvement).values(
        lignes.map((l) => ({
          lotId: l.lotId, rouleauId: l.rouleauId, sens: "rendu", quantite: Math.round(l.q * 100) / 100, commandeId: l.commandeId,
          commandeLabel: l.label, motif: numero, createdBy: a.name,
        })),
      );
      for (const l of lignes) if (l.rouleauId != null) await recalculerStatut(t, l.rouleauId);
    });
    revalider();
    return { ok: true, numero };
  } catch (e) {
    return fail(e);
  }
}
