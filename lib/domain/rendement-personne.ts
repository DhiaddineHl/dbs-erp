/* Rendement d'une PERSONNE — la règle unique de toute l'application.
 *
 * Écran de saisie, écran TV, historique, classement par seuil, arrêts &
 * retouches, carte QR et portail QR passent tous par ce module. Deux choses y
 * sont fixées une fois pour toutes :
 *
 *   1. QUI est qui (resolveurIdentite). Une ligne d'effectif appartient à :
 *        a. la fiche du registre qu'elle porte (personnelId), si elle existe ;
 *        b. sinon la fiche de la ligne de chaîne dont elle est la copie ;
 *        c. sinon la fiche dont le NOM correspond, s'il n'y en a qu'une ;
 *        d. sinon la fiche dont le nom est le MÊME à une faute près
 *           (« Meriem » / « Mariem », « Bensalem » / « Ben Salem »), si elle
 *           est seule à correspondre ;
 *        e. sinon son nom seul (personne pas encore au registre).
 *      Une fiche FUSIONNÉE dans une autre (supprimée) est suivie jusqu'à la
 *      fiche gardée : la mémoire des fusions (`fusions`) garde le lien, même
 *      quand le nom tapé ce jour-là était différent.
 *      Le QR, l'historique et le classement appliquent donc la même règle :
 *      une même ouvrière ne peut plus être éclatée en plusieurs « personnes ».
 *
 *   2. COMMENT on moyenne. Rendement = Σ minutes gagnées ÷ Σ heures saisies,
 *      calculé sur les valeurs exactes puis arrondi UNE fois. Un jour : c'est
 *      exactement le chiffre de l'écran TV. Une période : c'est la moyenne des
 *      jours pondérée par leurs heures — la même partout.
 *
 * La période « générale » (carte QR, portail, historique par défaut) est la
 * même partout : les 30 derniers jours, aujourd'hui compris. */

import { cleNom, motsDe } from "./atelier";
import { gagneHeure, heureTravaillee, qteHeure, type BarreHeure, type JourneeBrute, type OuvriereBrute } from "./rendement";

/* ─────────── période de référence ─────────── */

export const PERIODE_GENERALE_JOURS = 30;

const isoLocal = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/** Aujourd'hui en AAAA-MM-JJ (heure locale du poste ou du serveur). */
export const aujourdhui = () => isoLocal(new Date());

/** Les N derniers jours, aujourd'hui compris. */
export function periodeGenerale(fin: string = aujourdhui(), jours = PERIODE_GENERALE_JOURS): { from: string; to: string } {
  const [a, m, j] = fin.split("-").map(Number);
  const d = new Date(a, m - 1, j);
  d.setDate(d.getDate() - (jours - 1));
  return { from: isoLocal(d), to: fin };
}

/** Du 1er du mois à la date donnée. */
export const periodeMois = (fin: string = aujourdhui()) => ({ from: `${fin.slice(0, 7)}-01`, to: fin });

/* ─────────── identité ─────────── */

export type LigneEffectif = OuvriereBrute & { personnelId?: number | null };
export type PersonneRegistre = { id: number; nom: string };
/** Une fiche absorbée par une fusion → la fiche gardée. */
export type FusionFiche = { ancienId: number; gardeId: number };

function permutations<T>(xs: T[]): T[][] {
  if (xs.length <= 1) return [xs];
  return xs.flatMap((x, i) => permutations([...xs.slice(0, i), ...xs.slice(i + 1)]).map((p) => [x, ...p]));
}

/** Nombre de corrections (lettre ajoutée, retirée, changée) entre deux mots. */
function distance(a: string, b: string): number {
  if (a === b) return 0;
  let prec = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cour = [i];
    for (let j = 1; j <= b.length; j++) cour[j] = Math.min(prec[j] + 1, cour[j - 1] + 1, prec[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prec = cour;
  }
  return prec[b.length];
}

/** Même personne à une faute de frappe près ? Deux mots au moins de chaque
 * côté (un prénom seul ne désigne jamais quelqu'un), puis :
 *   - mêmes mots dans n'importe quel ordre, chacun à une lettre près — et un
 *     seul mot d'au moins 5 lettres peut en avoir deux (« Dridi Meriem » /
 *     « Mariem Dridi », « Ben Salem Hourya » / « Houriya Ben Selim ») ;
 *   - ou mêmes lettres une fois les mots collés, à une lettre près
 *     (« Ben Salem Hourya » / « Hourya Bensalem »). */
export function nomsProches(a: string, b: string): boolean {
  const A = motsDe(a);
  const B = motsDe(b);
  if (A.length < 2 || B.length < 2) return false;
  if (cleNom(a) === cleNom(b)) return true;
  if (A.length > 4 || B.length > 4) return false;
  if (A.length === B.length) {
    const ok = permutations(B).some((pb) => {
      let largeur2 = 0;
      for (let i = 0; i < A.length; i++) {
        const d = distance(A[i], pb[i]);
        if (d <= 1) continue;
        if (d === 2 && A[i].length >= 5 && pb[i].length >= 5 && ++largeur2 <= 1) continue;
        return false;
      }
      return true;
    });
    if (ok) return true;
  }
  const colleB = permutations(B).map((p) => p.join(""));
  return permutations(A).some((p) => {
    const ca = p.join("");
    return ca.length >= 8 && colleB.some((cb) => distance(ca, cb) <= 1);
  });
}

/** Construit LA fonction d'identité. `lignesChaine` = lignes ouvrière des
 * chaînes (id → fiche), pour reconnaître une copie figée restée sans fiche. */
export function resolveurIdentite(
  registre: PersonneRegistre[],
  lignesChaine: { id: number; nom?: string; personnelId?: number | null }[] = [],
  fusions: FusionFiche[] = [],
) {
  const ids = new Set(registre.map((p) => p.id));
  /* Fiche absorbée → fiche gardée (en suivant les fusions successives). */
  const versGardee = new Map(fusions.map((f) => [f.ancienId, f.gardeId]));
  const suivre = (id: number): number | null => {
    let x: number | undefined = id;
    for (let n = 0; x != null && n < 10; n++) {
      if (ids.has(x)) return x;
      x = versGardee.get(x);
    }
    return null;
  };
  /* Rapprochement à une faute près : seulement vers UNE fiche (sinon on ne
     tranche pas), et mémorisé (les noms se répètent d'un jour à l'autre). */
  const proches = new Map<string, number | null>();
  const procheUnique = (nom: string): number | null => {
    const c = cleNom(nom);
    if (!proches.has(c)) {
      const t = registre.filter((p) => nomsProches(nom, p.nom));
      proches.set(c, t.length === 1 ? t[0].id : null);
    }
    return proches.get(c) ?? null;
  };
  const parNom = new Map<string, number | null>();
  for (const p of registre) {
    const c = cleNom(p.nom);
    if (!c) continue;
    parNom.set(c, parNom.has(c) ? null : p.id);
  }
  const parLigne = new Map<number, { personnelId: number; cle: string | null }>();
  for (const l of lignesChaine) {
    const pid = l.personnelId != null ? suivre(l.personnelId) : null;
    if (pid != null) parLigne.set(l.id, { personnelId: pid, cle: l.nom != null ? cleNom(l.nom) : null });
  }

  return (l: { id: number; nom: string; personnelId?: number | null }): string => {
    if (l.personnelId != null) {
      const pid = suivre(Number(l.personnelId));
      if (pid != null) return `P:${pid}`;
    }
    const c = cleNom(l.nom);
    if (l.id > 0) {
      /* Copie d'une ligne de chaîne : on reprend sa fiche SEULEMENT si c'est
       * toujours le même nom — une ligne réattribuée à une autre ouvrière ne
       * doit pas s'approprier le passé de la précédente. */
      const p = parLigne.get(l.id);
      if (p && (p.cle === null || p.cle === c)) return `P:${p.personnelId}`;
    }
    const p = parNom.get(c);
    if (p != null) return `P:${p}`;
    // Un homonyme exact au registre : on ne tranche pas, même à une faute près.
    if (!parNom.has(c)) {
      const q = procheUnique(l.nom);
      if (q != null) return `P:${q}`;
    }
    return `N:${c}`;
  };
}

/** Identifiant de fiche d'une clé « P:12 », null pour une clé par nom. */
export const personnelDeCle = (cle: string): number | null => (cle.startsWith("P:") ? Number(cle.slice(2)) || null : null);

/* ─────────── mesure ─────────── */

export const rendementDe = (gagne: number, heures: number): number | null =>
  heures > 0 ? Math.round((gagne / (heures * 3600)) * 100) : null;

export type MesureJour = {
  /** Secondes standard produites (Σ quantité × SAM). */
  gagne: number;
  /** Heures saisies (une case horaire renseignée = 1 h, RI/ABS exclus). */
  heures: number;
  pieces: number;
  retouches: number;
  rendement: number | null;
  barres: BarreHeure[];
};

/** Mesure d'une personne sur une journée, toutes ses lignes additionnées
 * (d'ordinaire une seule : c'est alors exactement le chiffre de l'écran TV). */
export function mesureJour(j: JourneeBrute, lignes: OuvriereBrute[]): MesureJour {
  let gagne = 0;
  let heures = 0;
  let pieces = 0;
  let retouches = 0;
  const barres: BarreHeure[] = [];
  for (const col of j.cols ?? []) {
    let e = 0;
    let q = 0;
    let travaillee = false;
    for (const o of lignes) {
      const w = heureTravaillee(j, o.id, col);
      if (w) {
        heures++;
        travaillee = true;
      }
      e += gagneHeure(j, o, col);
      q += qteHeure(j, o.id, col);
    }
    gagne += e;
    pieces += q;
    barres.push({ col, pct: travaillee ? Math.round((e / 3600) * 100) : null, qte: q });
  }
  for (const o of lignes) retouches += Number(j.ret?.[o.id] ?? 0) || 0;
  return { gagne, heures, pieces, retouches, rendement: rendementDe(gagne, heures), barres };
}

export type JourPersonne<M = unknown> = MesureJour & { date: string; lignes: LigneEffectif[]; meta: M };

/** Regroupe toutes les journées par personne. Une journée n'est retenue pour
 * une personne que si elle y a une saisie (heure, pièce ou retouche). */
export function regrouperParPersonne<M>(
  journees: { journee: JourneeBrute; lignes: LigneEffectif[]; meta: M }[],
  cleDe: (l: LigneEffectif) => string,
): Map<string, JourPersonne<M>[]> {
  const out = new Map<string, JourPersonne<M>[]>();
  for (const { journee: j, lignes, meta } of journees) {
    const parCle = new Map<string, LigneEffectif[]>();
    for (const l of lignes) {
      const c = cleDe(l);
      const g = parCle.get(c);
      if (g) g.push(l);
      else parCle.set(c, [l]);
    }
    for (const [cle, ls] of parCle) {
      const m = mesureJour(j, ls);
      if (m.heures <= 0 && m.pieces <= 0 && m.retouches <= 0) continue;
      const g = out.get(cle);
      const jour: JourPersonne<M> = { ...m, date: j.date, lignes: ls, meta };
      if (g) g.push(jour);
      else out.set(cle, [jour]);
    }
  }
  for (const g of out.values()) g.sort((a, b) => a.date.localeCompare(b.date));
  return out;
}

export type Synthese = { jours: number; heures: number; gagne: number; pieces: number; retouches: number; rendement: number | null };

/** Synthèse d'une liste de jours (éventuellement filtrée sur une période). */
export function synthese(jours: MesureJour[], periode?: { from: string; to: string }): Synthese {
  let heures = 0;
  let gagne = 0;
  let pieces = 0;
  let retouches = 0;
  let n = 0;
  for (const j of jours as (MesureJour & { date?: string })[]) {
    if (periode && j.date && (j.date < periode.from || j.date > periode.to)) continue;
    n++;
    heures += j.heures;
    gagne += j.gagne;
    pieces += j.pieces;
    retouches += j.retouches;
  }
  return { jours: n, heures, gagne, pieces, retouches, rendement: rendementDe(gagne, heures) };
}

/** Journées dont le rendement du jour est dans [min, max] (bornes facultatives).
 * Une journée sans rendement (aucune heure) n'est jamais « dans la plage ». */
export function joursDansPlage<J extends { rendement: number | null }>(jours: J[], min: number | null, max: number | null): J[] {
  if (min == null && max == null) return jours;
  return jours.filter((j) => j.rendement != null && (min == null || j.rendement >= min) && (max == null || j.rendement <= max));
}
