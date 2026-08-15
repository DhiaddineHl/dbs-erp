import { cleNom, distanceUn, motsDe } from "./atelier";

/* Hygiène du référentiel : deux corvées que l'original faisait à la main.
 *
 *  · B12 — les factures rangées en « AUTRE » n'ont pas de société. On la
 *    retrouve en confrontant les modèles et références de la facture aux
 *    commandes ;
 *  · B17 — les fiches clients en double (« PATRICK CONFECTION » existe deux
 *    fois dans la base reprise) éclatent le CA d'un même client en deux et
 *    rendent les listes déroulantes ambiguës.
 *
 * Les deux ne font que *proposer*. Rien n'est écrit sans un clic : deux fiches
 * qui se ressemblent peuvent être deux vraies sociétés. */

/* ═══════════ B12 · ventilation des factures « AUTRE » ═══════════ */

/** Clé de comparaison d'un modèle ou d'une référence : la casse, les accents
 * et la ponctuation ne distinguent pas deux articles. */
export function cleArticle(s: string | null | undefined): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

export type LigneFacture = { modele: string; ref: string };
export type CommandeRepere = { client: string; modele: string; refArticle: string };

export type Suffrage = { client: string; points: number };
export type Detection = {
  /** Société la mieux placée, "" si aucune ne se dégage. */
  propose: string;
  suffrages: Suffrage[];
  /** Vrai quand deux sociétés sont à égalité — il faut alors trancher. */
  indecis: boolean;
};

/* Un modèle identique est une preuve forte : un même modèle appartient à un
 * client. Une référence identique l'est moins — les références se répètent
 * d'une saison à l'autre. D'où 3 contre 2. */
const POINTS_MODELE = 3;
const POINTS_REF = 2;

/** Déduit la société d'une facture de ses lignes, confrontées aux commandes. */
export function detecterSociete(lignes: LigneFacture[], commandes: CommandeRepere[]): Detection {
  const points = new Map<string, number>();
  const ajouter = (client: string, n: number) => points.set(client, (points.get(client) ?? 0) + n);

  /* Index préalable : une facture de 40 lignes contre 3 000 commandes ferait
   * 120 000 comparaisons en boucles imbriquées. */
  const parModele = new Map<string, Set<string>>();
  const parRef = new Map<string, Set<string>>();
  for (const c of commandes) {
    const client = c.client.trim();
    if (!client) continue;
    const m = cleArticle(c.modele);
    const r = cleArticle(c.refArticle);
    if (m) (parModele.get(m) ?? parModele.set(m, new Set()).get(m)!).add(client);
    if (r) (parRef.get(r) ?? parRef.set(r, new Set()).get(r)!).add(client);
  }

  for (const l of lignes) {
    const m = cleArticle(l.modele);
    const r = cleArticle(l.ref);
    const surModele = m ? parModele.get(m) : undefined;
    if (surModele?.size) {
      for (const client of surModele) ajouter(client, POINTS_MODELE);
      continue; // le modèle a tranché, la référence n'ajoute rien
    }
    const surRef = r ? parRef.get(r) : undefined;
    if (surRef?.size) for (const client of surRef) ajouter(client, POINTS_REF);
  }

  const suffrages = [...points.entries()]
    .map(([client, points]) => ({ client, points }))
    .sort((a, b) => b.points - a.points || a.client.localeCompare(b.client));

  const indecis = suffrages.length > 1 && suffrages[0].points === suffrages[1].points;
  return { propose: indecis ? "" : suffrages[0]?.client ?? "", suffrages, indecis };
}

/* ═══════════ B17 · fusion des clients en double ═══════════ */

export type ClientFusionnable = {
  id: number;
  nom: string;
  code: string;
  /** Renseignement des champs de contact — départage la fiche à garder. */
  cmd: number;
  ca: number;
};

export type PaireClients = {
  /** Fiche à garder : la plus complète, à défaut la plus ancienne. */
  garde: ClientFusionnable;
  absorbes: ClientFusionnable[];
  /** "identique" quand les noms coïncident au caractère près. */
  certitude: "identique" | "probable";
  motif: string;
};

/** Ce qu'une fiche apporte, pour choisir laquelle garder.
 *
 * Le nombre de commandes prime : c'est la fiche que tout le monde utilise
 * déjà, et la garder minimise les lignes à réécrire. Le CA départage à
 * égalité, puis l'ancienneté de l'identifiant. */
const poids = (c: ClientFusionnable) => [c.cmd, c.ca, -c.id];

function meilleure(a: ClientFusionnable, b: ClientFusionnable): ClientFusionnable {
  const pa = poids(a);
  const pb = poids(b);
  for (let i = 0; i < pa.length; i++) {
    if (pa[i] !== pb[i]) return pa[i] > pb[i] ? a : b;
  }
  return a;
}

/** Seuil de recouvrement au-delà duquel deux raisons sociales sont proposées
 * à la fusion : tous les mots du nom le plus court doivent se retrouver. */
const SEUIL_COUVERTURE = 0.99;

/** Longueur en deçà de laquelle deux mots doivent coïncider exactement.
 *
 * La tolérance à une lettre près, utile sur les patronymes de l'atelier, est
 * ruineuse sur les formes juridiques : elle rapproche « SRL » de « SPA » et
 * « A CORP » de « B CORP », qui sont des sociétés différentes. */
const MOT_FLOU_MIN = 4;

const motsProches = (a: string, b: string) =>
  a === b || (a.length >= MOT_FLOU_MIN && b.length >= MOT_FLOU_MIN && distanceUn(a, b));

/** Recouvrement de deux raisons sociales, rapporté au nom le plus court.
 * Variante prudente de `couverture` de lib/domain/atelier.ts. */
function couvertureSociete(a: string, b: string): { communs: number; taux: number } {
  const A = motsDe(a);
  const B = motsDe(b);
  if (!A.length || !B.length) return { communs: 0, taux: 0 };
  let communs = 0;
  for (const t of A) if (B.some((u) => motsProches(t, u))) communs++;
  return { communs, taux: communs / Math.min(A.length, B.length) };
}

/** Groupes de fiches clients qui désignent vraisemblablement la même société.
 *
 * Deux niveaux seulement : nom strictement identique une fois normalisé
 * (« PATRICK CONFECTION » deux fois), et mots identiques dans un autre ordre
 * ou à une lettre près. On ne va pas plus loin : fusionner deux vrais clients
 * mélangerait deux chiffres d'affaires, ce qui ne se défait pas. */
export function propositionsFusionClients(clients: ClientFusionnable[]): PaireClients[] {
  const parCle = new Map<string, ClientFusionnable[]>();
  for (const c of clients) {
    const k = cleNom(c.nom);
    if (!k) continue;
    (parCle.get(k) ?? parCle.set(k, []).get(k)!).push(c);
  }

  const sorties: PaireClients[] = [];
  const deja = new Set<number>();

  /* 1. Clé identique — mots identiques, l'ordre et la casse mis à part. */
  for (const groupe of parCle.values()) {
    if (groupe.length < 2) continue;
    const garde = groupe.reduce(meilleure);
    const absorbes = groupe.filter((c) => c.id !== garde.id);
    for (const c of groupe) deja.add(c.id);
    const strict = groupe.every((c) => c.nom.trim() === groupe[0].nom.trim());
    sorties.push({
      garde,
      absorbes,
      certitude: "identique",
      motif: strict ? "Raison sociale identique" : "Mêmes mots, écriture différente",
    });
  }

  /* 2. Recouvrement fort entre fiches restées seules. */
  const restants = clients.filter((c) => !deja.has(c.id));
  for (let i = 0; i < restants.length; i++) {
    if (deja.has(restants[i].id)) continue;
    const proches = [restants[i]];
    for (let j = i + 1; j < restants.length; j++) {
      if (deja.has(restants[j].id)) continue;
      const { taux, communs } = couvertureSociete(restants[i].nom, restants[j].nom);
      // `communs >= 2` : « SUD » couvrirait sinon « SUD CONFECTION » à 100 %.
      if (taux >= SEUIL_COUVERTURE && communs >= 2) proches.push(restants[j]);
    }
    if (proches.length < 2) continue;
    const garde = proches.reduce(meilleure);
    for (const c of proches) deja.add(c.id);
    sorties.push({
      garde,
      absorbes: proches.filter((c) => c.id !== garde.id),
      certitude: "probable",
      motif: "Noms très proches — à vérifier",
    });
  }

  /* Les cas certains d'abord, puis les plus gros enjeux. */
  return sorties.sort(
    (a, b) =>
      Number(b.certitude === "identique") - Number(a.certitude === "identique") ||
      b.absorbes.length - a.absorbes.length ||
      a.garde.nom.localeCompare(b.garde.nom),
  );
}
