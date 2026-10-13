/* PAQUETS DE COUPE — logique métier pure (testable sans base ni React).
 *
 * À la coupe, les pièces d'un OF sont numérotées de 1 à X et liées par
 * paquets (25 en général). Un paquet n'a qu'UNE taille et UNE couleur.
 *
 * Un même numéro de paquet existe en plusieurs LIASSES — le col, le devant,
 * les manches, le dos — qui partent chacune à un poste de préparation et se
 * retrouvent à l'assemblage. Les liasses ne sont pas des sous-paquets : ce
 * sont les morceaux du même paquet, qui garde son numéro du premier jour
 * jusqu'à l'assemblage.
 *
 * Le paquet MEURT à l'assemblage : après, ce sont des pièces entières finies,
 * et c'est le circuit habituel (sortie de chaîne, contrôle, magasin) qui
 * prend le relais. Le suivi par paquets s'arrête exactement là où le comptage
 * de la production commence — les deux ne se touchent jamais.
 *
 * Rien ici ne compte la production. L'état d'un paquet est DÉRIVÉ de son
 * journal de relevés, jamais stocké : une frise dérivée ne peut pas mentir.
 *
 * Et rien ne bloque jamais : une liasse non relevée n'est pas en retard, elle
 * est « sans nouvelle ». La responsable fait sa tournée quand elle peut ; les
 * jours sans tournée sont gris, pas rouges. */

import type { Tone } from "@/components/shared/status-badge";

/** Liasse par défaut quand le modèle n'en déclare aucune : le paquet voyage
 * d'un seul bloc. Le suivi marche alors sans rien avoir à configurer. */
export const LIASSE_UNIQUE = "Complet";
/** Au-delà, l'écran devient illisible et les étiquettes ingérables. */
export const LIASSES_MAX = 12;
export const LIASSE_LONGUEUR_MAX = 40;

export const formatCodePaquet = (annee: number, n: number) => `PQ-${annee}-${String(n).padStart(6, "0")}`;

/** Lit ce que renvoie un scan : l'adresse du QR (…/p/PQ-2026-000145/2), le
 * texte d'une douchette, ou le code tapé à la main. Le rang de liasse est
 * facultatif : sans lui, le scan ouvre le paquet et l'on choisit la liasse. */
export function lireScanPaquet(brut: string): { code: string; rang: number | null } | null {
  const t = decodeURIComponent((brut ?? "").trim()).toUpperCase().replace(/\s+/g, "");
  const m = /PQ-(\d{4})-(\d{1,6})(?:\/(\d{1,2}))?(?!\d)/.exec(t);
  if (!m) return null;
  const rang = m[3] ? Number(m[3]) : null;
  return { code: formatCodePaquet(Number(m[1]), Number(m[2])), rang: rang && rang > 0 ? rang : null };
}

/* ─────────── liasses d'un modèle ─────────── */

/** Nettoie une liste de liasses saisie à la main ou choisie dans un gabarit :
 * espaces, doublons, vides, longueur. Une liste vide donne la liasse unique —
 * le suivi fonctionne toujours, même sans configuration. */
export function normaliserLiasses(liste: unknown): string[] {
  const vues = new Set<string>();
  const out: string[] = [];
  for (const x of Array.isArray(liste) ? liste : []) {
    const nom = String(x ?? "").trim().replace(/\s+/g, " ").slice(0, LIASSE_LONGUEUR_MAX);
    if (!nom) continue;
    const cle = nom.toLowerCase();
    if (vues.has(cle)) continue;
    vues.add(cle);
    out.push(nom);
    if (out.length >= LIASSES_MAX) break;
  }
  return out.length ? out : [LIASSE_UNIQUE];
}

/* ─────────── découpage d'une coupe en paquets ───────────
 *
 * Les pièces sont numérotées de 1 à X sur TOUT l'OF, taille après taille,
 * puis liées par paquets. Le dernier paquet d'une taille porte son reste :
 * on ne mélange jamais deux tailles dans un paquet. */

export type LigneCoupe = { taille: string; qte: number };
export type PaquetNeuf = {
  numero: number;
  taille: string;
  qte: number;
  pieceDebut: number;
  pieceFin: number;
};

export function decouperEnPaquets(
  lignes: LigneCoupe[],
  taillePaquet: number,
  /** Dernier numéro déjà attribué sur cet OF (recoupe, réassort). */
  numeroDepart = 0,
  /** Dernière pièce déjà numérotée sur cet OF. */
  pieceDepart = 0,
): PaquetNeuf[] {
  const t = Math.max(1, Math.trunc(taillePaquet) || 1);
  let numero = Math.max(0, Math.trunc(numeroDepart));
  let piece = Math.max(0, Math.trunc(pieceDepart));
  const out: PaquetNeuf[] = [];
  for (const l of lignes) {
    let reste = Math.max(0, Math.trunc(Number(l.qte) || 0));
    while (reste > 0) {
      const q = Math.min(t, reste);
      numero += 1;
      out.push({ numero, taille: l.taille, qte: q, pieceDebut: piece + 1, pieceFin: piece + q });
      piece += q;
      reste -= q;
    }
  }
  return out;
}

/* ─────────── relevés et états dérivés ─────────── */

/** Une ligne du journal. Jamais modifiée : on ajoute une annulation. */
export type Releve = {
  id: number;
  paquetId: number;
  /** "" = concerne le paquet entier (assemblage). */
  liasse: string;
  /** liasse | assemble | probleme | annulation */
  etape: string;
  qte: number | null;
  note: string;
  date: string;
  annuleId: number | null;
  par: string;
};

/** Relevés encore valables : les annulations neutralisent sans effacer. */
export function relevesValables<R extends Releve>(releves: R[]): R[] {
  const annules = new Set(releves.filter((r) => r.etape === "annulation" && r.annuleId != null).map((r) => r.annuleId));
  return releves.filter((r) => r.etape !== "annulation" && !annules.has(r.id));
}

export type EtatCase = "vide" | "fait" | "probleme";
export type CaseLiasse = {
  liasse: string;
  rang: number;
  etat: EtatCase;
  /** Dernier relevé qui donne cet état. */
  le: string;
  par: string;
  note: string;
  qte: number | null;
};

const cleLiasse = (s: string) => (s ?? "").trim().toLowerCase();

/** État d'un paquet, entièrement dérivé de son journal.
 *
 * « vide » veut dire SANS NOUVELLE, pas « en retard » : personne n'est passé.
 * C'est volontaire — la tournée est facultative et peut sauter des jours. */
export type EtatPaquet = {
  cases: CaseLiasse[];
  /** Toutes les liasses relevées. */
  pret: boolean;
  assemble: boolean;
  assembleLe: string;
  assemblePar: string;
  /** Liasses encore sans nouvelle. */
  manquantes: string[];
  /** Au moins un problème signalé et non résolu. */
  probleme: boolean;
  /** vide | en_cours | pret | assemble */
  avancement: "vide" | "en_cours" | "pret" | "assemble";
};

export function etatPaquet(liasses: string[], releves: Releve[]): EtatPaquet {
  const valables = relevesValables(releves);
  const cases: CaseLiasse[] = (liasses.length ? liasses : [LIASSE_UNIQUE]).map((liasse, i) => {
    /* Le DERNIER relevé d'une liasse fait foi : un problème signalé puis
     * corrigé se termine par un « fait ». */
    const siens = valables.filter((r) => r.liasse && cleLiasse(r.liasse) === cleLiasse(liasse));
    const dernier = siens[siens.length - 1];
    return {
      liasse,
      rang: i + 1,
      etat: !dernier ? "vide" : dernier.etape === "probleme" ? "probleme" : "fait",
      le: dernier?.date ?? "",
      par: dernier?.par ?? "",
      note: dernier?.note ?? "",
      qte: dernier?.qte ?? null,
    };
  });
  const assemblage = valables.filter((r) => r.etape === "assemble").at(-1);
  const manquantes = cases.filter((c) => c.etat === "vide").map((c) => c.liasse);
  const probleme = cases.some((c) => c.etat === "probleme");
  const pret = cases.length > 0 && cases.every((c) => c.etat === "fait");
  return {
    cases,
    pret,
    assemble: !!assemblage,
    assembleLe: assemblage?.date ?? "",
    assemblePar: assemblage?.par ?? "",
    manquantes,
    probleme,
    avancement: assemblage ? "assemble" : pret ? "pret" : cases.some((c) => c.etat !== "vide") ? "en_cours" : "vide",
  };
}

export const LIBELLE_AVANCEMENT: Record<EtatPaquet["avancement"], { label: string; tone: Tone }> = {
  vide: { label: "Sans nouvelle", tone: "neutral" },
  en_cours: { label: "En préparation", tone: "info" },
  pret: { label: "Prêt à assembler", tone: "warning" },
  assemble: { label: "Assemblé", tone: "success" },
};

/* ─────────── vue d'ensemble d'un OF ─────────── */

export type BilanOf = {
  nbPaquets: number;
  pieces: number;
  /** Paquets par état d'avancement. */
  vides: number;
  enCours: number;
  prets: number;
  assembles: number;
  /** Paquets portant un problème signalé. */
  problemes: number;
  /** Pièces des paquets assemblés. */
  piecesAssemblees: number;
  /** Liasse la plus en retard : celle qui manque au plus grand nombre de
   * paquets prêts par ailleurs. C'est elle qui bloque l'assemblage. */
  liasseEnRetard: { liasse: string; manque: number } | null;
};

export function bilanOf(paquets: { qte: number; etat: EtatPaquet }[]): BilanOf {
  const b: BilanOf = {
    nbPaquets: paquets.length, pieces: 0, vides: 0, enCours: 0, prets: 0,
    assembles: 0, problemes: 0, piecesAssemblees: 0, liasseEnRetard: null,
  };
  const manques = new Map<string, number>();
  for (const p of paquets) {
    b.pieces += p.qte;
    if (p.etat.probleme) b.problemes += 1;
    if (p.etat.avancement === "assemble") {
      b.assembles += 1;
      b.piecesAssemblees += p.qte;
      continue;
    }
    if (p.etat.avancement === "pret") b.prets += 1;
    else if (p.etat.avancement === "en_cours") b.enCours += 1;
    else b.vides += 1;
    // Une liasse ne « retarde » que les paquets déjà commencés : un paquet
    // dont rien n'est relevé ne reproche rien à personne.
    if (p.etat.avancement === "en_cours") for (const m of p.etat.manquantes) manques.set(m, (manques.get(m) ?? 0) + 1);
  }
  for (const [liasse, manque] of manques) {
    if (!b.liasseEnRetard || manque > b.liasseEnRetard.manque) b.liasseEnRetard = { liasse, manque };
  }
  return b;
}

/* ─────────── ce que la tournée a le droit de faire ───────────
 *
 * Un relevé ne bloque rien et ne refuse presque rien : la tournée doit
 * pouvoir enregistrer ce qui EST, même quand l'ordre n'a pas été suivi. Les
 * seuls refus portent sur ce qui n'aurait aucun sens. */

export type Refus = string | null;

export function refusReleve(v: {
  statutPaquet: string;
  etape: string;
  liasse: string;
  liasses: string[];
  etat: EtatPaquet;
}): Refus {
  if (v.statutPaquet !== "actif") return "Ce paquet a été annulé (sa fiche de coupe l'a été) : rien à relever dessus.";
  if (v.etape === "assemble") {
    if (v.etat.assemble) return "Ce paquet est déjà marqué assemblé.";
    return null; // On n'exige PAS que toutes les liasses soient relevées : la tournée peut avoir sauté des jours.
  }
  if (v.etape !== "liasse" && v.etape !== "probleme") return "Relevé inconnu.";
  if (!v.liasse) return "Choisissez la liasse concernée.";
  if (!v.liasses.some((l) => cleLiasse(l) === cleLiasse(v.liasse))) return `« ${v.liasse} » n'est pas une liasse de ce paquet.`;
  if (v.etat.assemble) return "Ce paquet est déjà assemblé : ses liasses n'existent plus.";
  return null;
}

/** Ce que la tournée affiche après un scan réussi, en une ligne. */
export function resumeScan(numero: number, taille: string, etat: EtatPaquet): string {
  const faites = etat.cases.filter((c) => c.etat === "fait").length;
  return `Paquet ${numero}${taille ? ` · ${taille}` : ""} — ${faites}/${etat.cases.length} liasse(s)${etat.assemble ? " · assemblé" : ""}`;
}
