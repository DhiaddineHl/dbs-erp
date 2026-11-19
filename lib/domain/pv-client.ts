/* PV DE COUPE AU FORMAT DES CLIENTS (« Résultat de coupe ») — règles pures.
 *
 * Les clients (ex. Claudie Pierlot) envoient leur propre fiche à renvoyer
 * « complétée et signée » : modèle, référence, tissu principal, laize
 * constatée, quantités commandées / coupées / 2e choix par taille, puis
 * l'emploi tissu (reçu, emploi moyen, utilisé, chutes, rouleaux en défaut,
 * stock après coupe) pour le tissu, la doublure, le thermo.
 *
 * Ce module transforme une fiche de coupe validée en ces lignes-là. Rien
 * n'est inventé : une case qu'on ne sait pas remplir reste vide. */

export type LotPv = {
  identifiant: string;
  reference: string;
  couleur: string;
  unite: string;
  /** Laize (cm) telle qu'enregistrée au magasin tissu. */
  laize: number | null;
  /** Reçu mesuré, et ce qu'il en reste (en rayon + encore dehors). */
  recu: number;
  reste: number;
};
export type ConsoPv = { lot: string; rouleau: string; consomme: number; chute: number; /** Manquant sur rouleau constaté à la coupe. */ manquant?: number };
export type MatierePlanPv = { nom: string; consoPrevue: number | null };

export type TissuPv = {
  ref: string;
  coloris: string;
  unite: string;
  recu: number;
  emploiMoyen: number | null;
  utilise: number;
  chutes: number;
  rouleauxDefaut: string;
  total: number;
  stockApres: number;
};
export type AutreMatierePv = { libelle: string; ref: string; emploiMoyen: number | null };

export type DonneesPvClient = {
  faconnier: string;
  dateCoupe: string;
  numeroOf: string;
  client: string;
  modele: string;
  reference: string;
  tissuPrincipal: string;
  /** Laize utile constatée (m), « 1.48 » ; "" si inconnue. */
  laize: string;
  tailles: string[];
  commandees: Record<string, number>;
  coupees: Record<string, number>;
  /** 2e choix par taille (livraisons reçues) ; null = inconnu, cases vides. */
  second: Record<string, number> | null;
  tissus: TissuPv[];
  doublure: AutreMatierePv | null;
  thermo: AutreMatierePv | null;
  autres: AutreMatierePv[];
  numeroFiche: string;
};

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const r3 = (n: number) => Math.round(n * 1000) / 1000 + 0;
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

/** Laize en mètres (la base la garde en cm) ; plusieurs laizes : « 1.46 / 1.48 ». */
export function laizeMetres(laizesCm: (number | null)[]): string {
  const vals = [...new Set(laizesCm.filter((x): x is number => x != null && x > 0).map((x) => (x > 10 ? x / 100 : x).toFixed(2)))];
  return vals.sort().join(" / ");
}

/** L'emploi tissu, groupé par référence + coloris (plusieurs lots d'un même
 * tissu font une ligne). L'emploi moyen se calcule sur les pièces coupées
 * des OF de cette couleur (toutes les pièces s'il n'y a qu'un coloris). */
export function emploiTissu(v: {
  conso: ConsoPv[];
  lots: LotPv[];
  rouleauxDefaut: string[];
  piecesParCouleur: Record<string, number>;
  piecesTotal: number;
}): TissuPv[] {
  const lotParId = new Map(v.lots.map((l) => [l.identifiant, l]));
  const groupes = new Map<string, { lots: Set<string>; rouleaux: Set<string>; ref: string; coloris: string; unite: string; utilise: number; chutes: number }>();
  for (const c of v.conso) {
    const l = lotParId.get(c.lot);
    const ref = l?.reference ?? "";
    const coloris = l?.couleur ?? "";
    const cle = `${norm(ref)}|${norm(coloris)}`;
    const g = groupes.get(cle) ?? { lots: new Set(), rouleaux: new Set(), ref, coloris, unite: l?.unite ?? "m", utilise: 0, chutes: 0 };
    g.lots.add(c.lot);
    g.rouleaux.add(c.rouleau);
    g.utilise += c.consomme;
    g.chutes += c.chute + (c.manquant ?? 0);
    groupes.set(cle, g);
  }
  const unSeul = groupes.size <= 1;
  return [...groupes.values()].map((g) => {
    const lots = [...g.lots].map((id) => lotParId.get(id)).filter((x): x is LotPv => !!x);
    const pieces = unSeul ? v.piecesTotal : (Object.entries(v.piecesParCouleur).find(([k]) => norm(k) === norm(g.coloris))?.[1] ?? 0);
    return {
      ref: g.ref,
      coloris: g.coloris,
      unite: g.unite,
      recu: r2(lots.reduce((s, l) => s + l.recu, 0)),
      emploiMoyen: pieces > 0 ? r3(g.utilise / pieces) : null,
      utilise: r2(g.utilise),
      chutes: r2(g.chutes),
      rouleauxDefaut: v.rouleauxDefaut.filter((r) => g.rouleaux.has(r)).join(", "),
      total: r2(g.utilise + g.chutes),
      stockApres: r2(lots.reduce((s, l) => s + l.reste, 0)),
    };
  });
}

/** Les autres matières du plan de coupe : doublure, thermo, puis le reste. */
export function autresMatieres(matieres: MatierePlanPv[], principale: string): { doublure: AutreMatierePv | null; thermo: AutreMatierePv | null; autres: AutreMatierePv[] } {
  const reste = matieres.filter((m) => norm(m.nom) !== norm(principale));
  const prendre = (motif: RegExp, libelle: string) => {
    const i = reste.findIndex((m) => motif.test(norm(m.nom)));
    if (i < 0) return null;
    const [m] = reste.splice(i, 1);
    return { libelle, ref: m.nom, emploiMoyen: m.consoPrevue };
  };
  const doublure = prendre(/doubl/, "Doublure");
  const thermo = prendre(/thermo|entoil/, "Thermo");
  return { doublure, thermo, autres: reste.map((m) => ({ libelle: m.nom, ref: m.nom, emploiMoyen: m.consoPrevue })) };
}

/** 2e choix par taille d'après les livraisons reçues ; null si aucune. */
export function secondChoix(livraisons: { taille: string; second: number }[][]): Record<string, number> | null {
  if (!livraisons.length) return null;
  const out: Record<string, number> = {};
  for (const ls of livraisons) for (const l of ls) out[l.taille] = (out[l.taille] ?? 0) + (l.second || 0);
  return out;
}

export const total = (m: Record<string, number> | null, tailles: string[]) => (m ? tailles.reduce((s, t) => s + (m[t] ?? 0), 0) : null);

/* ═══════════ constats du coupeur (ou de l'atelier) ═══════════
 *
 * Ce que seul celui qui coupe peut dire, et que le client demande sur son
 * « Résultat de coupe » : la laize UTILE constatée, les pièces de 2e choix
 * à la coupe (par OF et par taille), et pour chaque rouleau un défaut
 * éventuel et le métrage manquant (étiquette plus longue que le rouleau). */

export type DefautRouleau = { code: string; defaut: string; manquant: number };
export type ConstatsCoupe = {
  /** Laize utile constatée (m), null si non relevée. */
  laize: number | null;
  /** 2e choix à la coupe : OF (id) → taille → pièces. */
  second: Record<string, Record<string, number>>;
  rouleaux: DefautRouleau[];
};
export const CONSTATS_VIDES: ConstatsCoupe = { laize: null, second: {}, rouleaux: [] };

/** Contrôle et nettoie les constats saisis. La laize s'accepte en mètres
 * (1,48) ou en centimètres (148). Le 2e choix ne dépasse pas le coupé. */
export function normaliserConstats(
  brut: Partial<ConstatsCoupe> | null | undefined,
  ctx: { ofs: string[]; tailles: string[]; coupe: Record<string, Record<string, number>>; rouleaux: string[] },
): ConstatsCoupe {
  if (!brut) return CONSTATS_VIDES;
  let laize: number | null = null;
  if (brut.laize != null && String(brut.laize).trim() !== "") {
    const n = Number(String(brut.laize).replace(",", "."));
    if (!Number.isFinite(n) || n <= 0) throw new Error("Laize constatée : un nombre (ex. 1,48).");
    laize = n > 10 ? n / 100 : n;
    if (laize < 0.3 || laize > 4) throw new Error(`Laize constatée ${laize} m : vérifiez (entre 0,30 et 4 m).`);
    laize = Math.round(laize * 1000) / 1000;
  }
  const second: Record<string, Record<string, number>> = {};
  for (const [of, parTaille] of Object.entries(brut.second ?? {})) {
    if (!ctx.ofs.includes(String(of))) throw new Error("2e choix : un OF ne fait pas partie de cette coupe.");
    for (const [t, q] of Object.entries(parTaille ?? {})) {
      const n = Number(q);
      if (!ctx.tailles.includes(t)) throw new Error(`2e choix : taille inconnue ${t}.`);
      if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) throw new Error("2e choix : des nombres entiers.");
      const coupe = ctx.coupe[String(of)]?.[t] ?? 0;
      if (n > coupe) throw new Error(`2e choix ${t} : ${n} pièces pour ${coupe} coupées.`);
      if (n > 0) (second[String(of)] ??= {})[t] = n;
    }
  }
  const rouleaux: DefautRouleau[] = [];
  for (const r of brut.rouleaux ?? []) {
    if (!ctx.rouleaux.includes(r.code)) throw new Error(`Rouleau inconnu : ${r.code}.`);
    const manquant = Number(String(r.manquant ?? 0).replace(",", ".")) || 0;
    if (manquant < 0) throw new Error(`${r.code} : manquant négatif.`);
    const defaut = String(r.defaut ?? "").trim().slice(0, 200);
    if (defaut || manquant > 0) rouleaux.push({ code: r.code, defaut, manquant: Math.round(manquant * 100) / 100 });
  }
  return { laize, second, rouleaux };
}

/** 2e choix par taille (tous OF confondus) ; null s'il n'y en a pas de saisi. */
export function secondDesConstats(c: ConstatsCoupe | null | undefined): Record<string, number> | null {
  if (!c || !Object.keys(c.second ?? {}).length) return null;
  const out: Record<string, number> = {};
  for (const parTaille of Object.values(c.second)) for (const [t, n] of Object.entries(parTaille)) out[t] = (out[t] ?? 0) + n;
  return out;
}
