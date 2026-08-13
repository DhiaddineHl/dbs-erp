/* Rendement d'une ouvrière, tel que le portail QR le présente.
 *
 * Port de `ouvriereRendement` de l'application d'origine, avec sa règle la
 * moins évidente conservée telle quelle : le rendement général est la moyenne
 * SIMPLE des rendements journaliers, pas une moyenne pondérée par les heures.
 * Une journée d'une heure pèse donc autant qu'une journée de huit. C'est
 * discutable, mais c'est le chiffre que les ouvrières connaissent et que
 * l'écran GPAO affiche déjà — deux chiffres différents pour la même personne
 * seraient pires qu'un chiffre imparfait. */

export const SEUIL_ALERTE = 75;
export const SEUIL_BON = 85;

export type OpDetail = { poste: string; sam: number; qte: number };

export type JourneeBrute = {
  date: string;
  cols: string[];
  ops: Record<number, Record<string, number | "RI" | "ABS">>;
  opsSam: Record<number, Record<string, number>>;
  opsDetail: Record<number, Record<string, OpDetail[]>>;
  ret: Record<number, number>;
};

export type OuvriereBrute = { id: number; nom: string; poste: string; sam: number };

/** Quantité produite dans l'heure : le détail multi-postes l'emporte. */
export function qteHeure(j: JourneeBrute, ouvId: number, col: string): number {
  const d = j.opsDetail?.[ouvId]?.[col];
  if (d?.length) return d.reduce((t, x) => t + (Number(x.qte) || 0), 0);
  const v = j.ops?.[ouvId]?.[col];
  return typeof v === "number" ? v : 0;
}

/** SAM appliqué dans l'heure : surcharge horaire, sinon le SAM du poste. */
export function samHeure(j: JourneeBrute, o: OuvriereBrute, col: string): number {
  const m = j.opsSam?.[o.id]?.[col];
  return m && m > 0 ? m : o.sam;
}

/** Secondes « gagnées » dans l'heure = Σ(quantité × SAM). */
export function gagneHeure(j: JourneeBrute, o: OuvriereBrute, col: string): number {
  const d = j.opsDetail?.[o.id]?.[col];
  if (d?.length) return d.reduce((t, x) => t + (Number(x.qte) || 0) * (Number(x.sam) || 0), 0);
  const v = j.ops?.[o.id]?.[col];
  return typeof v === "number" ? v * samHeure(j, o, col) : 0;
}

/** Une heure compte comme travaillée dès qu'une saisie existe — y compris à
 * zéro. RI et ABS n'en sont pas : ce sont des marqueurs, pas des quantités. */
export function heureTravaillee(j: JourneeBrute, ouvId: number, col: string): boolean {
  const d = j.opsDetail?.[ouvId]?.[col];
  if (d?.length) return true;
  return typeof j.ops?.[ouvId]?.[col] === "number";
}

export type BarreHeure = { col: string; pct: number | null; qte: number };
export type JourRendement = {
  date: string;
  rendement: number | null;
  pieces: number;
  retouches: number;
  barres: BarreHeure[];
};

export type Rendement = {
  nom: string;
  matricule: string;
  poste: string;
  /** Aucune production enregistrée : la personne existe, la mesure non. */
  trouve: boolean;
  general: number | null;
  jours: JourRendement[];
  dernier: JourRendement | null;
  piecesTotal: number;
  retouchesTotal: number;
};

/** Calcule le rendement d'une ouvrière sur l'ensemble des journées fournies.
 * `presente` dit, pour chaque journée, quelle ligne ouvrière la concerne — la
 * résolution d'identité est faite en amont, par le rattachement au registre. */
export function rendementOuvriere(
  identite: { nom: string; matricule: string; poste: string },
  journees: { journee: JourneeBrute; ouvriere: OuvriereBrute }[],
): Rendement {
  const jours: JourRendement[] = [];
  let piecesTotal = 0;
  let retouchesTotal = 0;

  const triees = [...journees].sort((a, b) => a.journee.date.localeCompare(b.journee.date));

  for (const { journee: j, ouvriere: o } of triees) {
    let gagne = 0;
    let travaillees = 0;
    let pieces = 0;
    const barres: BarreHeure[] = [];

    for (const col of j.cols ?? []) {
      const w = heureTravaillee(j, o.id, col);
      const e = gagneHeure(j, o, col);
      const q = qteHeure(j, o.id, col);
      if (w) travaillees++;
      gagne += e;
      pieces += q;
      // 3600 s = une heure de travail « pleine » au temps standard.
      barres.push({ col, pct: w ? Math.round((e / 3600) * 100) : null, qte: q });
    }

    const retouches = Number(j.ret?.[o.id] ?? 0) || 0;
    jours.push({
      date: j.date,
      rendement: travaillees > 0 ? Math.round((gagne / (travaillees * 3600)) * 100) : null,
      pieces,
      retouches,
      barres,
    });
    piecesTotal += pieces;
    retouchesTotal += retouches;
  }

  if (!jours.length) {
    return { ...identite, trouve: false, general: null, jours: [], dernier: null, piecesTotal: 0, retouchesTotal: 0 };
  }

  const notes = jours.map((j) => j.rendement).filter((r): r is number => r !== null);
  const general = notes.length ? Math.round(notes.reduce((s, r) => s + r, 0) / notes.length) : null;

  return {
    ...identite,
    trouve: true,
    general,
    jours,
    dernier: jours[jours.length - 1],
    piecesTotal,
    retouchesTotal,
  };
}

export type NiveauRendement = "bon" | "moyen" | "faible";

export function niveau(pct: number | null): NiveauRendement | null {
  if (pct === null) return null;
  return pct >= SEUIL_BON ? "bon" : pct >= SEUIL_ALERTE ? "moyen" : "faible";
}

export const COULEUR_RENDEMENT: Record<NiveauRendement, string> = {
  bon: "#16a34a",
  moyen: "#d97706",
  faible: "#dc2626",
};

/* ─────────── vue direction ─────────── */

export type LigneChaine = {
  chaine: string;
  modele: string;
  date: string;
  effectif: number;
  objectifHeure: number;
  sortie: number;
  rendement: number;
  parHeure: { col: string; qte: number; objectif: number }[];
};

/** Rendement d'une chaîne sur une journée : production × SAM du modèle,
 * rapporté au temps de présence total. */
export function rendementChaine(input: {
  sortieTotale: number;
  samModele: number;
  effectif: number;
  nbHeures: number;
}): number {
  const dispo = input.effectif * input.nbHeures * 3600;
  if (dispo <= 0) return 0;
  return Math.round(((input.sortieTotale * input.samModele) / dispo) * 100);
}

export function objectifHeure(effectif: number, samModele: number, manuel?: number | null): number {
  if (manuel && manuel > 0) return manuel;
  if (samModele <= 0) return 0;
  return Math.round((effectif * 3600) / samModele);
}
