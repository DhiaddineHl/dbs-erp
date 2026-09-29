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

export type MouvementFait = { sens: string; quantite: number; id?: number; annuleId?: number | null };
export type AffectationFait = { quantite: number };

export type BilanLot = {
  recu: number;
  affecte: number;
  consomme: number;
  /** Rendu au client (reliquat) : sort du stock sans être consommé. */
  rendu: number;
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
  let rendu = 0;
  /* Les annulations neutralisent un mouvement sans l'effacer ; consommation,
   * chute, mise en stock et déplacement ne touchent pas au stock (la sortie
   * l'a déjà décompté). Le retour fournisseur sort du stock comme un rendu. */
  const annules = new Set(mouvements.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId));
  for (const m of mouvements) {
    if (m.sens === "annulation" || (m.id != null && annules.has(m.id))) continue;
    const q = m.quantite || 0;
    if (m.sens === "sortie") sorties += q;
    else if (m.sens === "retour") retours += q;
    else if (m.sens === "rendu" || m.sens === "retour_fournisseur") rendu += q;
    else if (m.sens === "ajustement") ajust += q; // déjà signé à l'écriture
  }
  const consomme = Math.max(0, sorties - retours);
  const disponible = recu - consomme - rendu + ajust;
  return {
    recu: r2(recu),
    affecte: r2(affecte),
    consomme: r2(consomme),
    rendu: r2(rendu),
    disponible: r2(disponible),
    // Ce qui est rendu au client ne se réserve plus.
    libre: r2(recu - affecte - rendu),
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

/* ═══════════ contrôle à réception contre le BL du client ═══════════
 *
 * Le client fournit le tissu (CM) : ce qui compte, c'est ce qu'il ANNONCE sur
 * son bon de livraison face à ce qu'on MESURE. L'écart doit sortir tout de
 * suite, pour réclamer AVANT la coupe — après, plus personne ne peut prouver
 * que le manque était là à l'arrivée. */

export type RouleauControle = { n: string; annonce: number | null; mesure: number | null; laize: number | null; defauts: string };

export type LotAControler = {
  quantiteRecue: number;
  quantiteAnnoncee: number | null;
  laize: number | null;
  laizeAnnoncee: number | null;
  defauts: string;
  rouleaux?: RouleauControle[];
  unite?: string;
};

/** Tolérances : un écart plus petit est du bruit de mesure, pas un litige. */
export const TOLERANCE_METRAGE_PCT = 0.5;
export const TOLERANCE_METRAGE_MIN = 0.5;
export const TOLERANCE_LAIZE_CM = 1;

export type EcartsReception = {
  annonce: number | null;
  mesure: number;
  /** Mesuré − annoncé (négatif = manque), null si rien d'annoncé. */
  ecartMetrage: number | null;
  manque: number;
  /** Laize réelle − annoncée (cm). */
  ecartLaize: number | null;
  laizeNonConforme: boolean;
  /** Défauts du lot et des rouleaux (« R3 : trou »). */
  defauts: string[];
  /** Motifs de réclamation, prêts à imprimer. */
  motifs: string[];
  aReclamer: boolean;
};

export function ecartsReception(l: LotAControler): EcartsReception {
  const u = l.unite || "m";
  const annonce = l.quantiteAnnoncee != null && l.quantiteAnnoncee > 0 ? l.quantiteAnnoncee : null;
  const mesure = l.quantiteRecue || 0;
  const ecartMetrage = annonce == null ? null : r2(mesure - annonce);
  const tol = annonce == null ? 0 : Math.max(TOLERANCE_METRAGE_MIN, (annonce * TOLERANCE_METRAGE_PCT) / 100);
  const manque = ecartMetrage != null && ecartMetrage < -tol ? r2(-ecartMetrage) : 0;

  const ecartLaize = l.laize != null && l.laizeAnnoncee != null && l.laizeAnnoncee > 0 ? r2(l.laize - l.laizeAnnoncee) : null;
  const laizeNonConforme = ecartLaize != null && Math.abs(ecartLaize) > TOLERANCE_LAIZE_CM;

  const defauts: string[] = [];
  if (l.defauts.trim()) defauts.push(l.defauts.trim());
  const motifs: string[] = [];
  for (const r of l.rouleaux ?? []) {
    if (r.defauts.trim()) defauts.push(`Rouleau ${r.n || "?"} : ${r.defauts.trim()}`);
    if (r.annonce != null && r.mesure != null && r.annonce - r.mesure > TOLERANCE_METRAGE_MIN) {
      motifs.push(`Rouleau ${r.n || "?"} : ${r2(r.mesure)} ${u} mesurés pour ${r2(r.annonce)} ${u} étiquetés`);
    }
    if (r.laize != null && l.laizeAnnoncee != null && Math.abs(r.laize - l.laizeAnnoncee) > TOLERANCE_LAIZE_CM) {
      motifs.push(`Rouleau ${r.n || "?"} : laize ${r.laize} cm au lieu de ${l.laizeAnnoncee} cm`);
    }
  }
  if (manque > 0) motifs.unshift(`Manque ${manque} ${u} : ${r2(mesure)} ${u} mesurés pour ${annonce} ${u} annoncés`);
  if (laizeNonConforme) motifs.push(`Laize non conforme : ${l.laize} cm mesurés pour ${l.laizeAnnoncee} cm annoncés`);
  for (const d of defauts) motifs.push(`Défaut : ${d}`);

  return { annonce, mesure, ecartMetrage, manque, ecartLaize, laizeNonConforme, defauts, motifs, aReclamer: motifs.length > 0 };
}

/** Totaux d'une fiche rouleaux — pour pré-remplir annoncé / mesuré du lot. */
export function totauxRouleaux(rouleaux: RouleauControle[]): { annonce: number | null; mesure: number | null } {
  const somme = (k: "annonce" | "mesure") => {
    const v = rouleaux.map((r) => r[k]).filter((x): x is number => x != null);
    return v.length ? r2(v.reduce((s, x) => s + x, 0)) : null;
  };
  return { annonce: somme("annonce"), mesure: somme("mesure") };
}

/* ═══════════ affectation : lots proposés pour une commande ═══════════
 *
 * Même client, même référence, même couleur : c'est le tissu de ce client pour
 * cet article. Un lot d'un autre client n'est JAMAIS proposé (matière du
 * client, on ne la prête pas). */

const norm = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

export type LotCandidat = { id: number; identifiant: string; client: string; reference: string; couleur: string; libre: number; controle: string };
export type CibleAffectation = { client: string; reference: string; couleur: string };

export function proposerLots<T extends LotCandidat>(cible: CibleAffectation, lots: T[]): (T & { score: number; raison: string })[] {
  const out: (T & { score: number; raison: string })[] = [];
  for (const l of lots) {
    if (l.libre <= 0.001 || l.controle === "refuse") continue;
    const memeClient = !!cible.client && !!l.client && norm(cible.client) === norm(l.client);
    if (cible.client && l.client && !memeClient) continue;
    if (cible.couleur && l.couleur && norm(cible.couleur) !== norm(l.couleur)) continue;
    const memeRef = !!cible.reference && !!l.reference && norm(cible.reference) === norm(l.reference);
    if (cible.reference && l.reference && !memeRef) continue;
    const memeCouleur = !!cible.couleur && !!l.couleur;
    if (!memeCouleur && !memeRef) continue; // rien de commun : pas une proposition
    const score = (memeClient ? 4 : 0) + (memeRef ? 2 : 0) + (memeCouleur ? 1 : 0);
    const raison = [memeClient && "même client", memeRef && "même référence", memeCouleur && "même couleur"].filter(Boolean).join(" · ");
    out.push({ ...l, score, raison });
  }
  return out.sort((a, b) => b.score - a.score || b.libre - a.libre);
}

/* ═══════════ besoin vs reçu d'une commande ═══════════ */

export type EtatMatiereCommande = {
  besoin: number;
  affecte: number;
  consomme: number;
  /** Besoin non couvert par ce qui est affecté. */
  manque: number;
  /** Ce que les lots libres du client pourraient encore couvrir. */
  couvrableEnStock: number;
  /** À demander au client : manque que le stock ne couvre pas. */
  aDemander: number;
  niveau: "sans_besoin" | "couvert" | "stock" | "manque";
};

export function etatMatiereCommande(besoin: number, affecte: number, consomme: number, libreCandidats: number): EtatMatiereCommande {
  const manque = r2(Math.max(0, besoin - affecte));
  const couvrableEnStock = r2(Math.min(manque, Math.max(0, libreCandidats)));
  const aDemander = r2(manque - couvrableEnStock);
  const niveau =
    besoin <= 0.001 ? "sans_besoin" : manque <= 0.001 ? "couvert" : aDemander <= 0.001 ? "stock" : "manque";
  return { besoin: r2(besoin), affecte: r2(affecte), consomme: r2(consomme), manque, couvrableEnStock, aDemander, niveau };
}

/* ═══════════ bilan matière de fin de commande ═══════════
 *
 * Preuve face au client : ce qu'il a fourni, ce qui a été coupé, pour combien
 * de pièces, et ce qu'on lui rend. La conso réelle se compare à SA conso
 * (celle de la nomenclature, donnée par le client). */

export type BilanMatiere = {
  recu: number;
  consomme: number;
  rendu: number;
  /** Reste encore en magasin (reçu − consommé − rendu). */
  reste: number;
  pieces: number;
  /** Consommation théorique pour les pièces coupées (conso client × pièces). */
  theorique: number | null;
  /** consommé − théorique : > 0 surconsommation (chute), < 0 économie. */
  chute: number | null;
  chutePct: number | null;
  consoReelle: number | null;
  consoClient: number | null;
  ecartConsoPct: number | null;
};

export function bilanMatiere(v: { recu: number; consomme: number; rendu: number; pieces: number; consoClient: number | null }): BilanMatiere {
  const consoClient = v.consoClient && v.consoClient > 0 ? v.consoClient : null;
  const theorique = consoClient && v.pieces > 0 ? r2(consoClient * v.pieces) : null;
  const chute = theorique != null && v.consomme > 0 ? r2(v.consomme - theorique) : null;
  const consoReelle = v.pieces > 0 && v.consomme > 0 ? Math.round((v.consomme / v.pieces) * 1000) / 1000 : null;
  return {
    recu: r2(v.recu),
    consomme: r2(v.consomme),
    rendu: r2(v.rendu),
    reste: r2(v.recu - v.consomme - v.rendu),
    pieces: v.pieces,
    theorique,
    chute,
    chutePct: chute != null && theorique ? Math.round((chute / theorique) * 1000) / 10 : null,
    consoReelle,
    consoClient,
    ecartConsoPct: consoReelle != null && consoClient ? Math.round(((consoReelle - consoClient) / consoClient) * 1000) / 10 : null,
  };
}

/* ═══════════ reliquats non rendus ═══════════ */

export type LotReliquat = {
  id: number;
  identifiant: string;
  client: string;
  saison: string;
  reference: string;
  couleur: string;
  unite: string;
  disponible: number;
  /** Une commande encore en cours compte sur ce lot : ce n'est pas un reliquat. */
  enCours: boolean;
};

export type GroupeReliquats = { client: string; saison: string; lots: LotReliquat[]; totalParUnite: Record<string, number> };

export function reliquats(lots: LotReliquat[]): GroupeReliquats[] {
  const groupes = new Map<string, GroupeReliquats>();
  for (const l of lots) {
    if (l.enCours || l.disponible <= 0.01) continue;
    const client = l.client || "Client non renseigné";
    const saison = l.saison || "Sans saison";
    const k = `${client}\u0000${saison}`;
    const g = groupes.get(k) ?? { client, saison, lots: [], totalParUnite: {} };
    g.lots.push(l);
    g.totalParUnite[l.unite] = r2((g.totalParUnite[l.unite] ?? 0) + l.disponible);
    groupes.set(k, g);
  }
  return [...groupes.values()].sort((a, b) => a.client.localeCompare(b.client) || b.saison.localeCompare(a.saison));
}
