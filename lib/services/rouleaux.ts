import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  commande,
  faconnier,
  tissuAffectation,
  tissuEmplacement,
  tissuInventaire,
  tissuInventaireScan,
  tissuLot,
  tissuMouvement,
  tissuReception,
  tissuRouleau,
} from "@/lib/db/schema";
import * as rl from "@/lib/domain/rouleau";

/* Rouleaux physiques — lecture. Même principe que les lots : rien n'est
 * stocké en dur, le disponible se recalcule depuis les mouvements du rouleau
 * (tissu_mouvement.rouleau_id). Le statut stocké n'est qu'un cache tenu à jour
 * par les actions, pour filtrer vite ; la fiche affiche le calcul. */

export type Executeur = Pick<typeof db, "select" | "update" | "insert" | "execute">;

export type RouleauRow = {
  id: number;
  code: string;
  statut: string;
  valide: boolean;
  valideLe: string;
  validePar: string;
  metrageInitial: number;
  metrageAnnonce: number | null;
  laize: number | null;
  poids: number | null;
  observations: string;
  emplacementId: number | null;
  emplacement: string;
  zone: string;
  lot: {
    id: number;
    identifiant: string;
    reference: string;
    couleur: string;
    codeCouleur: string;
    composition: string;
    lotFournisseur: string;
    saison: string;
    unite: string;
    controle: string;
    /** Lot archivé à la main : ses rouleaux sortent des listes de travail. */
    archive: boolean;
  };
  reception: { id: number; numero: string; date: string; fournisseur: string; client: string; blClient: string; commandeFournisseur: string };
  /** Commandes pour lesquelles le lot est réservé. */
  commandes: { id: number; label: string }[];
  /** Dernière commande servie par ce rouleau (sortie). */
  derniereCommande: string;
  /** Où est le tissu sorti non soldé : « Coupe interne », « chez X »… ("" si rien dehors). */
  chez: string;
  /** Bon de sortie (BST-…) de sa dernière sortie, "" s'il est sorti sans bon. */
  bonSortie: string;
  bilan: rl.BilanRouleau;
  createdAt: string;
};

export type MouvementRouleauRow = {
  id: number;
  sens: string;
  quantite: number;
  destination: string;
  faconnierNom: string;
  bon: string;
  commandeId: number | null;
  commandeLabel: string;
  motif: string;
  valeurAvant: string;
  valeurApres: string;
  annuleId: number | null;
  annule: boolean;
  par: string;
  date: string;
};

const iso = (d: Date | string | null) => (d == null ? "" : typeof d === "string" ? d : d.toISOString());

/** Charge des rouleaux avec lot, réception, emplacement, réservations et bilan. */
export async function chargerRouleaux(filtre: { ids?: number[]; codes?: string[]; lotIds?: number[]; receptionId?: number } = {}): Promise<RouleauRow[]> {
  let q = db
    .select({
      r: tissuRouleau,
      lot: tissuLot,
      rec: tissuReception,
      emplacement: tissuEmplacement.code,
      zone: tissuEmplacement.zone,
    })
    .from(tissuRouleau)
    .innerJoin(tissuLot, eq(tissuRouleau.lotId, tissuLot.id))
    .innerJoin(tissuReception, eq(tissuLot.receptionId, tissuReception.id))
    .leftJoin(tissuEmplacement, eq(tissuRouleau.emplacementId, tissuEmplacement.id))
    .$dynamic();
  if (filtre.ids) q = q.where(inArray(tissuRouleau.id, filtre.ids.length ? filtre.ids : [-1]));
  else if (filtre.codes) q = q.where(inArray(tissuRouleau.code, filtre.codes.length ? filtre.codes : ["-"]));
  else if (filtre.lotIds) q = q.where(inArray(tissuRouleau.lotId, filtre.lotIds.length ? filtre.lotIds : [-1]));
  else if (filtre.receptionId != null) q = q.where(eq(tissuLot.receptionId, filtre.receptionId));
  const rows = await q.orderBy(asc(tissuRouleau.id));
  if (!rows.length) return [];

  const ids = rows.map((x) => x.r.id);
  const lotIds = [...new Set(rows.map((x) => x.lot.id))];
  const [mvts, affs] = await Promise.all([
    db
      .select({
        id: tissuMouvement.id,
        rouleauId: tissuMouvement.rouleauId,
        sens: tissuMouvement.sens,
        quantite: tissuMouvement.quantite,
        annuleId: tissuMouvement.annuleId,
        commandeLabel: tissuMouvement.commandeLabel,
        destination: tissuMouvement.destination,
        faconnierNom: tissuMouvement.faconnierNom,
        bon: tissuMouvement.bon,
      })
      .from(tissuMouvement)
      .where(inArray(tissuMouvement.rouleauId, ids))
      .orderBy(asc(tissuMouvement.id)),
    db
      .select({ lotId: tissuAffectation.lotId, commandeId: tissuAffectation.commandeId, label: tissuAffectation.commandeLabel })
      .from(tissuAffectation)
      .where(inArray(tissuAffectation.lotId, lotIds)),
  ]);
  const parRouleau = new Map<number, typeof mvts>();
  for (const m of mvts) parRouleau.set(m.rouleauId!, [...(parRouleau.get(m.rouleauId!) ?? []), m]);

  return rows.map(({ r, lot, rec, emplacement, zone }) => {
    const ms = parRouleau.get(r.id) ?? [];
    const eff = rl.mouvementsEffectifs(ms);
    const bilan = rl.bilanRouleau(r.metrageInitial, ms);
    const derniereSortie = [...eff].reverse().find((m) => m.sens === "sortie");
    const commandes = new Map<number, string>();
    for (const a of affs) if (a.lotId === lot.id && a.commandeId != null) commandes.set(a.commandeId, a.label);
    return {
      id: r.id,
      code: r.code,
      statut: r.statut,
      valide: r.valideLe != null,
      valideLe: iso(r.valideLe),
      validePar: r.validePar,
      metrageInitial: r.metrageInitial,
      metrageAnnonce: r.metrageAnnonce,
      laize: r.laize ?? lot.laize,
      poids: r.poids,
      observations: r.observations,
      emplacementId: r.emplacementId,
      emplacement: emplacement ?? "",
      zone: zone ?? "",
      lot: {
        id: lot.id, identifiant: lot.identifiant, reference: lot.reference, couleur: lot.couleur, codeCouleur: lot.codeCouleur,
        composition: lot.composition, lotFournisseur: lot.lotFournisseur, saison: lot.saison, unite: lot.unite, controle: lot.controle,
        archive: lot.archive,
      },
      reception: {
        id: rec.id, numero: rec.numero, date: rec.date, fournisseur: rec.fournisseur, client: rec.client, blClient: rec.blClient,
        commandeFournisseur: rec.commandeFournisseur,
      },
      commandes: [...commandes.entries()].map(([id, label]) => ({ id, label })),
      derniereCommande: derniereSortie?.commandeLabel ?? "",
      chez: bilan.enCoupe > 0.001 && derniereSortie ? rl.lieuSortie(derniereSortie) : "",
      bonSortie: derniereSortie?.bon ?? "",
      bilan,
      createdAt: iso(r.createdAt),
    };
  });
}

export async function getRouleau(code: string): Promise<{ rouleau: RouleauRow; mouvements: MouvementRouleauRow[] } | null> {
  const [rouleau] = await chargerRouleaux({ codes: [code] });
  if (!rouleau) return null;
  const mvts = await db.select().from(tissuMouvement).where(eq(tissuMouvement.rouleauId, rouleau.id)).orderBy(asc(tissuMouvement.id));
  const annules = new Set(mvts.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId!));
  return {
    rouleau,
    mouvements: mvts.map((m) => ({
      id: m.id, sens: m.sens, quantite: m.quantite, destination: m.destination, faconnierNom: m.faconnierNom, bon: m.bon,
      commandeId: m.commandeId, commandeLabel: m.commandeLabel,
      motif: m.motif, valeurAvant: m.valeurAvant, valeurApres: m.valeurApres, annuleId: m.annuleId, annule: annules.has(m.id),
      par: m.createdBy, date: iso(m.createdAt),
    })),
  };
}

/* ─────────── recherche ─────────── */

export type FiltreRouleaux = rl.FiltreRouleaux;

export async function rechercherRouleaux(f: FiltreRouleaux = {}): Promise<RouleauRow[]> {
  return rl.filtrerRouleaux(await chargerRouleaux(), f).reverse();
}

/* ─────────── emplacements ─────────── */

export type EmplacementRow = { id: number; code: string; zone: string; rayon: string; libelle: string; actif: boolean; rouleaux: number; metrage: number };

export async function listEmplacements(): Promise<EmplacementRow[]> {
  const [emps, rouleaux] = await Promise.all([
    db.select().from(tissuEmplacement).orderBy(asc(tissuEmplacement.code)),
    chargerRouleaux(),
  ]);
  return emps.map((e) => {
    const ici = rouleaux.filter((r) => r.emplacementId === e.id && r.bilan.disponible > 0.001);
    return {
      id: e.id, code: e.code, zone: e.zone, rayon: e.rayon, libelle: e.libelle, actif: e.actif,
      rouleaux: ici.length, metrage: Math.round(ici.reduce((s, r) => s + r.bilan.disponible, 0) * 100) / 100,
    };
  });
}

/* ─────────── inventaires ─────────── */

export type InventaireRow = {
  id: number;
  numero: string;
  statut: string;
  zone: string;
  note: string;
  ouvertPar: string;
  closPar: string;
  closLe: string;
  date: string;
  scans: { id: number; code: string; rouleauId: number | null; metrageConstate: number | null; emplacementCode: string; par: string; date: string }[];
  resultat: rl.ResultatInventaire;
};

/** Rouleaux censés être en rayon (réceptionnés, disponible > 0), dans la zone. */
function attendus(zone: string, rs: RouleauRow[]): rl.Attendu[] {
  return rs
    .filter((r) => r.valide && r.bilan.disponible > 0.001)
    .filter((r) => !zone || r.zone.toUpperCase() === zone.toUpperCase() || r.emplacement.toUpperCase().startsWith(zone.toUpperCase()))
    .map((r) => ({ id: r.id, code: r.code, disponible: r.bilan.disponible, emplacement: r.emplacement }));
}

export async function listInventaires(): Promise<InventaireRow[]> {
  const invs = await db.select().from(tissuInventaire).orderBy(desc(tissuInventaire.id));
  if (!invs.length) return [];
  const [scans, rs] = await Promise.all([
    db
      .select()
      .from(tissuInventaireScan)
      .where(inArray(tissuInventaireScan.inventaireId, invs.map((i) => i.id)))
      .orderBy(desc(tissuInventaireScan.id)),
    chargerRouleaux(),
  ]);
  const out: InventaireRow[] = [];
  for (const i of invs) {
    const ss = scans.filter((s) => s.inventaireId === i.id);
    out.push({
      id: i.id, numero: i.numero, statut: i.statut, zone: i.zone, note: i.note, ouvertPar: i.ouvertPar, closPar: i.closPar,
      closLe: iso(i.closLe), date: iso(i.createdAt),
      scans: ss.map((s) => ({ id: s.id, code: s.code, rouleauId: s.rouleauId, metrageConstate: s.metrageConstate, emplacementCode: s.emplacementCode, par: s.par, date: iso(s.createdAt) })),
      // Clos : le résultat figé à la clôture ; ouvert : recalculé en direct.
      resultat: (i.statut === "clos" && i.resultat ? i.resultat : rl.analyserInventaire(attendus(i.zone, rs), ss)) as rl.ResultatInventaire,
    });
  }
  return out;
}

export async function getInventaire(id: number): Promise<InventaireRow | null> {
  return (await listInventaires()).find((i) => i.id === id) ?? null;
}

/* ─────────── indicateurs ─────────── */

export async function indicateursRouleaux() {
  const rs = await chargerRouleaux();
  const i = rl.indicateurs(rs);
  const [dernier] = await listInventaires();
  const ecartsInventaire = dernier
    ? dernier.resultat.manquants.length + dernier.resultat.nonEnregistres.length + dernier.resultat.ecarts.length
    : null;
  return { ...i, total: rs.length, ecartsInventaire, dernierInventaire: dernier ? { numero: dernier.numero, statut: dernier.statut } : null };
}

/* ─────────── utilitaires d'écriture (partagés par les actions) ─────────── */

/** Recalcule et écrit le statut (cache) d'un rouleau après un mouvement. */
export async function recalculerStatut(ex: Executeur, rouleauId: number) {
  const [r] = await ex.select().from(tissuRouleau).where(eq(tissuRouleau.id, rouleauId));
  if (!r) return;
  const ms = await ex
    .select({ id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
    .from(tissuMouvement)
    .where(eq(tissuMouvement.rouleauId, rouleauId))
    .orderBy(asc(tissuMouvement.id));
  const b = rl.bilanRouleau(r.metrageInitial, ms);
  const derniere = [...rl.mouvementsEffectifs(ms)].reverse().find((m) => ["sortie", "rendu", "retour_fournisseur"].includes(m.sens));
  const statut = rl.statutRouleau(r.valideLe != null, b, derniere?.sens === "rendu" || derniere?.sens === "retour_fournisseur" ? derniere.sens : null);
  if (statut !== r.statut) await ex.update(tissuRouleau).set({ statut }).where(eq(tissuRouleau.id, rouleauId));
  return { bilan: b, statut };
}

/** Prochain code rouleau : séquence PostgreSQL (jamais deux fois le même). */
export async function prochainCodeRouleau(ex: Executeur, annee = new Date().getFullYear()): Promise<string> {
  const res = await ex.execute(sql`select nextval('tissu_rouleau_seq')::int as n`);
  const n = Number((res.rows[0] as { n: number }).n);
  return rl.formatCodeRouleau(annee, n);
}

/** Commandes proposées pour une sortie : celles du lot d'abord. Chacune dit
 * où elle se coupe — interne (chaîne) ou chez son façonnier — pour proposer
 * le bon lieu d'office. */
export async function commandesPourSortie(lotId: number | null) {
  const [affs, toutes] = await Promise.all([
    lotId == null ? Promise.resolve([]) : db.select({ commandeId: tissuAffectation.commandeId }).from(tissuAffectation).where(eq(tissuAffectation.lotId, lotId)),
    db
      .select({
        id: commande.id,
        of: commande.ofNumber,
        modele: commande.modele,
        archived: commande.archived,
        chaineId: commande.chaineId,
        faconnierId: commande.faconnierId,
        faconnierNom: faconnier.nom,
      })
      .from(commande)
      .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
      .orderBy(desc(commande.id)),
  ]);
  const reservees = new Set(affs.map((a) => a.commandeId));
  return toutes
    .filter((c) => !c.archived || reservees.has(c.id))
    .map((c) => {
      const st = !c.chaineId && c.faconnierId != null && rl.estSousTraitant(c.faconnierNom ?? "");
      return {
        id: c.id,
        label: `${c.of} · ${c.modele}`,
        reservee: reservees.has(c.id),
        faconnierId: st ? c.faconnierId : null,
        faconnierNom: st ? (c.faconnierNom ?? "") : "",
      };
    })
    .sort((a, b) => Number(b.reservee) - Number(a.reservee));
}

export type CommandeSortie = Awaited<ReturnType<typeof commandesPourSortie>>[number];

/** Sous-traitants (façonniers hors DBS / interne), pour le choix du lieu de coupe. */
export async function sousTraitants(): Promise<{ id: number; nom: string }[]> {
  const rows = await db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier).orderBy(asc(faconnier.nom));
  return rows.filter((f) => rl.estSousTraitant(f.nom));
}

/* ─────────── bons de sortie groupée (BST) ─────────── */

export type BonSortie = {
  numero: string;
  date: string;
  par: string;
  destination: string;
  lieu: string;
  faconnierNom: string;
  commandeLabel: string;
  plusieursCommandes: boolean;
  /** Sorties sur plusieurs jours (bon établi après coup) : date de la dernière. */
  dateFin: string;
  /** Qui a sorti les rouleaux (plusieurs noms pour un bon établi après coup). */
  sortiPar: string[];
  motif: string;
  lignes: { id: number; commande: string; code: string; lot: string; tissu: string; couleur: string; lotFournisseur: string; laize: number | null; quantite: number; unite: string; annule: boolean }[];
};

/** Un bon de sortie groupée, reconstitué depuis les mouvements qui le portent. */
export async function bonSortie(numero: string): Promise<BonSortie | null> {
  const mvts = await db
    .select()
    .from(tissuMouvement)
    .where(eq(tissuMouvement.bon, numero))
    .orderBy(asc(tissuMouvement.id));
  const sorties = mvts.filter((m) => m.sens === "sortie");
  if (!sorties.length) return null;
  const annules = new Set(
    (await db.select({ annuleId: tissuMouvement.annuleId }).from(tissuMouvement).where(inArray(tissuMouvement.annuleId, sorties.map((m) => m.id)))).map(
      (x) => x.annuleId,
    ),
  );
  const rs = new Map((await chargerRouleaux({ ids: sorties.map((m) => m.rouleauId!).filter((x) => x != null) })).map((r) => [r.id, r]));
  const m0 = sorties[0];
  const labels = [...new Set(sorties.map((m) => m.commandeLabel))];
  return {
    numero,
    date: iso(m0.createdAt),
    dateFin: iso(sorties.at(-1)!.createdAt),
    par: m0.createdBy,
    sortiPar: [...new Set(sorties.map((m) => m.createdBy).filter(Boolean))],
    destination: m0.destination,
    lieu: rl.lieuSortie(m0),
    faconnierNom: m0.faconnierNom,
    // Une seule commande : en tête du bon ; plusieurs : « Plusieurs », détail par ligne.
    commandeLabel: labels.length === 1 ? labels[0] : "",
    plusieursCommandes: labels.length > 1,
    motif: m0.motif === numero || /^Sortie /.test(m0.motif) ? "" : m0.motif,
    lignes: sorties.map((m) => {
      const r = rs.get(m.rouleauId!);
      return {
        id: m.id,
        commande: m.commandeLabel,
        code: r?.code ?? "?",
        lot: r?.lot.identifiant ?? "",
        tissu: [r?.lot.reference, r?.lot.composition].filter(Boolean).join(" · "),
        couleur: [r?.lot.couleur, r?.lot.codeCouleur].filter(Boolean).join(" · "),
        lotFournisseur: r?.lot.lotFournisseur ?? "",
        laize: r?.laize ?? null,
        quantite: m.quantite,
        unite: r?.lot.unite ?? "m",
        annule: annules.has(m.id),
      };
    }),
  };
}

/** Derniers bons de sortie groupée (pour les réimprimer). */
export async function listBonsSortie(limite = 30) {
  const rows = await db
    .select({ bon: tissuMouvement.bon, quantite: tissuMouvement.quantite, lieu: tissuMouvement.faconnierNom, destination: tissuMouvement.destination, commande: tissuMouvement.commandeLabel, date: tissuMouvement.createdAt })
    .from(tissuMouvement)
    .where(and(eq(tissuMouvement.sens, "sortie"), sql`${tissuMouvement.bon} <> ''`))
    .orderBy(desc(tissuMouvement.id));
  const par = new Map<string, { numero: string; date: string; lieu: string; commande: string; rouleaux: number; metrage: number }>();
  for (const r of rows) {
    const e = par.get(r.bon) ?? { numero: r.bon, date: iso(r.date), lieu: rl.lieuSortie({ destination: r.destination, faconnierNom: r.lieu }), commande: r.commande, rouleaux: 0, metrage: 0 };
    e.rouleaux++;
    if (e.commande !== r.commande) e.commande = "plusieurs commandes";
    e.metrage = Math.round((e.metrage + r.quantite) * 100) / 100;
    par.set(r.bon, e);
  }
  // Par n° décroissant : un bon établi après coup porte des sorties anciennes
  // mais reste le plus récent.
  return [...par.values()].sort((a, b) => b.numero.localeCompare(a.numero, "fr", { numeric: true })).slice(0, limite);
}
