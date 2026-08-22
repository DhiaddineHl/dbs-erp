import type { Tone } from "@/components/shared/status-badge";

/* Business rules for the commande, ported from PilotPro's `biz` object and the
 * matière helpers (chutePct / consoEff / coupablePieces / _matStatut).
 *
 * Everything here is pure: no DB, no React, no formatting. The service layer
 * feeds it rows and the UI renders what comes back — which is what lets a
 * commande become late without anyone rewriting it. */

/** Minimal shape the rules need. Both DB rows and in-flight form drafts match. */
export type CommandeFacts = {
  qte: number;
  produit: number;
  factureQte: number;
  prixVente: number | null;
  prixFacon: number | null;
  dateExport: string | null;
  dateExportReel: string | null;
  receptTissu: string | null;
  archived: boolean;
  statutManuel: string | null;
  consoTheo?: number | null;
  consoReel?: number | null;
  chutePct?: number | null;
  /* Réception et contrôle du tissu — alimentés par le magasin tissu. */
  tissuRecu?: number;
  tissuDateReelle?: string | null;
  /** "" | conforme | reserve | refuse */
  tissuControle?: string;
};

export const STATUTS = ["preparation", "production", "terminee", "livree", "retard", "archivee"] as const;
export type Statut = (typeof STATUTS)[number];

const STATUT_META: Record<Statut, { label: string; tone: Tone }> = {
  preparation: { label: "En préparation", tone: "neutral" },
  production: { label: "En production", tone: "brand" },
  terminee: { label: "Terminée", tone: "success" },
  livree: { label: "Livrée", tone: "success" },
  retard: { label: "⚠ Retard", tone: "danger" },
  archivee: { label: "Archivée", tone: "neutral" },
};

/** Statuts an operator may pin manually (archivée is set by archiving, not here). */
export const STATUTS_MANUELS = STATUTS.filter((s) => s !== "archivee");

export const statutLabel = (s: Statut) => STATUT_META[s].label;
export const statutTone = (s: Statut) => STATUT_META[s].tone;
export const statutBadge = (s: Statut): [Tone, string] => [STATUT_META[s].tone, STATUT_META[s].label];
export const isStatut = (v: unknown): v is Statut => STATUTS.includes(v as Statut);

/* ─────────── dates ─────────── */

/** Today at midnight, in the local timezone — matches PilotPro's todayISO(). */
export function todayISO(now: Date = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Whole days from `from` to `iso`. Negative = in the past. Null if unparseable. */
export function joursJusqua(iso: string | null | undefined, from: Date = new Date()): number | null {
  if (!iso) return null;
  const target = Date.parse(`${iso}T00:00:00`);
  if (Number.isNaN(target)) return null;
  const base = new Date(from.getFullYear(), from.getMonth(), from.getDate()).getTime();
  return Math.round((target - base) / 86_400_000);
}

/** Whole days between two ISO dates (b − a). Null if either is unparseable. */
export function joursEntre(a: string | null | undefined, b: string | null | undefined): number | null {
  if (!a || !b) return null;
  const from = Date.parse(`${a}T00:00:00`);
  const to = Date.parse(`${b}T00:00:00`);
  if (Number.isNaN(from) || Number.isNaN(to)) return null;
  return Math.round((to - from) / 86_400_000);
}

/* ─────────── money ─────────── */

/** Money is held as double precision, so products drift (8.6 × 2000 − 2.9 × 2000
 * lands on 11399.999999999998). Rounding at the boundary keeps that out of the
 * sums, the CSV exports and the KPI cards. */
const centimes = (n: number) => Math.round(n * 100) / 100;

export const margeUnitaire = (c: CommandeFacts) => centimes((c.prixVente ?? 0) - (c.prixFacon ?? 0));
export const margeTotale = (c: CommandeFacts) => centimes(margeUnitaire(c) * (c.qte || 0));
export const chiffreAffaires = (c: CommandeFacts) => centimes((c.prixVente ?? 0) * (c.qte || 0));

/** Marge as a share of the line's CA, 0 when there is no CA to divide by. */
export function margePct(c: CommandeFacts): number {
  const ca = chiffreAffaires(c);
  return ca > 0 ? (margeTotale(c) / ca) * 100 : 0;
}

/* ─────────── progress & statut ─────────── */

export function avancementPct(c: CommandeFacts): number {
  return c.qte > 0 ? Math.round((c.produit / c.qte) * 100) : 0;
}

/** Extra signals the derived statut can use but that don't live on the row. */
export type StatutContexte = {
  /** True when GPAO already has production declared for this modèle. */
  enProductionGpao?: boolean;
  now?: Date;
};

/** The statut a commande has on its own, ignoring any manual override. */
export function statutDerive(c: CommandeFacts, ctx: StatutContexte = {}): Statut {
  if (c.archived) return "archivee";
  const q = c.qte || 0;
  const prod = c.produit || 0;
  const fac = c.factureQte || 0;

  if (q > 0 && fac >= q) return "livree";
  const j = joursJusqua(c.dateExport, ctx.now);
  if (j !== null && j < 0 && prod < q) return "retard";
  if (q > 0 && prod >= q) return "terminee";
  if (prod > 0 || ctx.enProductionGpao || c.receptTissu) return "production";
  return "preparation";
}

/** The statut actually shown: a manual override wins unless the commande is
 * archived, which always takes precedence. */
export function statutEffectif(c: CommandeFacts, ctx: StatutContexte = {}): Statut {
  if (c.archived) return "archivee";
  if (c.statutManuel && isStatut(c.statutManuel)) return c.statutManuel;
  return statutDerive(c, ctx);
}

/** True once the commande is fully invoiced — the condition that archives it. */
export const estLivree = (c: CommandeFacts) => c.qte > 0 && (c.factureQte || 0) >= c.qte;

/* ─────────── lateness ─────────── */

export type Retard = { jours: number | null; tone: Tone; label: string };

/** Once exported for real, the delay is measured against the planned date;
 * before that it counts down to it. Mirrors PilotPro's retardTag(). */
export function retard(c: CommandeFacts, now: Date = new Date()): Retard {
  if (c.dateExportReel && c.dateExport) {
    const ecart = joursEntre(c.dateExport, c.dateExportReel);
    if (ecart === null) return { jours: null, tone: "neutral", label: "—" };
    if (ecart > 0) return { jours: ecart, tone: "danger", label: `+${ecart}j` };
    if (ecart === 0) return { jours: 0, tone: "success", label: "À l'heure" };
    return { jours: ecart, tone: "success", label: `${Math.abs(ecart)}j avance` };
  }
  const j = joursJusqua(c.dateExport, now);
  if (j === null) return { jours: null, tone: "neutral", label: "—" };
  if (j < 0) return { jours: j, tone: "danger", label: `Retard ${Math.abs(j)}j` };
  if (j <= 3) return { jours: j, tone: "warning", label: `J-${j}` };
  return { jours: j, tone: "neutral", label: `J-${j}` };
}

/* ─────────── fabric (nomenclature ↔ magasin tissu) ─────────── */

/** Waste rate for this commande, falling back to the app-wide default. */
export const chuteEffective = (c: CommandeFacts, defaut: number) =>
  c.chutePct != null ? c.chutePct : defaut;

/** Metres of fabric one piece really costs, waste included. */
export const consoEffective = (c: CommandeFacts, chuteDefaut: number) =>
  (c.consoTheo ?? 0) * (1 + chuteEffective(c, chuteDefaut) / 100);

/** Total metres the commande needs. 0 when the nomenclature is not filled in.
 *
 * `qte` permet de calculer le besoin d'un GROUPE plutôt que d'une ligne : sur
 * un porteur de regroupement, le tissu se commande pour les 364 pièces réunies
 * et non pour ses 330 à lui. Sans cet argument, le magasin recevrait le bon
 * métrage et le verrait signalé comme un excédent. Omis, c'est la quantité de
 * la ligne — le cas de toutes les commandes non rattachées. */
export const besoinTissu = (c: CommandeFacts, chuteDefaut: number, qte = c.qte || 0) =>
  consoEffective(c, chuteDefaut) * qte;

/** Received minus required. Null while either side is unknown. */
export function ecartTissu(c: CommandeFacts, chuteDefaut: number, qte = c.qte || 0): number | null {
  const besoin = besoinTissu(c, chuteDefaut, qte);
  const recu = c.tissuRecu ?? 0;
  if (besoin <= 0 || recu <= 0) return null;
  return recu - besoin;
}

/** How many pieces the fabric on hand can actually yield. */
export function piecesCoupables(c: CommandeFacts, chuteDefaut: number): number | null {
  const conso = consoEffective(c, chuteDefaut);
  if (!c.consoTheo || !c.tissuRecu || conso <= 0) return null;
  return Math.floor(c.tissuRecu / conso);
}

export type EtatMatiere = { kind: "na" | "manque" | "excedent" | "ok"; label: string; tone: Tone };

export function etatMatiere(c: CommandeFacts, chuteDefaut: number, qte = c.qte || 0): EtatMatiere {
  if (!c.consoTheo) return { kind: "na", label: "À renseigner", tone: "neutral" };
  const besoin = besoinTissu(c, chuteDefaut, qte);
  const recu = c.tissuRecu ?? 0;
  if (recu < besoin - 0.01) return { kind: "manque", label: "Manque tissu", tone: "danger" };
  if (recu > besoin + 0.01) return { kind: "excedent", label: "Excédent", tone: "info" };
  return { kind: "ok", label: "OK", tone: "success" };
}

/* ─────────── sous-commandes ───────────
 *
 * Une commande peut en porter d'autres, et le lien existe sous deux natures
 * opposées par l'arithmétique — d'où `LienSousCommande`, jamais une devinette.
 *
 *  · DÉCOUPE : la commande a été fendue. Le porteur garde la quantité totale
 *    promise au client ; ses parts s'en partagent une portion, confiée à
 *    d'autres ateliers, à d'autres prix. 1 200 découpées en 500 + 300 laissent
 *    400 au porteur, et le groupe vaut toujours 1 200.
 *
 *  · REGROUPEMENT : des OF distincts, chacun déjà complet, ont été réunis
 *    parce qu'ils portent la même référence pour le même client. Chacun garde
 *    sa quantité, sa production, sa livraison et sa facture ; le lien ne
 *    mutualise que ce qui s'achète et se contrôle une fois pour tous — la
 *    matière et le contrôle qualité. Le groupe vaut la SOMME de ses membres.
 *
 * D'où la règle unique dont tous les totaux découlent : une ligne ne répond
 * que de la quantité qu'elle n'a pas déléguée, et seule la découpe délègue.
 * Sans elle, le CA d'une commande fendue en trois serait compté quatre fois. */

export const LIENS_SOUS_COMMANDE = ["decoupe", "regroupement"] as const;
export type LienSousCommande = (typeof LIENS_SOUS_COMMANDE)[number];

export const estLienValide = (v: unknown): v is LienSousCommande =>
  LIENS_SOUS_COMMANDE.includes(v as LienSousCommande);

/** Ce que les règles de répartition lisent d'une ligne. */
export type PartCommande = { qte: number; lienParent?: string | null };

/** Une part issue d'une découpe : c'est la seule qui prend sur le porteur. */
const estDecoupe = (e: PartCommande) => e.lienParent === "decoupe";

/** Quantité prise sur le porteur par ses parts découpées.
 *
 * Les membres d'un regroupement n'y entrent pas : ils ne retranchent rien au
 * porteur, ils s'ajoutent à côté de lui. */
export const qteAffectee = (enfants: readonly PartCommande[]) =>
  enfants.filter(estDecoupe).reduce((s, e) => s + (e.qte || 0), 0);

/** Quantité dont la ligne répond elle-même — c'est elle, et non `qte`, qui
 * entre dans les totaux (CA, marge, charge façonnier). Une commande sans part
 * découpée répond de la totalité : la valeur ne change pas pour elle. */
export const qtePropre = (parent: PartCommande, enfants: readonly PartCommande[] = []) =>
  Math.max(0, (parent.qte || 0) - qteAffectee(enfants));

/** Ce qu'il reste à découper. Négatif quand la répartition dépasse le total,
 * ce que l'écran de saisie doit pouvoir montrer avant d'enregistrer. */
export const resteAAffecter = (qteTotale: number, enfants: readonly PartCommande[]) =>
  (qteTotale || 0) - qteAffectee(enfants);

/** Message d'erreur quand la découpe dépasse la quantité du porteur, null
 * quand elle tient. Une sous-répartition est licite : le reliquat est produit
 * par la commande mère elle-même. */
export function erreurRepartition(qteTotale: number, enfants: readonly PartCommande[]): string | null {
  const reste = resteAAffecter(qteTotale, enfants);
  if (reste >= 0) return null;
  return `Les sous-commandes totalisent ${qteAffectee(enfants)} pièces pour une commande de ${
    qteTotale || 0
  } : ${Math.abs(reste)} de trop.`;
}

/** Totaux d'un groupe : le porteur et ses sous-commandes.
 *
 * Chaque pièce n'est comptée qu'une fois, à son propre prix — la part non
 * déléguée du porteur au sien, chaque membre au sien. C'est ce qui permet à
 * une sous-commande d'être vendue plus cher sans que le total mente, et ce qui
 * fait que la même formule sert aux deux natures de lien : la quantité du
 * groupe est toujours « ce dont le porteur répond, plus ses membres ». Pour
 * une découpe, cela redonne la quantité du porteur ; pour un regroupement, la
 * somme des OF réunis. */
export type TotauxGroupe = {
  qte: number;
  produit: number;
  factureQte: number;
  ca: number;
  margeTotale: number;
  av: number;
};

export function totauxGroupe(parent: CommandeFacts, enfants: readonly CommandeFacts[]): TotauxGroupe {
  const propre = qtePropre(parent, enfants);
  let qte = propre;
  let ca = centimes((parent.prixVente ?? 0) * propre);
  let marge = centimes(margeUnitaire(parent) * propre);
  let produit = parent.produit || 0;
  let facture = parent.factureQte || 0;

  for (const e of enfants) {
    qte += e.qte || 0;
    ca += chiffreAffaires(e);
    marge += margeTotale(e);
    produit += e.produit || 0;
    facture += e.factureQte || 0;
  }

  return {
    qte,
    produit,
    factureQte: facture,
    ca: centimes(ca),
    margeTotale: centimes(marge),
    av: qte > 0 ? Math.round((produit / qte) * 100) : 0,
  };
}

/** La commande porteuse et ses sous-commandes, prêtes à être rendues en accordéon. */
export type Groupe<T> = { parent: T; enfants: T[] };

/** Reconstruit l'arbre à partir de la liste plate.
 *
 * Une sous-commande dont le porteur est absent de la liste — filtré, archivé,
 * supprimé — remonte au premier niveau plutôt que de disparaître : une ligne
 * qui existe en base doit rester atteignable à l'écran. */
export function grouperCommandes<T extends { id: number; parentId: number | null }>(
  lignes: readonly T[],
): Groupe<T>[] {
  const presents = new Set(lignes.map((l) => l.id));
  const groupes: Groupe<T>[] = [];
  const parIdParent = new Map<number, Groupe<T>>();

  for (const l of lignes) {
    if (l.parentId != null && presents.has(l.parentId)) continue;
    const g: Groupe<T> = { parent: l, enfants: [] };
    groupes.push(g);
    parIdParent.set(l.id, g);
  }
  for (const l of lignes) {
    if (l.parentId == null) continue;
    parIdParent.get(l.parentId)?.enfants.push(l);
  }
  return groupes;
}

/* ─────────── détection des regroupements possibles ───────────
 *
 * Le même article, pour le même client, arrive souvent en plusieurs OF : un
 * réassort, une commande complétée, une répartition par magasin. Le tissu, lui,
 * s'achète une fois — c'est une seule référence, un seul rouleau, un seul
 * contrôle. Tant que les OF restent indépendants, le magasin saisit la même
 * réception quatre fois, ou l'oublie trois fois sur quatre.
 *
 * La clé est (client, référence) et NON (client, modèle, référence) comme le
 * rapprochement de facturation : deux OF du même article peuvent porter des
 * libellés de modèle légèrement différents selon qui les a saisis, et c'est la
 * référence qui identifie la matière. Une référence vide ne regroupe rien —
 * elle ne dit pas que c'est le même article, seulement que personne ne l'a
 * renseignée. */

export type CandidatRegroupement = {
  id: number;
  of: string;
  client: string;
  refArticle: string;
  modele: string;
  qte: number;
  parentId: number | null;
};

export type GroupeProposé<T> = {
  /** Clé lisible : « PATRICK CONFECTION · PEC27E667 ». */
  cle: string;
  client: string;
  refArticle: string;
  /** Membres du groupe, du plus gros au plus petit. */
  lignes: T[];
  /** Total des pièces du groupe. */
  qte: number;
  /** Porteur proposé : la plus grosse quantité, à égalité le plus ancien OF.
   *
   * La plus grosse parce que c'est celle sur laquelle le besoin tissu est déjà
   * le plus juste, et celle que le magasin connaît déjà — proposer le contraire
   * ferait rattacher 330 pièces à un OF de 12. */
  porteurId: number;
};

export function proposerRegroupements<T extends CandidatRegroupement>(lignes: readonly T[]): GroupeProposé<T>[] {
  const parCle = new Map<string, T[]>();
  for (const l of lignes) {
    const ref = String(l.refArticle ?? "").trim();
    // Déjà rattachée, ou sans référence : rien à proposer.
    if (!ref || l.parentId != null) continue;
    const cle = `${normaliserNom(l.client)}|${normaliserNom(ref)}`;
    const g = parCle.get(cle);
    if (g) g.push(l);
    else parCle.set(cle, [l]);
  }

  return [...parCle.values()]
    .filter((g) => g.length > 1)
    .map((g) => {
      const tri = [...g].sort((a, b) => (b.qte || 0) - (a.qte || 0) || a.of.localeCompare(b.of, "fr", { numeric: true }));
      return {
        cle: `${tri[0].client || "sans client"} · ${tri[0].refArticle}`,
        client: tri[0].client,
        refArticle: tri[0].refArticle,
        lignes: tri,
        qte: tri.reduce((s, l) => s + (l.qte || 0), 0),
        porteurId: tri[0].id,
      };
    })
    .sort((a, b) => b.qte - a.qte);
}

/* ─────────── identifiers ─────────── */

const OF_PREFIX = "OF";

/** "OF-2026-287". Sequence is zero-padded to 3 digits, wider past 999. */
export function numeroOF(sequence: number, annee: number = new Date().getFullYear()): string {
  return `${OF_PREFIX}-${annee}-${String(sequence).padStart(3, "0")}`;
}

/** N° d'une sous-commande, dérivé de celui de sa mère : « OF-2026-287-S2 ».
 *
 * Dériver plutôt que tirer un numéro neuf, parce que la plupart des écrans en
 * aval — BL, facture, traçabilité — n'affichent que le n° OF : le suffixe est
 * ce qui leur permet de dire de quelle commande cette part relève, sans rien
 * changer chez eux. Le préfixe reste lisible par `dernierSequenceOF`, donc la
 * numérotation générale continue sa route sans sauter de rang. */
export function numeroSousCommande(ofParent: string, rang: number): string {
  return `${ofParent}-S${rang}`;
}

/** Highest sequence already used for `annee`, so the next one is +1. */
export function dernierSequenceOF(numeros: string[], annee: number = new Date().getFullYear()): number {
  const prefix = `${OF_PREFIX}-${annee}-`;
  let max = 0;
  for (const n of numeros) {
    if (!n.startsWith(prefix)) continue;
    const seq = parseInt(n.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return max;
}

/* ─────────── interne ou sous-traitance ─────────── */

/** « DBS » désigne l'atelier lui-même, pas un sous-traitant.
 *
 * Une commande dont le façonnier est DBS (ou vide, ou une chaîne interne) est
 * produite en interne. Sans cette règle, des dizaines de commandes comptent
 * pour de la sous-traitance et faussent à la fois la marge à façon et le
 * chiffre d'affaires interne. */
export function estSousTraitee(c: { faconnier?: string | null; chaineId?: number | null }): boolean {
  if (c.chaineId) return false;
  const f = String(c.faconnier ?? "").trim();
  return f !== "" && !/^(dbs|interne)$/i.test(f);
}

/* ─────────── assignation : façonnier ou chaîne interne ─────────── */

/** Préfixe qui distingue une chaîne interne d'un façonnier dans une même liste.
 *
 * Interne et sous-traitance s'excluent — une commande ne peut pas être à la
 * fois « chaîne 2 » et « atelier Sud », sans quoi la marge à façon compte deux
 * fois le même travail. Les réunir dans une seule liste rend cette exclusion
 * évidente à l'écran : on choisit l'un OU l'autre, jamais les deux. */
export const PREFIXE_CHAINE = "__chaine:";

/** Ce qu'un choix dans la liste « Assigné » écrit sur la commande. */
export function assignationDepuisChoix(valeur: string): { chaineId: string; faconnier: string } {
  return valeur.startsWith(PREFIXE_CHAINE)
    ? { chaineId: valeur.slice(PREFIXE_CHAINE.length), faconnier: "" }
    : { chaineId: "", faconnier: valeur };
}

/** L'opération inverse : la valeur à présélectionner dans la liste. */
export const choixAssignation = (c: { chaineId?: number | string | null; faconnier?: string | null }) =>
  c.chaineId ? `${PREFIXE_CHAINE}${c.chaineId}` : c.faconnier ?? "";

/* ─────────── saisie du formulaire ─────────── */

/** Lit un montant tapé à la main : « 12,40 », « 12.40 € », « 1 200,50 ».
 *
 * Vide vaut null, pas zéro : « pas de prix » et « prix nul » ne disent pas la
 * même chose sur une marge. Partagé entre le formulaire et l'import, pour que
 * les deux acceptent exactement les mêmes écritures. */
export function montantSaisi(v: string | number | null | undefined): number | null {
  if (v == null) return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const nettoye = v
    .replace(/[  \s]/g, "")
    .replace(/[€%]/g, "")
    .replace(",", ".");
  if (!nettoye) return null;
  const n = Number(nettoye);
  return Number.isFinite(n) ? n : null;
}

/** Quantité d'une saisie : la grille de tailles fait foi dès qu'elle est
 * remplie, la quantité globale ne sert que sans grille. */
export function quantiteSaisie(tailles: string | null | undefined, qteGlobale: string | null | undefined): number {
  let total = 0;
  if (tailles) {
    try {
      const arr = JSON.parse(tailles) as { qte?: number }[];
      if (Array.isArray(arr)) total = arr.reduce((s, t) => s + (Number(t?.qte) || 0), 0);
    } catch {
      total = 0;
    }
  }
  if (total > 0) return total;
  return Math.max(0, Math.round(montantSaisi(qteGlobale) ?? 0));
}

export type SaisieCommande = {
  faconnier?: string | null;
  chaineId?: string | null;
  prixVente?: string | null;
  prixFacon?: string | null;
  tailles?: string | null;
  qte?: string | null;
};

export type ApercuCommande = {
  interne: boolean;
  qte: number;
  prixVente: number;
  prixFacon: number;
  margeUnitaire: number;
  margeTotale: number;
  ca: number;
  tauxPct: number;
  /** Rien à afficher tant qu'aucun prix n'est saisi. */
  vide: boolean;
};

/** Ce que la commande en cours de saisie vaudra une fois enregistrée.
 *
 * La règle DBS s'applique ici comme à l'enregistrement : en interne, le prix
 * façon suit le prix de vente et la marge est donc nulle. DBS n'achète pas sa
 * propre façon — lui prêter une marge de sous-traitance gonflerait la marge
 * globale d'un montant qui n'existe pas. */
export function apercuCommande(s: SaisieCommande): ApercuCommande {
  const interne = !estSousTraitee({ faconnier: s.faconnier, chaineId: s.chaineId ? 1 : null });
  const prixVente = montantSaisi(s.prixVente) ?? 0;
  const prixFacon = interne ? prixVente : montantSaisi(s.prixFacon) ?? 0;
  const qte = quantiteSaisie(s.tailles, s.qte);
  const mu = centimes(prixVente - prixFacon);
  const ca = centimes(prixVente * qte);
  return {
    interne,
    qte,
    prixVente,
    prixFacon,
    margeUnitaire: mu,
    margeTotale: centimes(mu * qte),
    ca,
    tauxPct: prixVente > 0 ? Math.round((mu / prixVente) * 100) : 0,
    vide: prixVente === 0 && prixFacon === 0,
  };
}

/* ─────────── tri du carnet de commandes ─────────── */

export const CLES_TRI = ["of", "client", "modele", "qte", "tissu", "export", "livraison"] as const;
export type CleTri = (typeof CLES_TRI)[number];

export const LIBELLES_TRI: Record<CleTri, string> = {
  of: "N° OF",
  client: "Client",
  modele: "Modèle",
  qte: "Qté",
  tissu: "Réception tissu",
  export: "Date d'export",
  livraison: "Date de livraison",
};

const CLES_DATE: ReadonlySet<CleTri> = new Set<CleTri>(["tissu", "export", "livraison"]);

/** Ramène une date à AAAA-MM-JJ, quel que soit le format saisi.
 *
 * Les fiches anciennes portent du JJ/MM/AAAA là où le reste de la base est en
 * ISO. Sans cette normalisation, une seule date au format français suffit à
 * fausser tout le tri : comparée en texte, « 27/06/2026 » passe avant
 * « 2026-01-05 ». */
export function cleDate(v: string | null | undefined): string {
  const s = String(v ?? "").trim();
  if (!s) return "";
  const fr = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  const iso = s.match(/^(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`;
  return s;
}

/** Ce que le tri lit sur une ligne — le sous-ensemble qui l'intéresse. */
export type CommandeTriable = {
  of: string;
  client: string;
  modele: string;
  qte: number;
  receptTissu: string | null;
  dateExport: string | null;
  dateLivraison: string | null;
};

function valeurTri(c: CommandeTriable, cle: CleTri): string | number {
  switch (cle) {
    case "of":
      return c.of ?? "";
    case "client":
      return c.client ?? "";
    case "modele":
      return c.modele ?? "";
    case "qte":
      return c.qte || 0;
    case "tissu":
      return cleDate(c.receptTissu);
    case "livraison":
      return cleDate(c.dateLivraison);
    default:
      return cleDate(c.dateExport);
  }
}

/** Trie le carnet sans jamais remonter les lignes vides.
 *
 * Une commande sans date d'export n'a pas d'échéance connue : elle ne doit
 * jamais passer devant celles qui en ont une, quel que soit le sens du tri.
 * Elle reste donc en fin de liste dans les deux sens. */
export function trierCommandes<T extends CommandeTriable>(liste: T[], cle: CleTri, sens: 1 | -1): T[] {
  const estDate = CLES_DATE.has(cle);
  return liste.slice().sort((a, b) => {
    const x = valeurTri(a, cle);
    const y = valeurTri(b, cle);
    const xVide = x === "" || (cle !== "qte" && x === 0);
    const yVide = y === "" || (cle !== "qte" && y === 0);
    if (xVide && yVide) return 0;
    if (xVide) return 1;
    if (yVide) return -1;
    if (typeof x === "number" && typeof y === "number") return (x - y) * sens;
    // Dates déjà normalisées : comparaison texte pure. Le mode « numeric »
    // lirait « 27/06 » comme le nombre 27 et le placerait avant l'année 2026.
    if (estDate) return (x < y ? -1 : x > y ? 1 : 0) * sens;
    return String(x).localeCompare(String(y), "fr", { numeric: true }) * sens;
  });
}

/* ─────────── matching (facturation ↔ commandes) ─────────── */

/** The key PilotPro's rapprochement uses to tie an invoice line to a commande:
 * client, modèle and article reference, all normalised. */
export function cleRapprochement(client: string, modele: string, ref: string): string {
  const n = (v: string | null | undefined) =>
    String(v ?? "")
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ");
  return `${n(client)}|${n(modele)}|${n(ref)}`;
}

/** Loose equality for names typed by different people (accents, case, spacing). */
export function normaliserNom(s: string | null | undefined): string {
  return String(s ?? "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ");
}

/** Slug used as the client's stable business key ("GÉRARD DAREL" → gerard_darel). */
export function slugClient(nom: string): string {
  return (
    normaliserNom(nom)
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "") || "client"
  );
}
