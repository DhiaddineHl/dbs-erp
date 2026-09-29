import type { Tone } from "@/components/shared/status-badge";
import { estSousTraitee } from "./commande";

/* Rouleau physique de tissu — logique pure (testable sans base).
 *
 * Règle validée :
 *   - la SORTIE du magasin diminue le stock du rouleau ;
 *   - la CONSOMMATION et la CHUTE disent ensuite ce que la coupe a fait du
 *     tissu sorti — elles ne touchent pas au stock (déjà décompté) ;
 *   - un RETOUR remet en stock du tissu sorti et non utilisé ;
 *   - RENDU (au client) et RETOUR FOURNISSEUR sortent du stock sans être
 *     consommés ;
 *   - une CORRECTION (ajustement signé) corrige le disponible, avec motif ;
 *   - une ANNULATION neutralise un mouvement sans l'effacer.
 *
 *   disponible = initial − sorti + retour − rendu − retour fournisseur ± corrections
 *   en coupe (sorti non soldé) = sorti − retour − consommé − chute */

export type SensRouleau =
  | "entree"
  | "mise_en_stock"
  | "sortie"
  | "retour"
  | "consommation"
  | "chute"
  | "rendu"
  | "retour_fournisseur"
  | "ajustement"
  | "deplacement"
  | "annulation";

export const SENS: Record<SensRouleau, { label: string; tone: Tone }> = {
  entree: { label: "Réception", tone: "info" },
  mise_en_stock: { label: "Entrée magasin", tone: "success" },
  sortie: { label: "Sortie", tone: "danger" },
  retour: { label: "Retour en stock", tone: "info" },
  consommation: { label: "Consommation", tone: "brand" },
  chute: { label: "Chute", tone: "warning" },
  rendu: { label: "Rendu client", tone: "purple" },
  retour_fournisseur: { label: "Retour fournisseur", tone: "purple" },
  ajustement: { label: "Correction", tone: "warning" },
  deplacement: { label: "Déplacement", tone: "neutral" },
  annulation: { label: "Annulation", tone: "neutral" },
};
export const sensLabel = (s: string) => SENS[s as SensRouleau]?.label ?? s;

export const DESTINATIONS = [
  { value: "coupe", label: "Coupe interne" },
  { value: "soustraitant", label: "Sous-traitant" },
  { value: "atelier", label: "Atelier" },
  { value: "autre", label: "Autre" },
] as const;
export const destinationLabel = (v: string) => DESTINATIONS.find((d) => d.value === v)?.label ?? v;

/** Un façonnier nommé « DBS » ou « interne » n'est pas un sous-traitant
 * (même règle que les commandes : lib/domain/commande → estSousTraitee). */
export const estSousTraitant = (nom: string) => estSousTraitee({ faconnier: nom });

/** Où se trouve le tissu sorti : « Coupe interne », « chez <sous-traitant> »… */
export function lieuSortie(m: { destination: string; faconnierNom?: string }): string {
  if (m.destination === "soustraitant") return m.faconnierNom ? `chez ${m.faconnierNom}` : "chez un sous-traitant";
  return destinationLabel(m.destination);
}

export type StatutRouleau = "en_attente" | "en_stock" | "sorti" | "epuise" | "rendu" | "retourne";
export const STATUTS_ROULEAU: Record<StatutRouleau, { label: string; tone: Tone }> = {
  en_attente: { label: "En attente de réception", tone: "warning" },
  en_stock: { label: "En stock", tone: "success" },
  sorti: { label: "Sorti (en coupe)", tone: "brand" },
  epuise: { label: "Épuisé", tone: "neutral" },
  rendu: { label: "Rendu au client", tone: "purple" },
  retourne: { label: "Retourné au fournisseur", tone: "purple" },
};
export const statutLabel = (s: string) => STATUTS_ROULEAU[s as StatutRouleau] ?? { label: s, tone: "neutral" as Tone };

export type MouvementRouleau = { id: number; sens: string; quantite: number; annuleId?: number | null };

/** Les mouvements qui comptent : ni les annulations, ni ce qu'elles annulent. */
export function mouvementsEffectifs<T extends MouvementRouleau>(mvts: T[]): T[] {
  const annules = new Set(mvts.filter((m) => m.sens === "annulation" && m.annuleId != null).map((m) => m.annuleId!));
  return mvts.filter((m) => m.sens !== "annulation" && !annules.has(m.id));
}

const r2 = (n: number) => Math.round(n * 100) / 100 + 0; // + 0 : jamais « -0 » à l'écran

export type BilanRouleau = {
  initial: number;
  sorti: number;
  retour: number;
  consomme: number;
  chute: number;
  rendu: number;
  retourFournisseur: number;
  corrections: number;
  /** Encore physiquement au magasin. */
  disponible: number;
  /** Sorti, pas encore revenu ni déclaré consommé / chuté. */
  enCoupe: number;
};

export function bilanRouleau(initial: number, mvts: MouvementRouleau[]): BilanRouleau {
  const b = { sortie: 0, retour: 0, consommation: 0, chute: 0, rendu: 0, retour_fournisseur: 0, ajustement: 0 };
  for (const m of mouvementsEffectifs(mvts)) {
    if (m.sens in b) b[m.sens as keyof typeof b] += m.quantite || 0;
  }
  return {
    initial: r2(initial),
    sorti: r2(b.sortie),
    retour: r2(b.retour),
    consomme: r2(b.consommation),
    chute: r2(b.chute),
    rendu: r2(b.rendu),
    retourFournisseur: r2(b.retour_fournisseur),
    corrections: r2(b.ajustement),
    disponible: r2(initial - b.sortie + b.retour - b.rendu - b.retour_fournisseur + b.ajustement),
    enCoupe: r2(b.sortie - b.retour - b.consommation - b.chute),
  };
}

/** Statut déduit : jamais saisi à la main. */
export function statutRouleau(valide: boolean, b: BilanRouleau, derniereSortieHors?: "rendu" | "retour_fournisseur" | null): StatutRouleau {
  if (!valide) return "en_attente";
  if (b.disponible > 0.001) return "en_stock";
  if (b.enCoupe > 0.001) return "sorti";
  if (derniereSortieHors === "rendu") return "rendu";
  if (derniereSortieHors === "retour_fournisseur") return "retourne";
  return "epuise";
}

/* ─────────── garde-fous ─────────── */

const EPS = 0.001;
export type Refus = string | null;

export function refusSortie(valide: boolean, b: BilanRouleau, q: number): Refus {
  if (!valide) return "Rouleau pas encore réceptionné : validez d'abord sa réception.";
  if (!(q > 0)) return "Quantité à sortir invalide.";
  if (q > b.disponible + EPS) return `Il ne reste que ${b.disponible} m sur ce rouleau.`;
  return null;
}
export function refusRetour(b: BilanRouleau, q: number): Refus {
  if (!(q > 0)) return "Quantité retournée invalide.";
  if (q > b.enCoupe + EPS) return `Seuls ${Math.max(0, b.enCoupe)} m sortis ne sont ni revenus ni consommés.`;
  return null;
}
export function refusConsommation(b: BilanRouleau, consomme: number, chute: number): Refus {
  if (consomme < 0 || chute < 0 || !(consomme + chute > 0)) return "Indiquez le métrage consommé et / ou la chute.";
  if (consomme + chute > b.enCoupe + EPS) return `Consommation + chute (${r2(consomme + chute)} m) supérieure au tissu sorti non soldé (${Math.max(0, b.enCoupe)} m).`;
  return null;
}
export function refusSortieDefinitive(valide: boolean, b: BilanRouleau, q: number): Refus {
  if (!valide) return "Rouleau pas encore réceptionné.";
  if (!(q > 0)) return "Quantité invalide.";
  if (q > b.disponible + EPS) return `Il ne reste que ${b.disponible} m en stock.`;
  return null;
}
export function refusCorrection(nouveauDisponible: number, b: BilanRouleau, motif: string): Refus {
  if (!motif.trim()) return "Le motif de la correction est obligatoire.";
  if (!(nouveauDisponible >= 0)) return "Métrage corrigé invalide.";
  if (Math.abs(nouveauDisponible - b.disponible) < EPS) return "Le métrage corrigé est identique au disponible.";
  return null;
}

/* ─────────── codes et QR ─────────── */

export const formatCodeRouleau = (annee: number, n: number) => `R-${annee}-${String(n).padStart(6, "0")}`;

/** Lit ce que renvoie un scan : l'adresse du QR (…/r/R-2026-000145), le texte
 * tapé par une douchette (« DBS-R-2026-000145 », minuscules, espaces) ou un
 * emplacement (…/e/A03-12, « EMP:A03-12 »). */
export function lireScan(brut: string): { type: "rouleau" | "emplacement"; code: string } | null {
  const t = decodeURIComponent((brut ?? "").trim()).toUpperCase().replace(/\s+/g, "");
  if (!t) return null;
  const r = /R-(\d{4})-(\d{1,6})(?!\d)/.exec(t);
  if (r) return { type: "rouleau", code: formatCodeRouleau(Number(r[1]), Number(r[2])) };
  const e = /(?:\/E\/|^EMP[:\-])([A-Z0-9][A-Z0-9\-_.]*)$/.exec(t);
  if (e) return { type: "emplacement", code: e[1] };
  return null;
}

export const normaliserEmplacement = (s: string) => (s ?? "").trim().toUpperCase().replace(/\s+/g, "");

/* ─────────── recherche ─────────── */

export type FiltreRouleaux = { q?: string; statut?: string; emplacement?: string; fournisseur?: string; sansEmplacement?: boolean };

type RouleauCherchable = {
  code: string;
  statut: string;
  emplacement: string;
  derniereCommande: string;
  chez?: string;
  lot: { identifiant: string; reference: string; couleur: string; codeCouleur: string; lotFournisseur: string; saison: string };
  reception: { numero: string; fournisseur: string; client: string; blClient: string; commandeFournisseur: string };
  commandes: { label: string }[];
};

const sansAccents = (s: string) => (s ?? "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();

/** Recherche multicritère (code scanné, tissu, couleur, lot fournisseur,
 * commande, fournisseur, client, emplacement, statut). Un code rouleau exact
 * (même tapé par une douchette) ne renvoie que ce rouleau. */
export function filtrerRouleaux<T extends RouleauCherchable>(rouleaux: T[], f: FiltreRouleaux): T[] {
  const scan = f.q ? lireScan(f.q) : null;
  const q = sansAccents(f.q ?? "").trim();
  return rouleaux.filter((r) => {
    if (f.statut && r.statut !== f.statut) return false;
    if (f.sansEmplacement && r.emplacement) return false;
    if (f.emplacement && !sansAccents(r.emplacement).startsWith(sansAccents(f.emplacement))) return false;
    if (f.fournisseur && !sansAccents(r.reception.fournisseur).includes(sansAccents(f.fournisseur))) return false;
    if (scan?.type === "rouleau") return r.code === scan.code;
    if (!q) return true;
    const texte = [
      r.code, r.lot.identifiant, r.lot.reference, r.lot.couleur, r.lot.codeCouleur, r.lot.lotFournisseur, r.lot.saison,
      r.reception.numero, r.reception.fournisseur, r.reception.client, r.reception.blClient, r.reception.commandeFournisseur,
      r.emplacement, statutLabel(r.statut).label, r.derniereCommande, r.chez ?? "", ...r.commandes.map((c) => c.label),
    ].join(" ");
    return sansAccents(texte).includes(q);
  });
}

/* ─────────── inventaire ─────────── */

export type Attendu = { id: number; code: string; disponible: number; emplacement: string };
export type Scan = { code: string; rouleauId: number | null; metrageConstate: number | null; emplacementCode: string };
export const TOLERANCE_INVENTAIRE = 0.5;

export type ResultatInventaire = {
  attendus: number;
  scannes: number;
  trouves: number;
  manquants: Attendu[];
  /** Scannés mais inconnus, ou pas censés être en stock. */
  nonEnregistres: Scan[];
  ecarts: (Attendu & { constate: number; ecart: number })[];
  /** Trouvés ailleurs que leur emplacement théorique. */
  malRanges: (Attendu & { trouveA: string })[];
};

export function analyserInventaire(attendus: Attendu[], scans: Scan[]): ResultatInventaire {
  const parId = new Map(attendus.map((a) => [a.id, a]));
  const vus = new Set<number>();
  const nonEnregistres: Scan[] = [];
  const ecarts: ResultatInventaire["ecarts"] = [];
  const malRanges: ResultatInventaire["malRanges"] = [];
  for (const s of scans) {
    const a = s.rouleauId != null ? parId.get(s.rouleauId) : undefined;
    if (!a) {
      nonEnregistres.push(s);
      continue;
    }
    vus.add(a.id);
    if (s.metrageConstate != null && Math.abs(s.metrageConstate - a.disponible) > TOLERANCE_INVENTAIRE) {
      ecarts.push({ ...a, constate: s.metrageConstate, ecart: r2(s.metrageConstate - a.disponible) });
    }
    if (s.emplacementCode && a.emplacement && normaliserEmplacement(s.emplacementCode) !== normaliserEmplacement(a.emplacement)) {
      malRanges.push({ ...a, trouveA: s.emplacementCode });
    }
  }
  return {
    attendus: attendus.length,
    scannes: scans.length,
    trouves: vus.size,
    manquants: attendus.filter((a) => !vus.has(a.id)),
    nonEnregistres,
    ecarts,
    malRanges,
  };
}

/* ─────────── indicateurs ─────────── */

export type IndicateursRouleaux = {
  enStock: number;
  metrageDisponible: number;
  metrageSorti: number;
  metrageConsomme: number;
  metrageChute: number;
  metrageRetour: number;
  sansEmplacement: number;
  enAttente: number;
  sortisNonConsommes: number;
  metrageEnCoupe: number;
};

export function indicateurs(rouleaux: { statut: string; emplacement: string; bilan: BilanRouleau }[]): IndicateursRouleaux {
  const i: IndicateursRouleaux = {
    enStock: 0, metrageDisponible: 0, metrageSorti: 0, metrageConsomme: 0, metrageChute: 0, metrageRetour: 0,
    sansEmplacement: 0, enAttente: 0, sortisNonConsommes: 0, metrageEnCoupe: 0,
  };
  for (const r of rouleaux) {
    if (r.statut === "en_attente") i.enAttente++;
    if (r.statut !== "en_attente" && r.bilan.disponible > 0.001) {
      i.enStock++;
      i.metrageDisponible += r.bilan.disponible;
      if (!r.emplacement) i.sansEmplacement++;
    }
    i.metrageSorti += r.bilan.sorti;
    i.metrageConsomme += r.bilan.consomme;
    i.metrageChute += r.bilan.chute;
    i.metrageRetour += r.bilan.retour;
    if (r.bilan.enCoupe > 0.001) {
      i.sortisNonConsommes++;
      i.metrageEnCoupe += r.bilan.enCoupe;
    }
  }
  for (const k of ["metrageDisponible", "metrageSorti", "metrageConsomme", "metrageChute", "metrageRetour", "metrageEnCoupe"] as const) i[k] = r2(i[k]);
  return i;
}
