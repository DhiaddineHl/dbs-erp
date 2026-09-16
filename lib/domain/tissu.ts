/* Magasin tissu — logique métier pure (testable sans base).
 *
 * Un lot a UNE quantité reçue figée. Tout le reste se dérive :
 *   affecté   = somme des affectations
 *   consommé  = somme des mouvements de sortie − retours
 *   disponible physiquement = reçu − consommé (± ajustements)
 *   libre à affecter        = reçu − affecté
 *
 * On distingue bien AFFECTÉ (réservé) de CONSOMMÉ (sorti). Le « disponible »
 * qui compte pour le magasin est le disponible PHYSIQUE (ce qui est encore en
 * rayon) ; le « libre » est ce qui peut encore être réservé. */

export type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "brand";

export type MouvementFait = { sens: string; quantite: number };
export type AffectationFait = { quantite: number };

export type BilanLot = {
  recu: number;
  affecte: number;
  consomme: number;
  /** Encore physiquement en stock (reçu − consommé net). */
  disponible: number;
  /** Encore réservable (reçu − affecté). */
  libre: number;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export function bilanLot(recu: number, affectations: AffectationFait[], mouvements: MouvementFait[]): BilanLot {
  const affecte = affectations.reduce((s, a) => s + (a.quantite || 0), 0);
  let sorties = 0;
  let retours = 0;
  let ajust = 0;
  for (const m of mouvements) {
    const q = m.quantite || 0;
    if (m.sens === "sortie") sorties += q;
    else if (m.sens === "retour") retours += q;
    else if (m.sens === "ajustement") ajust += q; // déjà signé à l'écriture
  }
  const consomme = Math.max(0, sorties - retours);
  const disponible = recu - consomme + ajust;
  return {
    recu: r2(recu),
    affecte: r2(affecte),
    consomme: r2(consomme),
    disponible: r2(disponible),
    libre: r2(recu - affecte),
  };
}

/* ─────────── statut d'un lot ─────────── */

export type StatutLot = { kind: string; label: string; tone: Tone };

/** Statut de stock d'un lot, pour l'inventaire et le dashboard. */
export function statutLot(b: BilanLot): StatutLot {
  if (b.disponible <= 0.001) return { kind: "epuise", label: "Épuisé", tone: "neutral" };
  if (b.libre <= 0.001) return { kind: "reserve", label: "Entièrement réservé", tone: "warning" };
  if (b.affecte <= 0.001) return { kind: "libre", label: "Disponible, non affecté", tone: "info" };
  return { kind: "partiel", label: "Partiellement affecté", tone: "success" };
}

/* ─────────── besoin d'une commande vs couverture ───────────
 *
 * Le besoin théorique vient de la nomenclature (conso × qté, avec chute) et ne
 * change pas. Ce qu'on ajoute, c'est la confrontation avec ce qui a été
 * réellement AFFECTÉ à la commande depuis les lots, puis CONSOMMÉ. */

export type CouvertureCommande = {
  besoin: number;
  affecte: number;
  consomme: number;
  /** besoin − affecté : ce qu'il reste à réserver depuis le stock. */
  resteAAffecter: number;
  statut: StatutLot;
};

export function couvertureCommande(
  besoin: number,
  affectations: AffectationFait[],
  mouvements: MouvementFait[],
): CouvertureCommande {
  const affecte = affectations.reduce((s, a) => s + (a.quantite || 0), 0);
  const consomme = mouvements.filter((m) => m.sens === "sortie").reduce((s, m) => s + (m.quantite || 0), 0);
  const resteAAffecter = r2(besoin - affecte);

  let statut: StatutLot;
  if (besoin <= 0.001) statut = { kind: "sans_besoin", label: "Sans besoin défini", tone: "neutral" };
  else if (affecte <= 0.001) statut = { kind: "non_affecte", label: "🟠 Besoin non affecté", tone: "warning" };
  else if (affecte + 0.001 < besoin) statut = { kind: "partiel", label: "🟠 Partiellement couvert", tone: "warning" };
  else statut = { kind: "couvert", label: "🟢 Besoin couvert", tone: "success" };

  return { besoin: r2(besoin), affecte: r2(affecte), consomme: r2(consomme), resteAAffecter, statut };
}

/* ─────────── comparaison besoin ↔ réception, par couleur ───────────
 *
 * Regroupe le besoin théorique et le reçu par couleur (le point 4 de la
 * demande) : suffisant / partiel / manquant. */

export type LigneBesoinCouleur = { couleur: string; besoin: number; recu: number; ecart: number; statut: StatutLot };

export function comparerBesoinReception(
  besoins: { couleur: string; besoin: number }[],
  recus: { couleur: string; recu: number }[],
): LigneBesoinCouleur[] {
  const cle = (s: string) => s.trim().toLowerCase();
  const parCouleur = new Map<string, { couleur: string; besoin: number; recu: number }>();
  for (const b of besoins) {
    const k = cle(b.couleur);
    const e = parCouleur.get(k) ?? { couleur: b.couleur, besoin: 0, recu: 0 };
    e.besoin += b.besoin || 0;
    parCouleur.set(k, e);
  }
  for (const r of recus) {
    const k = cle(r.couleur);
    const e = parCouleur.get(k) ?? { couleur: r.couleur, besoin: 0, recu: 0 };
    e.recu += r.recu || 0;
    parCouleur.set(k, e);
  }
  return [...parCouleur.values()].map((e) => {
    const ecart = r2(e.recu - e.besoin);
    let statut: StatutLot;
    if (e.recu <= 0.001) statut = { kind: "manquant", label: "🔴 Manquant", tone: "danger" };
    else if (e.recu + 0.001 < e.besoin) statut = { kind: "partiel", label: "🟠 Partiellement reçu", tone: "warning" };
    else statut = { kind: "suffisant", label: "🟢 Suffisant", tone: "success" };
    return { couleur: e.couleur, besoin: r2(e.besoin), recu: r2(e.recu), ecart, statut };
  });
}

/** Suggère le prochain identifiant de lot pour une couleur : AUBER-01, AUBER-02…
 * à partir des identifiants déjà pris. Base dérivée de la couleur (5 lettres). */
export function prochainIdentifiant(couleur: string, existants: string[]): string {
  const base =
    couleur
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toUpperCase()
      .replace(/[^A-Z]/g, "")
      .slice(0, 5) || "LOT";
  let n = 1;
  const pris = new Set(existants.map((x) => x.toUpperCase()));
  let id = `${base}-${String(n).padStart(2, "0")}`;
  while (pris.has(id)) {
    n += 1;
    id = `${base}-${String(n).padStart(2, "0")}`;
  }
  return id;
}

/* ─────────── tableau de bord magasin ───────────
 *
 * Agrège les bilans de tous les lots. Tout est dérivé — aucun total stocké. */

export type LotAgrege = {
  quantiteRecue: number;
  bilan: BilanLot;
  statutKind: string;
};

export type DashboardTissu = {
  nbLots: number;
  totalRecu: number;
  totalAffecte: number;
  totalConsomme: number;
  totalDisponible: number;
  totalLibre: number;
  lotsLibres: number;
  lotsReserves: number;
  lotsEpuises: number;
  /** Lots avec du disponible mais rien d'affecté (dispo dormant). */
  lotsSansAffectation: number;
  /** Affecté mais pas encore consommé (réservé en attente de coupe). */
  lotsAffectesNonConsommes: number;
};

export function dashboardTissu(lots: LotAgrege[]): DashboardTissu {
  const d: DashboardTissu = {
    nbLots: lots.length,
    totalRecu: 0,
    totalAffecte: 0,
    totalConsomme: 0,
    totalDisponible: 0,
    totalLibre: 0,
    lotsLibres: 0,
    lotsReserves: 0,
    lotsEpuises: 0,
    lotsSansAffectation: 0,
    lotsAffectesNonConsommes: 0,
  };
  for (const l of lots) {
    d.totalRecu += l.bilan.recu;
    d.totalAffecte += l.bilan.affecte;
    d.totalConsomme += l.bilan.consomme;
    d.totalDisponible += l.bilan.disponible;
    d.totalLibre += l.bilan.libre;
    if (l.statutKind === "libre") d.lotsLibres += 1;
    if (l.statutKind === "reserve") d.lotsReserves += 1;
    if (l.statutKind === "epuise") d.lotsEpuises += 1;
    if (l.bilan.affecte <= 0.001 && l.bilan.disponible > 0.001) d.lotsSansAffectation += 1;
    if (l.bilan.affecte > 0.001 && l.bilan.consomme + 0.001 < l.bilan.affecte) d.lotsAffectesNonConsommes += 1;
  }
  for (const k of ["totalRecu", "totalAffecte", "totalConsomme", "totalDisponible", "totalLibre"] as const) {
    d[k] = r2(d[k]);
  }
  return d;
}
