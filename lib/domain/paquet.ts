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
  /* Un QR étranger contenant « % » (« 50%off ») faisait planter
     decodeURIComponent, et avec lui la caméra : on lit alors le texte tel quel. */
  let t = (brut ?? "").trim();
  try {
    t = decodeURIComponent(t);
  } catch {
    /* texte non encodé : gardé tel quel */
  }
  t = t.toUpperCase().replace(/\s+/g, "");
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
  /** poste | liasse | assemble | probleme | correction | annulation */
  etape: string;
  qte: number | null;
  note: string;
  date: string;
  annuleId: number | null;
  par: string;
  /* « fini au poste » (etape = poste) */
  poste?: string;
  ouvrier?: string;
  heure?: string;
};

/** Relevés encore valables : les annulations neutralisent sans effacer. */
export function relevesValables<R extends Releve>(releves: R[]): R[] {
  const annules = new Set(releves.filter((r) => r.etape === "annulation" && r.annuleId != null).map((r) => r.annuleId));
  return releves.filter((r) => r.etape !== "annulation" && !annules.has(r.id));
}

/** vide = sans nouvelle · en_cours = passé à au moins un poste (scan dans la
 * saisie horaire) · fait = déclaré fini à la tournée · probleme. */
export type EtatCase = "vide" | "en_cours" | "fait" | "probleme";
export type CaseLiasse = {
  liasse: string;
  rang: number;
  etat: EtatCase;
  /** Dernier relevé qui donne cet état. */
  le: string;
  par: string;
  note: string;
  qte: number | null;
  /** Dernier poste où le morceau a été fini, et par qui (scan GPAO). */
  poste: string;
  ouvrier: string;
  /** Nombre de postes déjà passés par ce morceau. */
  nbPostes: number;
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
    const siens = valables.filter((r) => r.liasse && cleLiasse(r.liasse) === cleLiasse(liasse) && r.etape !== "correction");
    const dernier = siens[siens.length - 1];
    const postes = siens.filter((r) => r.etape === "poste");
    const dernierPoste = postes[postes.length - 1];
    return {
      liasse,
      rang: i + 1,
      etat: !dernier ? "vide" : dernier.etape === "probleme" ? "probleme" : dernier.etape === "poste" ? "en_cours" : "fait",
      le: dernier?.date ?? "",
      par: dernier?.etape === "poste" ? (dernier.ouvrier || dernier.par) : (dernier?.par ?? ""),
      note: dernier?.note ?? "",
      qte: dernier?.qte ?? null,
      poste: dernierPoste?.poste ?? "",
      ouvrier: dernierPoste?.ouvrier ?? "",
      nbPostes: postes.length,
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


/* ═══════════ quantité réelle et morceaux ═══════════ */

/** Pièces que contient VRAIMENT le paquet : la quantité corrigée par la coupe
 * quand il y en a une, sinon celle imprimée sur l'étiquette. */
export const qteEffective = (p: { qte: number; qteReelle?: number | null }) => (p.qteReelle ?? null) ?? p.qte;

/** Morceaux d'un paquet qui comptent : sa liste, moins les morceaux annulés.
 * Jamais vide : un paquet sans morceau déclaré voyage d'un seul bloc. */
export function morceauxActifs(liasses: string[], annules: string[] = []): string[] {
  const off = new Set(annules.map(cleLiasse));
  const l = (liasses.length ? liasses : [LIASSE_UNIQUE]).filter((x) => !off.has(cleLiasse(x)));
  return l.length ? l : [LIASSE_UNIQUE];
}

/** Le morceau désigné par un QR de liasse (…/PQ-…/3 → 3ᵉ morceau de la liste
 * IMPRIMÉE, annulés compris : l'étiquette ne change pas). */
export function morceauDuRang(liasses: string[], rang: number | null): string | null {
  const l = liasses.length ? liasses : [LIASSE_UNIQUE];
  return rang && l[rang - 1] ? l[rang - 1] : null;
}

/* ═══════════ découpage décidé par la coupe ═══════════
 *
 * L'application PROPOSE (25 + 25 + 10) ; la coupe décide. Elle tape les
 * quantités de ses paquets pour chaque taille : « 25 25 10 », « 20, 20, 20 »,
 * ou « 2x25 10 ». La somme doit faire exactement le coupé de la taille. */

export const PIECES_PAR_PAQUET_MAX = 999;

export function proposerDecoupage(qte: number, taille: number): number[] {
  const t = Math.max(1, Math.trunc(taille) || 1);
  const out: number[] = [];
  let reste = Math.max(0, Math.trunc(qte) || 0);
  while (reste > 0) {
    const q = Math.min(t, reste);
    out.push(q);
    reste -= q;
  }
  return out;
}

export const formatDecoupage = (qtes: number[]) => {
  // « 25 25 25 10 » se lit mieux « 3×25 + 10 ».
  const bouts: string[] = [];
  for (let i = 0; i < qtes.length; ) {
    let j = i;
    while (j + 1 < qtes.length && qtes[j + 1] === qtes[i]) j++;
    const n = j - i + 1;
    bouts.push(n > 1 ? `${n}×${qtes[i]}` : String(qtes[i]));
    i = j + 1;
  }
  return bouts.join(" + ");
};

export function lireDecoupage(texte: string, qteCoupee: number): { ok: true; qtes: number[] } | { ok: false; error: string } {
  const t = (texte ?? "").toLowerCase().replace(/\s*[x×*]\s*/g, "x").trim();
  if (!t) return qteCoupee > 0 ? { ok: false, error: "Indiquez les paquets." } : { ok: true, qtes: [] };
  const qtes: number[] = [];
  for (const bout of t.split(/[\s,;+]+/).filter(Boolean)) {
    const m = /^(?:(\d+)x)?(\d+)$/.exec(bout);
    if (!m) return { ok: false, error: `« ${bout} » n'est pas une quantité de paquet.` };
    const n = m[1] ? Number(m[1]) : 1;
    const q = Number(m[2]);
    if (!(q > 0) || q > PIECES_PAR_PAQUET_MAX) return { ok: false, error: `« ${bout} » : un paquet contient de 1 à ${PIECES_PAR_PAQUET_MAX} pièces.` };
    if (!(n > 0) || n > 500) return { ok: false, error: `« ${bout} » : nombre de paquets invalide.` };
    for (let i = 0; i < n; i++) qtes.push(q);
  }
  const somme = qtes.reduce((a, b) => a + b, 0);
  if (somme !== qteCoupee) {
    return { ok: false, error: `Les paquets font ${somme} pièces, la coupe en compte ${qteCoupee} (${somme > qteCoupee ? "+" : ""}${somme - qteCoupee}).` };
  }
  return { ok: true, qtes };
}

/** Comme `decouperEnPaquets`, mais avec les quantités que la coupe a choisies,
 * taille par taille. Les numéros continuent après ceux déjà donnés à l'OF. */
export function decouperSelonListes(
  lignes: { taille: string; qtes: number[] }[],
  numeroDepart = 0,
  pieceDepart = 0,
): PaquetNeuf[] {
  let numero = Math.max(0, Math.trunc(numeroDepart));
  let piece = Math.max(0, Math.trunc(pieceDepart));
  const out: PaquetNeuf[] = [];
  for (const l of lignes) {
    for (const q0 of l.qtes) {
      const q = Math.trunc(q0);
      if (!(q > 0)) continue;
      numero += 1;
      out.push({ numero, taille: l.taille, qte: q, pieceDebut: piece + 1, pieceFin: piece + q });
      piece += q;
    }
  }
  return out;
}

/* ═══════════ « fini au poste », scanné dans la saisie horaire ═══════════
 *
 * Le scan veut dire : CE MORCEAU de ce paquet est FINI à CE POSTE, par CETTE
 * ouvrière, dans CETTE heure. Il se fait une seule fois. L'application en
 * tire : la proposition des pièces de l'heure, le recoupement par ouvrière,
 * et l'endroit où se trouve chaque paquet. */

export type Passage = {
  id: number;
  paquetId: number;
  morceau: string;
  poste: string;
  ouvrier: string;
  ouvId: number | null;
  journeeId: number | null;
  heure: string;
  date: string;
  /** Pièces du paquet au moment du scan (quantité réelle). */
  qte: number;
};

const clePoste = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, " ");

/** Passages valables (« poste », non annulés) d'un journal de relevés. */
export function passagesValables<R extends Releve & { poste?: string; ouvrier?: string; ouvId?: number | null; journeeId?: number | null; heure?: string }>(
  releves: R[],
): R[] {
  return relevesValables(releves).filter((r) => r.etape === "poste");
}

export function refusFiniAuPoste(v: {
  statutPaquet: string;
  assemble: boolean;
  morceau: string;
  morceaux: string[];
  poste: string;
  /** Passages valables déjà enregistrés sur CE paquet. */
  deja: { morceau: string; poste: string; ouvrier: string; date: string; heure: string }[];
}): Refus {
  if (v.statutPaquet !== "actif") return "Ce paquet a été annulé (sa fiche de coupe l'a été).";
  if (v.assemble) return "Ce paquet est déjà assemblé : ce sont maintenant des pièces finies.";
  if (!v.morceau) return "Choisissez le morceau.";
  if (!v.morceaux.some((m) => cleLiasse(m) === cleLiasse(v.morceau))) return `« ${v.morceau} » n'est pas un morceau de ce paquet.`;
  if (!clePoste(v.poste)) return "Indiquez le poste de l'ouvrière pour cette heure.";
  const d = v.deja.find((x) => cleLiasse(x.morceau) === cleLiasse(v.morceau) && clePoste(x.poste) === clePoste(v.poste));
  if (d) {
    return `Déjà fini au poste « ${d.poste} » par ${d.ouvrier || "?"} le ${d.date.split("-").reverse().join("/")}${d.heure ? ` (${d.heure})` : ""}.`;
  }
  return null;
}

/** Pièces à PROPOSER dans la case d'une heure, d'après les paquets finis :
 * tout ce que les paquets finis jusqu'à cette heure contiennent, moins ce qui
 * a déjà été déclaré aux heures d'avant (un paquet entamé à 10 h et fini à
 * 11 h ne se compte pas deux fois). Une proposition, jamais une obligation. */
export function propositionPieces(v: {
  cols: string[];
  col: string;
  /** Pièces déjà déclarées par heure (RI / ABS ne comptent pas). */
  pieces: Record<string, number | "RI" | "ABS" | undefined>;
  /** Pièces des paquets finis, par heure. */
  finis: Record<string, number>;
}): number {
  const i = v.cols.indexOf(v.col);
  if (i < 0) return 0;
  let finis = 0;
  let avant = 0;
  for (let k = 0; k <= i; k++) {
    finis += v.finis[v.cols[k]] ?? 0;
    const p = v.pieces[v.cols[k]];
    if (k < i && typeof p === "number") avant += p;
  }
  return Math.max(0, finis - avant);
}

/** Recoupement d'une ouvrière sur la journée : pièces déclarées contre pièces
 * des paquets qu'elle a finis. Un paquet entamé (en plus ou en moins, à
 * chaque poste tenu) est normal ; au-delà, on le signale sans accuser. */
export function controleFiniAuPoste(v: { pieces: number; finis: number; nbPaquets: number; taillePaquet: number; postes: number }): { niveau: "attention"; message: string } | null {
  if (v.nbPaquets === 0) return null;
  const marge = Math.max(1, v.postes) * Math.max(1, v.taillePaquet);
  const ecart = v.pieces - v.finis;
  if (ecart > marge) {
    return { niveau: "attention", message: `${v.pieces} pièces déclarées, mais ses ${v.nbPaquets} paquet(s) fini(s) n'en contiennent que ${v.finis} : ${ecart} pièces sans paquet fini.` };
  }
  if (-ecart > marge) {
    return { niveau: "attention", message: `Ses ${v.nbPaquets} paquet(s) fini(s) contiennent ${v.finis} pièces, seulement ${v.pieces} déclarées : ${-ecart} pièces manquent dans la saisie.` };
  }
  return null;
}

/** Un numéro tapé à la main peut exister dans plusieurs OF (deux couleurs du
 * même modèle, numérotées chacune de 1 à n) : on rend tous les candidats, et
 * l'écran demande lequel quand il y en a plus d'un. */
export function candidatsNumero<P extends { numero: number; statut?: string }>(numero: number, paquets: P[]): P[] {
  return paquets.filter((p) => p.numero === numero && (p.statut ?? "actif") === "actif");
}
