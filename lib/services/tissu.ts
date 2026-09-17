import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, tissuAffectation, tissuLot, tissuMouvement, tissuReception } from "@/lib/db/schema";
import * as tx from "@/lib/domain/tissu";

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
  bilan: tx.BilanLot;
  statut: tx.StatutLot;
  affectations: AffectationRow[];
  mouvements: MouvementRow[];
};

export type ReceptionRow = {
  id: number;
  numero: string;
  date: string;
  fournisseur: string;
  client: string;
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
      receptionNumero: tissuReception.numero,
      receptionDate: tissuReception.date,
      fournisseur: tissuReception.fournisseur,
    })
    .from(tissuLot)
    .leftJoin(tissuReception, eq(tissuLot.receptionId, tissuReception.id))
    .orderBy(asc(tissuLot.identifiant));

  if (lots.length === 0) return [];
  const ids = lots.map((l) => l.id);

  const [affs, mvts] = await Promise.all([
    db.select().from(tissuAffectation).where(inArray(tissuAffectation.lotId, ids)).orderBy(asc(tissuAffectation.id)),
    db.select().from(tissuMouvement).where(inArray(tissuMouvement.lotId, ids)).orderBy(desc(tissuMouvement.id)),
  ]);
  const parAff = groupBy(affs, (a) => a.lotId);
  const parMvt = groupBy(mvts, (m) => m.lotId);

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

  const mvts = await db
    .select({ lotId: tissuMouvement.lotId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite })
    .from(tissuMouvement)
    .where(eq(tissuMouvement.commandeId, commandeId));

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
      .select({ commandeId: tissuMouvement.commandeId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite })
      .from(tissuMouvement),
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
