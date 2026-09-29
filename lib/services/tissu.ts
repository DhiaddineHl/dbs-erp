import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, tissuAffectation, tissuEmplacement, tissuLot, tissuMouvement, tissuReception, tissuRouleau } from "@/lib/db/schema";
import * as tx from "@/lib/domain/tissu";
import * as rl from "@/lib/domain/rouleau";
import type { LigneTissu } from "@/lib/domain/feux";

/* Magasin tissu — lecture. Toute la lecture passe par les mouvements et les
 * affectations : on ne stocke jamais un « disponible » en dur (voir domaine). */

export type MouvementRow = {
  id: number;
  sens: string;
  quantite: number;
  commandeId: number | null;
  commandeLabel: string;
  motif: string;
  createdBy: string;
  date: string;
  rouleauId: number | null;
  destination: string;
  valeurAvant: string;
  valeurApres: string;
  annuleId: number | null;
  /** Neutralisé par une annulation (reste affiché, n'est plus compté). */
  annule: boolean;
};

/** Un rouleau physique du lot (voir lib/services/rouleaux.ts pour la fiche). */
export type RouleauLot = {
  id: number;
  code: string;
  statut: string;
  metrageInitial: number;
  laize: number | null;
  poids: number | null;
  emplacement: string;
  observations: string;
  valide: boolean;
  bilan: rl.BilanRouleau;
};

export type AffectationRow = {
  id: number;
  commandeId: number | null;
  commandeLabel: string;
  quantite: number;
  note: string;
  date: string;
};

export type LotRow = {
  id: number;
  receptionId: number;
  receptionNumero: string;
  receptionDate: string;
  fournisseur: string;
  identifiant: string;
  reference: string;
  couleur: string;
  composition: string;
  saison: string;
  laize: number | null;
  quantiteRecue: number;
  unite: string;
  nbRouleaux: number | null;
  controle: string;
  note: string;
  /** Client (donneur d'ordre) et BL du bon de réception. */
  client: string;
  blClient: string;
  quantiteAnnoncee: number | null;
  laizeAnnoncee: number | null;
  defauts: string;
  /** Ancienne fiche de contrôle rouleau (JSON, migration 0036) — remplacée par
   * les vrais rouleaux ; ne sert plus qu'à pré-remplir « Découper en rouleaux ». */
  ficheRouleaux: tx.RouleauControle[];
  /** Écarts contre le BL client : manque, laize, défauts → réclamation. */
  ecarts: tx.EcartsReception;
  lotFournisseur: string;
  codeCouleur: string;
  commandeFournisseur: string;
  bilan: tx.BilanLot;
  statut: tx.StatutLot;
  affectations: AffectationRow[];
  mouvements: MouvementRow[];
  /** Rouleaux physiques (vide = lot suivi en bloc, sans étiquette par rouleau). */
  rouleaux: RouleauLot[];
};

export type ReceptionRow = {
  id: number;
  numero: string;
  date: string;
  fournisseur: string;
  client: string;
  blClient: string;
  observations: string;
  piecesJointes: string[];
  createdBy: string;
  lots: LotRow[];
};

const iso = (d: string | Date | null) => (d == null ? "" : typeof d === "string" ? d : d.toISOString());
const dISO = (d: string | null) => d ?? "";

function groupBy<T, K>(rows: T[], key: (r: T) => K): Map<K, T[]> {
  const m = new Map<K, T[]>();
  for (const r of rows) {
    const k = key(r);
    const g = m.get(k);
    if (g) g.push(r);
    else m.set(k, [r]);
  }
  return m;
}

/** Tous les lots avec leur bilan (reçu/affecté/consommé/disponible) et détail. */
export async function listLots(): Promise<LotRow[]> {
  const lots = await db
    .select({
      id: tissuLot.id,
      receptionId: tissuLot.receptionId,
      identifiant: tissuLot.identifiant,
      reference: tissuLot.reference,
      couleur: tissuLot.couleur,
      composition: tissuLot.composition,
      saison: tissuLot.saison,
      laize: tissuLot.laize,
      quantiteRecue: tissuLot.quantiteRecue,
      unite: tissuLot.unite,
      nbRouleaux: tissuLot.nbRouleaux,
      controle: tissuLot.controle,
      note: tissuLot.note,
      quantiteAnnoncee: tissuLot.quantiteAnnoncee,
      laizeAnnoncee: tissuLot.laizeAnnoncee,
      defauts: tissuLot.defauts,
      rouleaux: tissuLot.rouleaux,
      receptionNumero: tissuReception.numero,
      receptionDate: tissuReception.date,
      fournisseur: tissuReception.fournisseur,
      client: tissuReception.client,
      blClient: tissuReception.blClient,
      commandeFournisseur: tissuReception.commandeFournisseur,
      lotFournisseur: tissuLot.lotFournisseur,
      codeCouleur: tissuLot.codeCouleur,
    })
    .from(tissuLot)
    .leftJoin(tissuReception, eq(tissuLot.receptionId, tissuReception.id))
    .orderBy(asc(tissuLot.identifiant));

  if (lots.length === 0) return [];
  const ids = lots.map((l) => l.id);

  const [affs, mvts, rouleaux] = await Promise.all([
    db.select().from(tissuAffectation).where(inArray(tissuAffectation.lotId, ids)).orderBy(asc(tissuAffectation.id)),
    db.select().from(tissuMouvement).where(inArray(tissuMouvement.lotId, ids)).orderBy(desc(tissuMouvement.id)),
    db
      .select({ r: tissuRouleau, emplacement: tissuEmplacement.code })
      .from(tissuRouleau)
      .leftJoin(tissuEmplacement, eq(tissuRouleau.emplacementId, tissuEmplacement.id))
      .where(inArray(tissuRouleau.lotId, ids))
      .orderBy(asc(tissuRouleau.id)),
  ]);
  const parAff = groupBy(affs, (a) => a.lotId);
  const parMvt = groupBy(mvts, (m) => m.lotId);
  const parRouleauMvt = groupBy(mvts.filter((m) => m.rouleauId != null), (m) => m.rouleauId!);
  const parRouleau = groupBy(rouleaux, (x) => x.r.lotId);
  const annules = new Set(mvts.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId!));

  return lots.map((l) => {
    const a = parAff.get(l.id) ?? [];
    const m = parMvt.get(l.id) ?? [];
    const bilan = tx.bilanLot(l.quantiteRecue, a, m);
    return {
      id: l.id,
      receptionId: l.receptionId,
      receptionNumero: l.receptionNumero ?? "",
      receptionDate: dISO(l.receptionDate),
      fournisseur: l.fournisseur ?? "",
      identifiant: l.identifiant,
      reference: l.reference,
      couleur: l.couleur,
      composition: l.composition,
      saison: l.saison,
      laize: l.laize,
      quantiteRecue: l.quantiteRecue,
      unite: l.unite,
      nbRouleaux: l.nbRouleaux,
      controle: l.controle,
      note: l.note,
      client: l.client ?? "",
      blClient: l.blClient ?? "",
      commandeFournisseur: l.commandeFournisseur ?? "",
      lotFournisseur: l.lotFournisseur,
      codeCouleur: l.codeCouleur,
      quantiteAnnoncee: l.quantiteAnnoncee,
      laizeAnnoncee: l.laizeAnnoncee,
      defauts: l.defauts,
      ficheRouleaux: l.rouleaux ?? [],
      /* Contrôle par rouleau : les vrais rouleaux font foi dès qu'ils existent. */
      ecarts: tx.ecartsReception({
        ...l,
        rouleaux: (parRouleau.get(l.id) ?? []).length
          ? (parRouleau.get(l.id) ?? []).map(({ r }) => ({ n: r.code, annonce: r.metrageAnnonce, mesure: r.metrageInitial, laize: r.laize, defauts: r.observations }))
          : (l.rouleaux ?? []),
      }),
      bilan,
      statut: tx.statutLot(bilan),
      affectations: a.map((x) => ({
        id: x.id,
        commandeId: x.commandeId,
        commandeLabel: x.commandeLabel,
        quantite: x.quantite,
        note: x.note,
        date: iso(x.createdAt),
      })),
      mouvements: m.map((x) => ({
        id: x.id,
        sens: x.sens,
        quantite: x.quantite,
        commandeId: x.commandeId,
        commandeLabel: x.commandeLabel,
        motif: x.motif,
        createdBy: x.createdBy,
        date: iso(x.createdAt),
        rouleauId: x.rouleauId,
        destination: x.destination,
        valeurAvant: x.valeurAvant,
        valeurApres: x.valeurApres,
        annuleId: x.annuleId,
        annule: annules.has(x.id),
      })),
      rouleaux: (parRouleau.get(l.id) ?? []).map(({ r, emplacement }) => ({
        id: r.id,
        code: r.code,
        statut: r.statut,
        metrageInitial: r.metrageInitial,
        laize: r.laize,
        poids: r.poids,
        emplacement: emplacement ?? "",
        observations: r.observations,
        valide: r.valideLe != null,
        bilan: rl.bilanRouleau(r.metrageInitial, parRouleauMvt.get(r.id) ?? []),
      })),
    };
  });
}

/** Réceptions (bons) avec leurs lots — pour l'écran de réception et l'historique. */
export async function listReceptions(): Promise<ReceptionRow[]> {
  const [receptions, lots] = await Promise.all([
    db.select().from(tissuReception).orderBy(desc(tissuReception.date), desc(tissuReception.id)),
    listLots(),
  ]);
  const parReception = groupBy(lots, (l) => l.receptionId);
  return receptions.map((r) => ({
    id: r.id,
    numero: r.numero,
    date: dISO(r.date),
    fournisseur: r.fournisseur,
    client: r.client,
    blClient: r.blClient,
    observations: r.observations,
    piecesJointes: r.piecesJointes ? r.piecesJointes.split(",").filter(Boolean) : [],
    createdBy: r.createdBy,
    lots: parReception.get(r.id) ?? [],
  }));
}

/** Affectations d'une commande, tous lots confondus — pour la vue « tissu » de
 * la commande (besoin → reçu → affecté → consommé → reste). */
export type LotDeCommande = {
  lotId: number;
  identifiant: string;
  couleur: string;
  affecte: number;
  consomme: number;
};

export async function lotsDeCommande(commandeId: number): Promise<LotDeCommande[]> {
  const affs = await db
    .select({
      lotId: tissuAffectation.lotId,
      quantite: tissuAffectation.quantite,
      identifiant: tissuLot.identifiant,
      couleur: tissuLot.couleur,
    })
    .from(tissuAffectation)
    .leftJoin(tissuLot, eq(tissuAffectation.lotId, tissuLot.id))
    .where(eq(tissuAffectation.commandeId, commandeId));

  const mvts = rl.mouvementsEffectifs(
    await db
      .select({ id: tissuMouvement.id, lotId: tissuMouvement.lotId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
      .from(tissuMouvement)
      .where(eq(tissuMouvement.commandeId, commandeId)),
  );

  const consoParLot = new Map<number, number>();
  for (const m of mvts) {
    if (m.sens !== "sortie") continue;
    consoParLot.set(m.lotId, (consoParLot.get(m.lotId) ?? 0) + m.quantite);
  }
  const parLot = new Map<number, LotDeCommande>();
  for (const a of affs) {
    const e = parLot.get(a.lotId) ?? {
      lotId: a.lotId,
      identifiant: a.identifiant ?? "?",
      couleur: a.couleur ?? "",
      affecte: 0,
      consomme: consoParLot.get(a.lotId) ?? 0,
    };
    e.affecte += a.quantite;
    parLot.set(a.lotId, e);
  }
  return [...parLot.values()];
}

/** Liste courte des commandes pour les listes déroulantes d'affectation. */
export async function commandesPourAffectation() {
  const rows = await db
    .select({ id: commande.id, of: commande.ofNumber, modele: commande.modele, couleur: commande.couleur })
    .from(commande)
    .orderBy(desc(commande.id));
  return rows.map((r) => ({ id: r.id, label: `${r.of} · ${r.modele}${r.couleur ? ` · ${r.couleur}` : ""}` }));
}

/* ─────────── couverture tissu par commande ───────────
 *
 * Pour toutes les commandes d'un coup : combien de tissu leur est AFFECTÉ
 * depuis les lots, et combien a été CONSOMMÉ. Le besoin théorique
 * (nomenclature) est calculé ailleurs (fiche commande) ; ici on ne remonte que
 * ce que le magasin par lots sait : affecté / consommé / lots d'origine.
 * Sert à la vue « tissu » de la commande et aux alertes. */
export type CouvertureTissuCommande = { affecte: number; consomme: number; lots: string[] };

export async function couvertureTissuParCommande(): Promise<Map<number, CouvertureTissuCommande>> {
  const [affs, mvts] = await Promise.all([
    db
      .select({ commandeId: tissuAffectation.commandeId, quantite: tissuAffectation.quantite, ident: tissuLot.identifiant })
      .from(tissuAffectation)
      .leftJoin(tissuLot, eq(tissuAffectation.lotId, tissuLot.id)),
    db
      .select({ id: tissuMouvement.id, commandeId: tissuMouvement.commandeId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
      .from(tissuMouvement)
      .then(rl.mouvementsEffectifs),
  ]);

  const out = new Map<number, CouvertureTissuCommande>();
  const get = (id: number) => {
    let e = out.get(id);
    if (!e) {
      e = { affecte: 0, consomme: 0, lots: [] };
      out.set(id, e);
    }
    return e;
  };
  for (const a of affs) {
    if (a.commandeId == null) continue;
    const e = get(a.commandeId);
    e.affecte += a.quantite;
    if (a.ident && !e.lots.includes(a.ident)) e.lots.push(a.ident);
  }
  for (const m of mvts) {
    if (m.commandeId == null || m.sens !== "sortie") continue;
    get(m.commandeId).consomme += m.quantite;
  }
  return out;
}

/* ─────────── détail par matière pour la préparation / direction technique ───
 *
 * Remplace l'ancien `commande_tissu_ligne` (supprimé en migration 0034) : une
 * « matière » d'une commande, désormais, ce sont les LOTS qui lui ont été
 * affectés — le lot porte déjà référence, couleur, laize et son propre
 * contrôle qualité, exactement l'information qu'il fallait avant saisir à la
 * main par ligne. Un même lot affecté en plusieurs fois à une commande (reste
 * réaffecté…) ne compte qu'une seule ligne, quantités cumulées.
 *
 * Il n'existe plus de « métrage prévu » distinct au niveau de la commande dans
 * le modèle par lots (le besoin théorique se calcule par ailleurs, depuis la
 * nomenclature) : on porte donc le métrage affecté des deux côtés, pour ne
 * jamais afficher un faux manque là où rien n'a jamais été promis. */
export async function ligneTissuParCommandes(commandeIds: number[]): Promise<Map<number, LigneTissu[]>> {
  const out = new Map<number, LigneTissu[]>();
  if (!commandeIds.length) return out;

  const rows = await db
    .select({
      commandeId: tissuAffectation.commandeId,
      lotId: tissuLot.id,
      identifiant: tissuLot.identifiant,
      reference: tissuLot.reference,
      couleur: tissuLot.couleur,
      laize: tissuLot.laize,
      controle: tissuLot.controle,
      lotNote: tissuLot.note,
      quantite: tissuAffectation.quantite,
      affNote: tissuAffectation.note,
      dateReception: tissuReception.date,
    })
    .from(tissuAffectation)
    .innerJoin(tissuLot, eq(tissuAffectation.lotId, tissuLot.id))
    .leftJoin(tissuReception, eq(tissuLot.receptionId, tissuReception.id))
    .where(inArray(tissuAffectation.commandeId, commandeIds));

  type Accum = { id: number; nom: string; reference: string; couleur: string; laize: number | null; controle: string; quantite: number; notes: Set<string>; dateReception: string };
  const parCommande = new Map<number, Map<number, Accum>>();
  for (const r of rows) {
    if (r.commandeId == null) continue;
    let parLot = parCommande.get(r.commandeId);
    if (!parLot) {
      parLot = new Map();
      parCommande.set(r.commandeId, parLot);
    }
    let acc = parLot.get(r.lotId);
    if (!acc) {
      acc = { id: r.lotId, nom: r.identifiant || "Matière", reference: r.reference, couleur: r.couleur, laize: r.laize, controle: r.controle, quantite: 0, notes: new Set(), dateReception: r.dateReception ?? "" };
      if (r.lotNote) acc.notes.add(r.lotNote);
      parLot.set(r.lotId, acc);
    }
    acc.quantite += r.quantite;
    if (r.affNote) acc.notes.add(r.affNote);
  }

  for (const [commandeId, parLot] of parCommande) {
    out.set(
      commandeId,
      [...parLot.values()]
        .sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
        .map((a) => ({
          id: a.id,
          nom: a.nom,
          reference: a.reference,
          couleur: a.couleur,
          laize: a.laize,
          metragePrevu: a.quantite,
          metrageRecu: a.quantite,
          controle: a.controle,
          note: [...a.notes].join(" — "),
          dateReception: a.dateReception,
        })),
    );
  }
  return out;
}
