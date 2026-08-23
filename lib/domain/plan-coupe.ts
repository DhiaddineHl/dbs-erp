import type { Tone } from "@/components/shared/status-badge";
import type { TracePlan } from "@/lib/db/schema";

/* Le plan de coupe — la fiche de matelassage de la modéliste, portée de
 * PilotPro (window.PPLAN, v7.4 / v7.5.1).
 *
 * On ne coupe pas les pièces une par une : on empile le tissu en matelas de N
 * plis, on pose dessus un tracé qui contient plusieurs tailles, et un coup de
 * scie donne N exemplaires de chaque taille du tracé. Le plan dit combien de
 * tracés, à combien de plis, avec quelles tailles — et c'est de là que sort le
 * métrage réellement consommé.
 *
 * Deux règles gouvernent tout ce fichier :
 *
 *   1. rien n'est stocké de ce qui se calcule. Pièces coupées, consommation,
 *      écarts : tout se dérive des tracés, comme les feux se dérivent des six
 *      tables de préparation.
 *
 *   2. une longueur ESTIMÉE n'est pas une mesure. Le proposeur automatique
 *      pose des longueurs théoriques pour donner une idée du métrage ; elles
 *      portent le drapeau `estime` jusqu'à ce que quelqu'un ait vraiment fait
 *      le placement et saisi la vraie longueur. Tant qu'il en reste une, la
 *      consommation du plan est une prévision et ne doit pas descendre dans la
 *      nomenclature. C'est ce que `estEstime` protège.
 *
 * Module pur : aucun accès base, aucun `server-only`. L'éditeur client
 * recalcule ses totaux à chaque frappe avec exactement le même code que le
 * serveur, ce qui évite deux vérités sur le même métrage. */

export type Contraintes = {
  /** Pièces différentes admises dans un même tracé. */
  maxPiecesTrace: number;
  /** Plis qu'un matelas peut empiler. */
  maxPlis: number;
  /** Surplus toléré par taille quand le proposeur arrondit. */
  surplusTolere: number;
};

export type Matiere = {
  rang: number;
  nom: string;
  laise: number | null;
  consoPrevue: number | null;
  perteBout: number | null;
  traces: TracePlan[];
};

export type Plan = {
  sizes: string[];
  ordre: Record<string, number>;
  contraintes: Contraintes;
  matieres: Matiere[];
  par: string;
  date: string | null;
};

export const CONTRAINTES_DEFAUT: Contraintes = { maxPiecesTrace: 4, maxPlis: 100, surplusTolere: 0 };

/** Taille de repli quand la commande n'a pas de grille : tout en un seul tas. */
export const TAILLE_UNIQUE = "TU";

const num = (v: unknown): number => {
  const n = typeof v === "number" ? v : Number(String(v ?? "").replace(",", ".").trim());
  return Number.isFinite(n) ? n : 0;
};

/* ─────────── construction ─────────── */

export const traceVide = (sizes: string[], nom = ""): TracePlan => ({
  nom,
  longueur: 0,
  plis: 0,
  estime: false,
  qty: Object.fromEntries(sizes.map((s) => [s, 0])),
});

export const matiereVide = (sizes: string[], rang: number, nom = "Tissu principal"): Matiere => ({
  rang,
  nom,
  laise: 150,
  consoPrevue: null,
  perteBout: null,
  traces: [traceVide(sizes), traceVide(sizes)],
});

/* ─────────── ce qui se calcule ─────────── */

/** Pièces coupées de chaque taille : ce que le tracé contient une fois,
 * multiplié par le nombre de plis du matelas. */
export function piecesParTaille(m: Matiere, sizes: string[]): Record<string, number> {
  const out = Object.fromEntries(sizes.map((s) => [s, 0]));
  for (const t of m.traces) {
    const plis = num(t.plis);
    for (const s of sizes) out[s] += num(t.qty?.[s]) * plis;
  }
  return out;
}

/** Métrage consommé par la matière : chaque tracé, sur toute sa hauteur. */
export function consoTotale(m: Matiere): number {
  return m.traces.reduce((a, t) => a + num(t.longueur) * num(t.plis), 0);
}

export function piecesTotales(m: Matiere, sizes: string[]): number {
  const parTaille = piecesParTaille(m, sizes);
  return sizes.reduce((a, s) => a + parTaille[s], 0);
}

/** Vrai tant qu'un tracé qui compte porte une longueur non mesurée.
 *
 * Un tracé estimé mais vide (longueur ou plis à zéro) ne consomme rien : il ne
 * fausse aucun métrage et n'a pas à bloquer le report. */
export function estEstime(m: Matiere): boolean {
  return m.traces.some((t) => t.estime && num(t.longueur) > 0 && num(t.plis) > 0);
}

/** Consommation constatée, en mètres par pièce. `null` quand rien n'est coupé :
 * une division par zéro n'est pas une consommation nulle. */
export function consoReellePiece(m: Matiere, sizes: string[]): number | null {
  const pieces = piecesTotales(m, sizes);
  if (pieces <= 0) return null;
  return consoTotale(m) / pieces;
}

export function totalCommande(plan: Plan): number {
  return plan.sizes.reduce((a, s) => a + num(plan.ordre[s]), 0);
}

/** Coupé moins commandé, taille par taille. Négatif = il manque des pièces. */
export function ecartsParTaille(plan: Plan, m: Matiere): Record<string, number> {
  const coupe = piecesParTaille(m, plan.sizes);
  return Object.fromEntries(plan.sizes.map((s) => [s, coupe[s] - num(plan.ordre[s])]));
}

/** La matière de référence, celle dont le métrage se compare au tissu reçu :
 * le tissu de dessus, c'est-à-dire la première. */
export const matierePrincipale = (plan: Plan): Matiere | null => plan.matieres[0] ?? null;

/** Un plan est complet quand il ne reste aucune longueur estimée et que la
 * matière principale couvre au moins la quantité commandée. C'est l'état à
 * partir duquel le tirage des tracés peut être considéré comme fait. */
export function planComplet(plan: Plan): boolean {
  const commande = totalCommande(plan);
  const m = matierePrincipale(plan);
  if (!m || commande <= 0) return false;
  if (plan.matieres.some(estEstime)) return false;
  return piecesTotales(m, plan.sizes) >= commande;
}

/* ─────────── état affichable ─────────── */

export type EtatPlan = { kind: "absent" | "estime" | "pret"; label: string; tone: Tone };

/** Où en est le plan, en une ligne — pour la fiche modélisme et la liste. */
export function etatPlan(plan: Plan | null): EtatPlan {
  if (!plan || !plan.matieres.length) return { kind: "absent", label: "À préparer", tone: "warning" };
  const nbTraces = plan.matieres.reduce((a, m) => a + m.traces.length, 0);
  const base = `${plan.matieres.length} matière${plan.matieres.length > 1 ? "s" : ""} · ${nbTraces} tracé${nbTraces > 1 ? "s" : ""}`;
  if (plan.matieres.some(estEstime)) {
    return { kind: "estime", label: `${base} · longueurs à confirmer`, tone: "warning" };
  }
  return { kind: "pret", label: `${base} · longueurs réelles`, tone: "success" };
}

/* ─────────── le proposeur de tracés ───────────
 *
 * Portage de `proposeCore`. Glouton, et volontairement : la modéliste ne
 * cherche pas l'optimum théorique, elle cherche un point de départ crédible
 * qu'elle corrigera. À chaque tour on ouvre un tracé, on y place les tailles
 * les plus demandées dans la limite des emplacements disponibles, puis on
 * choisit la hauteur du matelas la plus haute qui ne dépasse aucune taille
 * au-delà du surplus toléré.
 *
 * Les longueurs produites sont marquées `estime` : elles valent
 * `consoPrevue × emplacements`, ce qui n'est vrai qu'au placement près. */

/** Garde-fou : au-delà, c'est que les contraintes ne permettent pas d'avancer.
 * Sans lui, une contrainte absurde ferait tourner la boucle indéfiniment. */
const MAX_TOURS = 800;

export function proposerTraces(plan: Plan, m: Matiere): TracePlan[] {
  const maxPieces = Math.max(1, Math.trunc(num(plan.contraintes.maxPiecesTrace)) || 1);
  const maxPlis = Math.max(1, Math.trunc(num(plan.contraintes.maxPlis)) || 1);
  const tolerance = Math.max(0, num(plan.contraintes.surplusTolere));
  const consoPrevue = num(m.consoPrevue);

  const restant: Record<string, number> = Object.fromEntries(
    plan.sizes.map((s) => [s, Math.max(0, Math.trunc(num(plan.ordre[s])))]),
  );

  const traces: TracePlan[] = [];
  let tours = 0;
  while (plan.sizes.some((s) => restant[s] > 0) && tours++ < MAX_TOURS) {
    // Les tailles les plus demandées d'abord : ce sont elles qui décideront de
    // la hauteur du matelas, et les servir tôt évite les tracés à une taille.
    const candidates = plan.sizes.filter((s) => restant[s] > 0).sort((a, b) => restant[b] - restant[a]);

    const emplacements: Record<string, number> = {};
    let libres = maxPieces;
    for (const s of candidates) {
      if (libres <= 0) break;
      // Une taille qui dépasse la hauteur maximale doit occuper plusieurs
      // emplacements, sinon aucun matelas ne peut l'épuiser.
      const souhait = Math.max(1, Math.ceil(restant[s] / maxPlis));
      const pris = Math.min(libres, souhait, restant[s]);
      if (pris > 0) {
        emplacements[s] = pris;
        libres -= pris;
      }
    }

    const retenues = Object.keys(emplacements);
    if (!retenues.length) break;

    // La hauteur est celle qui n'excède aucune taille au-delà du surplus admis.
    let plis = maxPlis;
    for (const s of retenues) {
      const possible = Math.floor((restant[s] + tolerance) / emplacements[s]);
      if (possible < plis) plis = possible;
    }
    plis = Math.min(maxPlis, Math.max(1, plis));

    const places = retenues.reduce((a, s) => a + emplacements[s], 0);
    const longueur = consoPrevue > 0 ? +(consoPrevue * places).toFixed(2) : 0;

    const qty = Object.fromEntries(plan.sizes.map((s) => [s, emplacements[s] ?? 0]));
    traces.push({ nom: `Tracé ${traces.length + 1}`, longueur, plis, estime: longueur > 0, qty });

    for (const s of retenues) restant[s] -= emplacements[s] * plis;
  }

  return traces;
}

/* ─────────── report vers la commande ─────────── */

export type LigneTaille = { taille: string; qte: number };

/** La grille du plan, réduite aux tailles réellement commandées. C'est elle
 * qui corrige la commande quand celle-ci a été saisie en taille unique. */
export function grilleDetaillee(plan: Plan): LigneTaille[] {
  return plan.sizes
    .filter((s) => num(plan.ordre[s]) > 0)
    .map((s) => ({ taille: s, qte: Math.trunc(num(plan.ordre[s])) }));
}

/** Vrai quand la grille du plan dit autre chose que la commande — le signal
 * qui déclenche la proposition de correction à l'enregistrement. */
export function grilleDifferente(tailles: LigneTaille[], grille: LigneTaille[]): boolean {
  const cle = (l: LigneTaille[]) => l.map((t) => `${t.taille}:${t.qte}`).join("|");
  return cle(tailles) !== cle(grille);
}

/** Une grille qui n'est qu'un « TU » ne détaille rien : elle ne vaut pas la
 * peine de proposer une correction de la commande. */
export const grilleDetaille = (grille: LigneTaille[]): boolean =>
  grille.length > 0 && !(grille.length === 1 && grille[0].taille === TAILLE_UNIQUE);

/* ─────────── copie d'une matière sur une autre ─────────── */

/** Reprend la structure (tailles par tracé, hauteur des matelas) d'une autre
 * matière, en remettant les longueurs à zéro : une doublure ne se place pas
 * sur la même laise, donc ses longueurs sont à mesurer à part. */
export function copierStructure(source: Matiere): TracePlan[] {
  return source.traces.map((t) => ({
    nom: t.nom,
    longueur: 0,
    plis: t.plis,
    estime: false,
    qty: { ...t.qty },
  }));
}

/** Réaligne un plan sur une nouvelle gamme de tailles : ce qui existait est
 * conservé, ce qui apparaît part de zéro, ce qui disparaît est oublié. */
export function changerTailles(plan: Plan, sizes: string[]): Plan {
  const remap = (src: Record<string, number> | undefined) =>
    Object.fromEntries(sizes.map((s) => [s, num(src?.[s])]));
  return {
    ...plan,
    sizes,
    ordre: remap(plan.ordre),
    matieres: plan.matieres.map((m) => ({
      ...m,
      traces: m.traces.map((t) => ({ ...t, qty: remap(t.qty) })),
    })),
  };
}
