/**
 * Agrégations pour les graphiques — fonctions pures, sans accès base.
 *
 * Port de `factRealMonthly` / `renderStats` de PilotPro, avec trois écarts
 * assumés (voir le plan « Les graphiques manquants ») :
 *
 *  1. Une ligne dont le coût n'est pas exploitable n'est plus comptée comme
 *     production interne : elle tombe dans « non renseigné ». L'original se
 *     contredisait — `factRealMonthly` la disait interne, l'onglet Stats la
 *     mettait à part. Un coût non saisi est une donnée manquante, pas une
 *     production interne.
 *  2. Ce que l'original appelle « marge façonnier » ne retranche que le coût
 *     de façon — ni tissu, ni fournitures, ni coupe. Le calcul est conservé
 *     (continuité avec les chiffres connus de l'équipe), le nom corrigé en
 *     « marge sur coût façon ».
 *  3. Les mois sans facture sont insérés à zéro : un axe temporel qui saute
 *     un mois ment sur la pente.
 */

export type LigneCoutee = {
  /** Date de la facture, ISO `YYYY-MM-DD`. */
  date: string;
  /** `facture` | `avoir` | `proforma` — seules les factures sont retenues. */
  type: string;
  qte: number;
  /** Montant de la ligne. */
  mt: number;
  /** Prix unitaire facturé. */
  pu: number;
  lieu: "" | "interne" | "faconnier" | string;
  faconnier: string;
  /** Coût de façon unitaire saisi ; `null` quand la case est vide. */
  cout: number | null;
};

const arrondi = (n: number) => Math.round(n * 100) / 100;

export type Origine = "interne" | "faconnier" | "nonRenseigne";

export const LIBELLES_ORIGINE: Record<Origine, string> = {
  interne: "Interne DBS",
  faconnier: "Façonniers",
  nonRenseigne: "Non renseigné",
};

/**
 * Où a été produite la ligne, du point de vue de ce qui est *exploitable*.
 * Un lieu façonnier sans nom, ou sans coût saisi, n'est pas classable :
 * il reste « non renseigné » tant que la saisie n'est pas faite.
 */
export function origineLigne(l: LigneCoutee): Origine {
  if (l.lieu === "interne") return "interne";
  if (l.lieu === "faconnier" && l.faconnier && l.cout != null) return "faconnier";
  return "nonRenseigne";
}

/** Marge sur coût façon d'une ligne sous-traitée : montant − quantité × coût de façon. */
export function margeCoutFacon(l: LigneCoutee): number {
  return arrondi(l.mt - l.qte * (l.cout ?? 0));
}

const MOIS_VALIDE = /^\d{4}-\d{2}$/;

/** Suite continue de mois `YYYY-MM`, bornes incluses. */
export function moisEntre(debut: string, fin: string): string[] {
  const out: string[] = [];
  let [a, m] = debut.split("-").map(Number);
  const [af, mf] = fin.split("-").map(Number);
  while (a < af || (a === af && m <= mf)) {
    out.push(`${a}-${String(m).padStart(2, "0")}`);
    if (++m > 12) {
      m = 1;
      a++;
    }
  }
  return out;
}

/** « 2026-03 » → « mars 26 ». */
export function libelleMois(mois: string): string {
  const [a, m] = mois.split("-").map(Number);
  return new Date(a, m - 1, 1)
    .toLocaleDateString("fr-FR", { month: "short", year: "2-digit" })
    .replace(".", "");
}

/** Ne garde que ce qui est facturé et daté d'un mois exploitable. */
function facturesDatees(lignes: LigneCoutee[]): LigneCoutee[] {
  return lignes.filter((l) => l.type === "facture" && MOIS_VALIDE.test(l.date.slice(0, 7)));
}

/** Étendue continue des mois couverts par les lignes ; vide si aucune. */
function plageMois(lignes: LigneCoutee[]): string[] {
  const vus = lignes.map((l) => l.date.slice(0, 7)).sort();
  return vus.length ? moisEntre(vus[0], vus[vus.length - 1]) : [];
}

/* ─────────── Facturation mensuelle par origine ─────────── */

export type PointFacturation = {
  mois: string;
  label: string;
  interne: number;
  faconnier: number;
  nonRenseigne: number;
  total: number;
  cumul: number;
};

export function facturationMensuelle(lignes: LigneCoutee[]): PointFacturation[] {
  const retenues = facturesDatees(lignes);
  const par = new Map<string, { interne: number; faconnier: number; nonRenseigne: number }>();
  for (const l of retenues) {
    const mois = l.date.slice(0, 7);
    const agg = par.get(mois) ?? { interne: 0, faconnier: 0, nonRenseigne: 0 };
    agg[origineLigne(l)] += l.mt;
    par.set(mois, agg);
  }

  let cumul = 0;
  return plageMois(retenues).map((mois) => {
    const a = par.get(mois) ?? { interne: 0, faconnier: 0, nonRenseigne: 0 };
    const total = a.interne + a.faconnier + a.nonRenseigne;
    cumul += total;
    return {
      mois,
      label: libelleMois(mois),
      interne: arrondi(a.interne),
      faconnier: arrondi(a.faconnier),
      nonRenseigne: arrondi(a.nonRenseigne),
      total: arrondi(total),
      cumul: arrondi(cumul),
    };
  });
}

/* ─────────── Marge sur coût façon, par façonnier et par mois ─────────── */

/** Un point de la courbe : le mois, puis une clé par série (`f0`, `f1`, …). */
export type PointMarge = { mois: string; label: string } & Record<string, number | string>;

export type SerieFaconnier = { cle: string; nom: string; total: number };

export type MargesFaconniers = {
  data: PointMarge[];
  series: SerieFaconnier[];
  total: number;
  /** Nombre de façonniers repliés dans « Autres » (0 si aucun). */
  replies: number;
};

export const CLE_AUTRES = "autres";

/**
 * Une série par façonnier, les `plafond` premiers par volume ; le reste est
 * agrégé sous « Autres ». Le référentiel compte dix-sept façonniers : au-delà
 * d'une poignée de courbes la légende coûte plus de place que le graphique,
 * et la palette catégorielle n'a que six teintes validées.
 */
export function margesFaconniers(lignes: LigneCoutee[], plafond = 6): MargesFaconniers {
  const retenues = facturesDatees(lignes).filter((l) => origineLigne(l) === "faconnier");
  const parNom = new Map<string, Map<string, number>>();
  const totaux = new Map<string, number>();

  for (const l of retenues) {
    const mois = l.date.slice(0, 7);
    const marge = margeCoutFacon(l);
    const serie = parNom.get(l.faconnier) ?? new Map<string, number>();
    serie.set(mois, (serie.get(mois) ?? 0) + marge);
    parNom.set(l.faconnier, serie);
    totaux.set(l.faconnier, (totaux.get(l.faconnier) ?? 0) + marge);
  }

  const classes = [...totaux.entries()].sort((x, y) => y[1] - x[1]);
  const tetes = classes.slice(0, plafond);
  const queue = classes.slice(plafond);

  const series: SerieFaconnier[] = tetes.map(([nom, total], i) => ({
    cle: `f${i}`,
    nom,
    total: arrondi(total),
  }));
  if (queue.length) {
    series.push({
      cle: CLE_AUTRES,
      // « Autres façonniers » et non « Autres » : le référentiel contient un
      // façonnier nommé littéralement « Autre ».
      nom: `Autres façonniers (${queue.length})`,
      total: arrondi(queue.reduce((s, [, t]) => s + t, 0)),
    });
  }

  const data: PointMarge[] = plageMois(retenues).map((mois) => {
    const point: PointMarge = { mois, label: libelleMois(mois) };
    for (const [i, [nom]] of tetes.entries()) {
      point[`f${i}`] = arrondi(parNom.get(nom)?.get(mois) ?? 0);
    }
    if (queue.length) {
      point[CLE_AUTRES] = arrondi(queue.reduce((s, [nom]) => s + (parNom.get(nom)?.get(mois) ?? 0), 0));
    }
    return point;
  });

  return {
    data,
    series,
    total: arrondi(classes.reduce((s, [, t]) => s + t, 0)),
    replies: queue.length,
  };
}

/* ─────────── Répartition de la production (pièces en cours) ─────────── */

export type PartProduction = {
  /** Clé stable pour la couleur : la teinte suit l'entité, pas son rang. */
  cle: string;
  nom: string;
  pieces: number;
  interne: boolean;
  /**
   * Rang dans la palette catégorielle, attribué par volume avant tout tri
   * d'affichage : la teinte ne change pas quand l'ordre des parts change.
   * `null` pour « Non assigné », qui prend le gris de repli.
   */
  slot: number | null;
};

export type RepartitionProduction = {
  parts: PartProduction[];
  total: number;
  /** Part interne DBS, en pourcentage entier du total. */
  pctInterne: number;
};

const NOMS_INTERNES = ["dbs"];
export const CLE_NON_ASSIGNE = "nonAssigne";

/**
 * Répartit les pièces encore en production entre l'atelier et les façonniers.
 *
 * `plafond` compte les parts qui consomment une teinte de la palette
 * catégorielle : « Non assigné » n'en consomme pas (gris de repli), et
 * « Autres » en prend une. Six teintes validées ⇒ cinq unités nommées.
 *
 * « Non assigné » reste une part à part entière : c'est un signal de
 * planification, pas un défaut d'affichage.
 */
export function repartitionProduction(
  commandes: { assigne: string; qte: number }[],
  plafond = 5,
): RepartitionProduction {
  const par = new Map<string, number>();
  let nonAssigne = 0;
  for (const c of commandes) {
    const nom = c.assigne.trim();
    if (!nom) nonAssigne += c.qte;
    else par.set(nom, (par.get(nom) ?? 0) + c.qte);
  }

  const classes = [...par.entries()].sort((x, y) => y[1] - x[1]);
  const tetes = classes.slice(0, plafond);
  const queue = classes.slice(plafond);

  const parts: PartProduction[] = tetes.map(([nom, pieces], i) => ({
    cle: nom,
    nom,
    pieces,
    interne: NOMS_INTERNES.includes(nom.toLowerCase()),
    slot: i,
  }));
  if (queue.length) {
    parts.push({
      cle: CLE_AUTRES,
      nom: `Autres (${queue.length})`,
      pieces: queue.reduce((s, [, p]) => s + p, 0),
      interne: false,
      slot: tetes.length,
    });
  }
  if (nonAssigne > 0) {
    parts.push({ cle: CLE_NON_ASSIGNE, nom: "Non assigné", pieces: nonAssigne, interne: false, slot: null });
  }
  parts.sort((a, b) => b.pieces - a.pieces);

  const total = nonAssigne + classes.reduce((s, [, p]) => s + p, 0);
  const interne = classes
    .filter(([nom]) => NOMS_INTERNES.includes(nom.toLowerCase()))
    .reduce((s, [, p]) => s + p, 0);

  return { parts, total, pctInterne: total > 0 ? Math.round((interne / total) * 100) : 0 };
}
