/* RELEVÉ DES PAQUETS DANS LA SAISIE HORAIRE — logique pure.
 *
 * À côté des pièces de l'heure, l'agent de méthode note les NUMÉROS de
 * paquets travaillés : elle scanne l'étiquette, ou elle tape le numéro. Un
 * relevé veut dire « on a travaillé dessus cette heure-ci », pas « c'est
 * fini » : un paquet commencé à 10 h et achevé à 11 h est noté deux fois,
 * et c'est normal.
 *
 * Ce module travaille avec les VRAIS paquets quand ils existent — ceux que
 * la coupe a créés, avec leur code QR, leur taille et leur quantité propre
 * (voir lib/domain/paquet.ts). Il tient alors le CARNET de l'OF en
 * production : il convertit un code scanné en numéro, refuse un paquet qui
 * n'appartient pas à l'OF, et recoupe sur la vraie quantité de chaque
 * paquet plutôt que sur un 25 théorique.
 *
 * Sans paquets créés — une coupe qui n'est pas suivie — tout continue de
 * fonctionner sur le calcul théorique : l'agent tape des numéros, et le
 * recoupement se fait sur la taille de paquet réglée pour le modèle.
 *
 * Règle d'or : rien ici n'écrit la production. `commande.produit` reste
 * calculé par lib/services/avancement.ts depuis la sortie de chaîne. Le
 * relevé OBSERVE et SIGNALE — il ne compte pas. */

import { lireScanPaquet } from "./paquet";

export const TAILLE_PAQUET_DEFAUT = 25;
/** Garde-fou de saisie : un numéro de paquet au-delà est une faute de frappe. */
export const PAQUET_MAX = 9999;
/** Au-delà, la case devient illisible : on refuse plutôt que de tronquer. */
export const PAQUETS_MAX_PAR_CASE = 40;

/* ─────────── le carnet des vrais paquets de l'OF ─────────── */

/** Un paquet réellement créé à la coupe, tel que la saisie horaire en a
 * besoin : son numéro (ce qui est écrit en gros sur l'étiquette), son code
 * (ce que contient le QR), sa taille et sa quantité propre. */
export type PaquetConnu = {
  numero: number;
  code: string;
  taille: string;
  /** Quantité RÉELLE (corrigée par la coupe le cas échéant). */
  qte: number;
  of: string;
  /** Couleur de l'OF : distingue deux paquets 12 de deux couleurs. */
  couleur?: string;
  /** Morceaux qui comptent (annulés retirés). */
  morceaux?: string[];
};

/** Les paquets de l'OF en production, indexés pour la saisie.
 * `null` = la coupe de cet OF n'est pas suivie par paquets : on retombe sur
 * le calcul théorique, et rien ne se bloque. */
export type Carnet = { parNumero: Map<number, PaquetConnu>; parCode: Map<string, PaquetConnu> } | null;

export function carnet(paquets: PaquetConnu[]): Carnet {
  if (!paquets.length) return null;
  const parNumero = new Map<number, PaquetConnu>();
  const parCode = new Map<string, PaquetConnu>();
  for (const p of paquets) {
    // Deux OF frères peuvent porter le même numéro : le premier déclaré
    // gagne pour la saisie au clavier, le code QR reste sans ambiguïté.
    if (!parNumero.has(p.numero)) parNumero.set(p.numero, p);
    parCode.set(p.code.toUpperCase(), p);
  }
  return { parNumero, parCode };
}

export type NiveauAlerte = "erreur" | "attention";
export type Alerte = { niveau: NiveauAlerte; message: string };

/** Pièces d'une case horaire, telles que la saisie GPAO les stocke. */
export type Pieces = number | "RI" | "ABS" | undefined;

/* ─────────── lecture et écriture de la case ─────────── */

export type LecturePaquets = { ok: true; numeros: number[] } | { ok: false; error: string };

/** Lit ce que l'agent tape : « 12 », « 12, 13 », « 12 13 », « 12-15 »,
 * « 12;13 », ou vide. Les doublons disparaissent, le résultat est trié.
 *
 * On accepte volontairement plusieurs façons d'écrire : l'agent note au
 * stylo sur sa tablette, il ne doit pas avoir à retenir une syntaxe. */
export function lirePaquets(texte: string): LecturePaquets {
  /* « 12 à 14 » et « 12 - 14 » doivent tenir en un seul morceau : on resserre
   * les séparateurs de plage AVANT de découper sur les espaces. */
  const t = (texte ?? "").trim().replace(/\s*(?:[-–—]|à)\s*/gi, "-");
  if (!t) return { ok: true, numeros: [] };
  const vus = new Set<number>();
  for (const brut of t.split(/[\s,;/|]+/).filter(Boolean)) {
    const plage = /^(\d+)-(\d+)$/.exec(brut);
    if (plage) {
      const a = Number(plage[1]);
      const b = Number(plage[2]);
      if (!bornesOk(a) || !bornesOk(b)) return { ok: false, error: `« ${brut} » : numéro de paquet hors limites (1 à ${PAQUET_MAX}).` };
      if (b < a) return { ok: false, error: `« ${brut} » : la plage est à l'envers.` };
      if (b - a + 1 > PAQUETS_MAX_PAR_CASE) return { ok: false, error: `« ${brut} » : ${b - a + 1} paquets d'un coup, c'est trop pour une case.` };
      for (let n = a; n <= b; n++) vus.add(n);
      continue;
    }
    if (!/^\d+$/.test(brut)) return { ok: false, error: `« ${brut} » n'est pas un numéro de paquet.` };
    const n = Number(brut);
    if (!bornesOk(n)) return { ok: false, error: `« ${brut} » : numéro de paquet hors limites (1 à ${PAQUET_MAX}).` };
    vus.add(n);
  }
  if (vus.size > PAQUETS_MAX_PAR_CASE) return { ok: false, error: `${vus.size} paquets dans une seule case, c'est trop (maximum ${PAQUETS_MAX_PAR_CASE}).` };
  return { ok: true, numeros: [...vus].sort((a, b) => a - b) };
}

const bornesOk = (n: number) => Number.isInteger(n) && n >= 1 && n <= PAQUET_MAX;

/** Lit la case en acceptant AUSSI ce que crache une douchette ou la caméra :
 * « PQ-2026-000012 », ou l'adresse entière « https://…/p/PQ-2026-000012/3 ».
 * Chaque code est remplacé par le numéro du paquet correspondant.
 *
 * Un code qui n'appartient pas à l'OF de la journée est refusé nommément :
 * c'est le contrôle que le simple numéro tapé ne pouvait pas faire. */
export function lireSaisiePaquets(texte: string, c: Carnet): LecturePaquets {
  const t = (texte ?? "").trim();
  if (!t) return { ok: true, numeros: [] };
  const morceaux: string[] = [];
  for (const brut of t.split(/[\s,;|]+/).filter(Boolean)) {
    // Une adresse de QR contient des « / » : on ne la découpe pas dessus.
    const lu = /PQ-\d{4}-\d{1,6}/i.test(brut) ? lireScanPaquet(brut) : null;
    if (!lu) {
      morceaux.push(brut);
      continue;
    }
    const p = c?.parCode.get(lu.code);
    if (!p) {
      return {
        ok: false,
        error: c
          ? `${lu.code} n'est pas un paquet de cet OF. Vérifiez l'étiquette ou la journée.`
          : `${lu.code} : cet OF n'a pas de paquets créés à la coupe — tapez le numéro.`,
      };
    }
    morceaux.push(String(p.numero));
  }
  const r = lirePaquets(morceaux.join(" "));
  if (!r.ok || !c) return r;
  // Un numéro tapé à la main doit exister lui aussi.
  const inconnus = r.numeros.filter((n) => !c.parNumero.has(n));
  if (inconnus.length) {
    return { ok: false, error: `Paquet ${formatPaquets(inconnus)} : ce numéro n'existe pas dans cet OF.` };
  }
  return r;
}

/** Réécrit une liste de numéros de façon lisible : les suites d'au moins
 * trois numéros se replient en plage (12, 13, 14, 16 → « 12-14, 16 »). */
export function formatPaquets(numeros: number[]): string {
  const l = [...new Set(numeros)].filter(bornesOk).sort((a, b) => a - b);
  const bouts: string[] = [];
  for (let i = 0; i < l.length; ) {
    let f = i;
    while (f + 1 < l.length && l[f + 1] === l[f] + 1) f++;
    bouts.push(f - i >= 2 ? `${l[i]}-${l[f]}` : l.slice(i, f + 1).join(", "));
    i = f + 1;
  }
  return bouts.join(", ");
}

/* ─────────── taille du paquet et découpage de l'OF ─────────── */

/** Taille retenue : celle du modèle si elle est renseignée, sinon le réglage
 * de l'usine, sinon 25. Le cahier des charges interdit d'imposer 25 : un
 * paquet peut en contenir 17. */
export function taillePaquet(tailleModele: number | null | undefined, reglage: number | null | undefined): number {
  const m = Number(tailleModele) || 0;
  if (m > 0) return Math.trunc(m);
  const r = Number(reglage) || 0;
  return r > 0 ? Math.trunc(r) : TAILLE_PAQUET_DEFAUT;
}

/** Nombre de paquets d'un OF : la quantité découpée par paquets, le dernier
 * étant plus petit. 0 quand la quantité n'est pas connue — on ne contrôle
 * alors pas les numéros, plutôt que d'alerter à tort. */
export function nbPaquetsOf(qte: number | null | undefined, taille: number): number {
  const q = Number(qte) || 0;
  return q > 0 && taille > 0 ? Math.ceil(q / taille) : 0;
}

/** Pièces que contient le paquet n° `numero` : la taille courante, sauf le
 * dernier paquet de l'OF, qui porte le reste. */
export function contenuPaquet(numero: number, qte: number | null | undefined, taille: number): number {
  const q = Number(qte) || 0;
  const n = nbPaquetsOf(q, taille);
  if (n === 0 || numero < 1 || numero > n) return taille;
  return numero === n ? q - (n - 1) * taille : taille;
}

/** Pièces du paquet n° `numero` : sa quantité RÉELLE quand la coupe l'a
 * créé, sinon le calcul théorique. C'est ce qui rend le recoupement juste
 * sur un dernier paquet de 10 pièces au lieu de 25. */
export function contenuDe(numero: number, c: Carnet, qte: number | null | undefined, taille: number): number {
  return c?.parNumero.get(numero)?.qte ?? contenuPaquet(numero, qte, taille);
}

/** Capacité totale d'une liste de paquets, dernier paquet compris. */
export function capacitePaquets(numeros: number[], qte: number | null | undefined, taille: number, c: Carnet = null): number {
  return numeros.reduce((s, n) => s + contenuDe(n, c, qte, taille), 0);
}

/* ─────────── contrôles ───────────
 *
 * On ne vérifie que ce qui est CERTAIN. Une ouvrière qui cite deux paquets
 * peut très bien n'avoir fait que dix pièces : elle a fini la fin de l'un et
 * entamé l'autre à cheval sur l'heure. En revanche, elle ne peut pas avoir
 * produit plus de pièces que les paquets cités n'en contiennent — cette
 * borne-là ne se discute pas, et c'est elle qui attrape les erreurs. */

/** Contrôle d'UNE case horaire. */
export function controleHeure(v: {
  pieces: Pieces;
  numeros: number[];
  qteOf?: number | null;
  taille: number;
  nbPaquets: number;
  /** Les vrais paquets de l'OF, quand la coupe les a créés. */
  carnet?: Carnet;
}): Alerte | null {
  if (!v.numeros.length) return null;
  const c = v.carnet ?? null;

  /* Avec le carnet, « ce numéro n'existe pas » se dit exactement : on sait
   * quels paquets la coupe a faits. Sans lui, on se rabat sur le compte
   * théorique (quantité ÷ taille de paquet). */
  const hors = c
    ? v.numeros.filter((n) => !c.parNumero.has(n))
    : v.nbPaquets > 0
      ? v.numeros.filter((n) => n > v.nbPaquets)
      : [];
  if (hors.length) {
    return {
      niveau: "erreur",
      message: c
        ? `Paquet ${formatPaquets(hors)} : ce numéro n'existe pas dans cet OF.`
        : `Paquet ${formatPaquets(hors)} : cet OF n'en compte que ${v.nbPaquets}.`,
    };
  }
  if (v.pieces === "ABS" || v.pieces === "RI") {
    return { niveau: "attention", message: `Heure marquée ${v.pieces}, mais des paquets sont notés.` };
  }
  if (typeof v.pieces !== "number" || v.pieces <= 0) {
    return { niveau: "attention", message: "Paquets notés sans aucune pièce déclarée." };
  }
  const capacite = capacitePaquets(v.numeros, v.qteOf, v.taille, c);
  if (v.pieces > capacite) {
    return {
      niveau: "erreur",
      message: `${v.pieces} pièces déclarées, or ${phrasePaquets(v.numeros.length)} n'en ${v.numeros.length > 1 ? "contiennent" : "contient"} que ${capacite}.`,
    };
  }
  return null;
}

const phrasePaquets = (n: number) => (n === 1 ? "1 paquet" : `${n} paquets`);

/* ─────────── bilan d'une ouvrière sur la journée ───────────
 *
 * C'est le vrai recoupement : sur une journée entière, les paquets entamés
 * au changement d'heure se compensent, et le total déclaré doit tenir dans
 * les paquets cités. */

export type BilanOuvriereJour = {
  ouvId: number;
  nom: string;
  /** Pièces déclarées dans la journée (RI et ABS ne comptent pas). */
  pieces: number;
  /** Numéros distincts cités dans la journée, triés. */
  paquets: number[];
  /** Pièces que ces paquets contiennent en tout. */
  capacite: number;
  /** pièces − capacité : positif = plus de pièces que de paquets. */
  ecart: number;
  alerte: Alerte | null;
};

export function bilanOuvriereJour(v: {
  ouvId: number;
  nom: string;
  heures: { pieces: Pieces; numeros: number[] }[];
  qteOf?: number | null;
  taille: number;
  carnet?: Carnet;
}): BilanOuvriereJour {
  let pieces = 0;
  const vus = new Set<number>();
  for (const h of v.heures) {
    if (typeof h.pieces === "number") pieces += h.pieces;
    for (const n of h.numeros) vus.add(n);
  }
  const paquets = [...vus].sort((a, b) => a - b);
  const capacite = capacitePaquets(paquets, v.qteOf, v.taille, v.carnet ?? null);
  const ecart = Math.round((pieces - capacite) * 100) / 100;

  let alerte: Alerte | null = null;
  if (paquets.length === 0) {
    alerte = null; // Aucun paquet noté : rien à recouper, et ce n'est pas une faute.
  } else if (ecart > 0) {
    alerte = {
      niveau: "erreur",
      message: `${pieces} pièces sur la journée, or ${phrasePaquets(paquets.length)} ne ${paquets.length > 1 ? "font" : "fait"} que ${capacite} pièces (${ecart} de trop).`,
    };
  } else if (-ecart >= 2 * v.taille) {
    /* Laisser un paquet entamé en fin de journée est normal ; en laisser deux
     * entiers ne l'est pas — soit des pièces manquent, soit un numéro a été
     * noté par erreur. On signale sans accuser. */
    alerte = {
      niveau: "attention",
      message: `${phrasePaquets(paquets.length)} notés (${capacite} pièces) pour seulement ${pieces} pièces déclarées : ${-ecart} pièces sans explication.`,
    };
  }
  return { ouvId: v.ouvId, nom: v.nom, pieces, paquets, capacite, ecart, alerte };
}

/* ─────────── contrôle de toute la journée ─────────── */

export type AlerteJournee = Alerte & { ouvId?: number; nom?: string; col?: string };

export type LigneSaisie = {
  ouvId: number;
  nom: string;
  col: string;
  pieces: Pieces;
  /** Poste réellement tenu sur cette heure (pour repérer un même paquet
   * compté deux fois sur la MÊME opération). */
  poste: string;
  numeros: number[];
};

export type ControleJournee = {
  bilans: BilanOuvriereJour[];
  alertes: AlerteJournee[];
  /** Numéros vus dans la journée, et ce que ça couvre de l'OF. */
  couverture: { vus: number[]; nbVus: number; nbPaquets: number };
  /** Au moins une case renseignée : sert à masquer le récapitulatif vide. */
  utilise: boolean;
};

export function controleJournee(v: {
  lignes: LigneSaisie[];
  qteOf?: number | null;
  taille: number;
  /** Les vrais paquets de l'OF (lib/domain/paquet.ts). Quand il est là, le
   * recoupement porte sur les quantités réelles et les numéros sont
   * vérifiés un par un. */
  carnet?: Carnet;
}): ControleJournee {
  const c = v.carnet ?? null;
  // Avec le carnet, le nombre de paquets de l'OF est connu exactement.
  const nbPaquets = c ? c.parNumero.size : nbPaquetsOf(v.qteOf, v.taille);
  const alertes: AlerteJournee[] = [];
  const parOuvriere = new Map<number, { nom: string; heures: { pieces: Pieces; numeros: number[] }[] }>();
  /** paquet + poste → qui l'a cité. Un même paquet passe chez plusieurs
   * ouvrières (chacune son opération) : ce n'est anormal que sur le MÊME poste. */
  const parPaquetPoste = new Map<string, Set<string>>();
  let utilise = false;
  const vus = new Set<number>();

  for (const l of v.lignes) {
    const e = parOuvriere.get(l.ouvId) ?? { nom: l.nom, heures: [] };
    e.heures.push({ pieces: l.pieces, numeros: l.numeros });
    parOuvriere.set(l.ouvId, e);
    if (!l.numeros.length) continue;
    utilise = true;
    for (const n of l.numeros) vus.add(n);

    const a = controleHeure({ pieces: l.pieces, numeros: l.numeros, qteOf: v.qteOf, taille: v.taille, nbPaquets, carnet: c });
    if (a) alertes.push({ ...a, ouvId: l.ouvId, nom: l.nom, col: l.col });

    const poste = (l.poste || "").trim().toLowerCase();
    for (const n of l.numeros) {
      const cle = `${n}|${poste}`;
      const qui = parPaquetPoste.get(cle) ?? new Set<string>();
      qui.add(l.nom);
      parPaquetPoste.set(cle, qui);
    }
  }

  for (const [cle, qui] of parPaquetPoste) {
    if (qui.size < 2) continue;
    const [numero, poste] = cle.split("|");
    alertes.push({
      niveau: "attention",
      message: `Paquet ${numero} noté par ${[...qui].join(" et ")} sur le même poste${poste ? ` « ${poste} »` : ""} : à vérifier.`,
    });
  }

  const bilans: BilanOuvriereJour[] = [];
  for (const [ouvId, e] of parOuvriere) {
    const b = bilanOuvriereJour({ ouvId, nom: e.nom, heures: e.heures, qteOf: v.qteOf, taille: v.taille, carnet: c });
    bilans.push(b);
    if (b.alerte) alertes.push({ ...b.alerte, ouvId, nom: e.nom });
  }
  bilans.sort((a, b) => a.nom.localeCompare(b.nom, "fr"));
  // Les erreurs d'abord : c'est ce qu'il faut corriger avant de clôturer.
  alertes.sort((a, b) => (a.niveau === b.niveau ? 0 : a.niveau === "erreur" ? -1 : 1));

  const listeVus = [...vus].sort((a, b) => a - b);
  return { bilans, alertes, couverture: { vus: listeVus, nbVus: listeVus.length, nbPaquets }, utilise };
}
