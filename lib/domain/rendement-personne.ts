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
 *        d. sinon son nom seul (personne pas encore au registre).
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

import { cleNom } from "./atelier";
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

/** Construit LA fonction d'identité. `lignesChaine` = lignes ouvrière des
 * chaînes (id → fiche), pour reconnaître une copie figée restée sans fiche. */
export function resolveurIdentite(
  registre: PersonneRegistre[],
  lignesChaine: { id: number; nom?: string; personnelId?: number | null }[] = [],
) {
  const ids = new Set(registre.map((p) => p.id));
  const parNom = new Map<string, number | null>();
  for (const p of registre) {
    const c = cleNom(p.nom);
    if (!c) continue;
    parNom.set(c, parNom.has(c) ? null : p.id);
  }
  const parLigne = new Map<number, { personnelId: number; cle: string | null }>();
  for (const l of lignesChaine) {
    if (l.personnelId != null && ids.has(l.personnelId)) {
      parLigne.set(l.id, { personnelId: l.personnelId, cle: l.nom != null ? cleNom(l.nom) : null });
    }
  }

  return (l: { id: number; nom: string; personnelId?: number | null }): string => {
    if (l.personnelId != null && ids.has(l.personnelId)) return `P:${l.personnelId}`;
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
