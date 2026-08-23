import { Boxes, ClipboardList, Landmark, Layers, PencilRuler, type LucideIcon } from "lucide-react";
import type { PreparationRow } from "@/lib/services/preparation";
import type { DomaineDroit } from "@/lib/domain/feux";

/* Les cinq écrans partagent la même mécanique — KPI, onglets, recherche,
 * tableau, fiche dépliante. Chacun ne fournit que sa configuration, comme le
 * dtDeclarer() de PilotPro. Tout est sérialisable : la page est un composant
 * serveur, seule la coquille est cliente. */

export type EcranId = "dt" | "modelisme" | "nomen" | "magtissu" | "magfour";

export type Onglet = {
  k: string;
  label: string;
  /** null = tout afficher */
  test: ((r: PreparationRow) => boolean) | null;
};

export type Kpi = { label: string; valeur: string | number; tone: KpiTone; icone: string; sub?: string };
export type KpiTone = "brand" | "success" | "warning" | "danger" | "purple" | "neutral";

export type ColonneAlign = "left" | "center" | "right";
export type Colonne = { titre: string; align?: ColonneAlign };

export type EcranConfig = {
  id: EcranId;
  icone: string;
  Icon: LucideIcon;
  titre: string;
  sous: string;
  aide: string;
  /** Domaine métier qui donne le droit d'écrire sur cet écran. */
  domaine: DomaineDroit;
  defaut: string;
  onglets: Onglet[];
  colonnes: Colonne[];
  kpis: (rows: PreparationRow[]) => Kpi[];
  tri?: (a: PreparationRow, b: PreparationRow) => number;
  /** Écran de matière : ce qui s'achète et se contrôle par RÉFÉRENCE, non par
   * OF. Un OF rattaché à un porteur n'y est ni compté ni proposé à la saisie —
   * son porteur répond du tissu et des fournitures de tout le groupe. Le
   * laisser dans les listes ferait saisir la même réception autant de fois
   * qu'il y a d'OF, ou l'oublier sur tous sauf un. Il reste consultable dans
   * l'onglet « Tout », avec le n° de celui qui le gère. */
  porteurSeul?: boolean;
};

const nb = new Intl.NumberFormat("fr-FR");

const aFaireModelisme = (r: PreparationRow) =>
  !r.lancee &&
  (r.etapes.find((e) => e.etape === "patronage")?.fait !== true ||
    r.etapes.find((e) => e.etape === "traces")?.fait !== true);

const etapeFaite = (r: PreparationRow, nom: string) => r.etapes.find((e) => e.etape === nom)?.fait === true;
const feuDe = (r: PreparationRow, id: string) => r.feux.find((f) => f.id === id)!;

/* ═══════════ 1/5 — DIRECTION TECHNIQUE ═══════════ */
const DT: EcranConfig = {
  id: "dt",
  Icon: Landmark,
  icone: "🏛",
  titre: "Direction Technique",
  sous: "Tête de série, OK production et feu vert de lancement",
  aide:
    "Règle de lancement — une commande ne part en coupe ou en sous-traitance que si les 5 feux bloquants sont verts : " +
    "tête de série OK production, patronage, tracés, tissu conforme et fournitures complètes. Les feux tissu, fournitures " +
    "et modélisme sont alimentés par les services concernés depuis leurs propres écrans.",
  domaine: "tds",
  defaut: "encours",
  onglets: [
    { k: "encours", label: "En cours", test: (r) => !r.lancee },
    { k: "atds", label: "TDS à lancer", test: (r) => !r.tds.length && !r.lancee },
    { k: "client", label: "Attente client", test: (r) => r.tds.at(-1)?.verdict === "attente" },
    { k: "refus", label: "TDS refusées", test: (r) => r.tds.at(-1)?.verdict === "refus" },
    { k: "pret", label: "Prêtes à lancer", test: (r) => r.pret && !r.lancee },
    { k: "lance", label: "Lancées", test: (r) => r.lancee },
    { k: "derog", label: "Dérogations", test: (r) => !!r.lancement?.derogationMotif },
    { k: "all", label: "Tout", test: null },
  ],
  colonnes: [
    { titre: "OF / Client" },
    { titre: "Modèle" },
    { titre: "Qté", align: "center" },
    { titre: "TDS", align: "center" },
    { titre: "Patron.", align: "center" },
    { titre: "Tracés", align: "center" },
    { titre: "Tissu", align: "center" },
    { titre: "Fourn.", align: "center" },
    { titre: "Nomen.", align: "center" },
    { titre: "Statut" },
    { titre: "Export" },
  ],
  tri: (a, b) => {
    const rang = { tds: 0, attente: 1, pret: 2, lance: 3 };
    const d = rang[a.statut.kind] - rang[b.statut.kind];
    return d !== 0 ? d : (a.dateExport || "9999").localeCompare(b.dateExport || "9999");
  },
  kpis: (rows) => {
    let tds = 0, prep = 0, pret = 0, lance = 0, derog = 0;
    for (const r of rows) {
      if (r.statut.kind === "lance") { lance++; if (r.lancement?.derogationMotif) derog++; }
      else if (r.statut.kind === "pret") pret++;
      else if (r.statut.kind === "tds") tds++;
      else prep++;
    }
    return [
      { label: "Tête de série à faire", valeur: tds, tone: "warning", icone: "🧵", sub: "pas encore OK production" },
      { label: "En préparation", valeur: prep, tone: "brand", icone: "⏳", sub: "OK PRO, matières incomplètes" },
      { label: "Prêtes à lancer", valeur: pret, tone: "success", icone: "✅", sub: "tous les feux au vert" },
      { label: "Lancées", valeur: lance, tone: "purple", icone: "🏭", sub: derog > 0 ? `${derog} par dérogation` : "aucune dérogation" },
    ];
  },
};

/* ═══════════ 2/5 — MAGASIN TISSU ═══════════ */
const MAGTISSU: EcranConfig = {
  id: "magtissu",
  Icon: Layers,
  icone: "🧶",
  titre: "Magasin Tissu",
  sous: "Réception, métrage et contrôle du tissu par commande",
  aide:
    "Saisissez la date de réception réelle et le métrage effectivement reçu, puis le résultat du contrôle. " +
    "Le besoin théorique affiché vient de la nomenclature saisie par les modélistes. Un tissu conforme ou accepté " +
    "sous réserve libère le feu tissu et débloque la commande côté direction technique.",
  domaine: "tissu",
  defaut: "arecevoir",
  porteurSeul: true,
  onglets: [
    { k: "arecevoir", label: "À recevoir", test: (r) => feuDe(r, "tissu").etat.kind === "wait" && !r.lancee },
    { k: "acontroler", label: "À contrôler", test: (r) => feuDe(r, "tissu").etat.label === "Reçu, à contrôler" },
    { k: "ecart", label: "Écart de métrage", test: (r) => r.ecartTissu != null && r.ecartTissu < 0 },
    { k: "conforme", label: "Conformes", test: (r) => r.tissuControle === "conforme" },
    { k: "refuse", label: "Refusés", test: (r) => r.tissuControle === "refuse" },
    { k: "all", label: "Tout", test: null },
  ],
  colonnes: [
    { titre: "OF / Client" },
    { titre: "Modèle" },
    { titre: "Qté", align: "center" },
    { titre: "Besoin théo.", align: "center" },
    { titre: "Prévu le" },
    { titre: "Reçu le" },
    { titre: "Métrage reçu", align: "center" },
    { titre: "Écart", align: "center" },
    { titre: "Contrôle" },
    { titre: "Bon", align: "center" },
  ],
  kpis: (rows) => {
    const att = rows.filter((r) => feuDe(r, "tissu").etat.kind === "wait" && !r.lancee).length;
    const ctl = rows.filter((r) => feuDe(r, "tissu").etat.label === "Reçu, à contrôler").length;
    const ecart = rows.filter((r) => r.ecartTissu != null && r.ecartTissu < 0).length;
    const ret = rows.filter((r) => r.joursRetardReception != null).length;
    return [
      { label: "En attente de réception", valeur: att, tone: "neutral", icone: "📥" },
      { label: "Reçus à contrôler", valeur: ctl, tone: "warning", icone: "🔎", sub: "contrôle qualité à faire" },
      { label: "Réceptions en retard", valeur: ret, tone: ret ? "danger" : "success", icone: "⏰", sub: "date prévue dépassée" },
      { label: "Métrage insuffisant", valeur: ecart, tone: ecart ? "danger" : "success", icone: "📏", sub: "reçu < besoin théorique" },
    ];
  },
};

/* ═══════════ 3/5 — MAGASIN FOURNITURES ═══════════ */
const MAGFOUR: EcranConfig = {
  id: "magfour",
  Icon: Boxes,
  icone: "🔩",
  titre: "Magasin Fournitures",
  sous: "Réception des fournitures par commande et par modèle",
  aide:
    "Renseignez un statut global pour aller vite, ou détaillez référence par référence (boutons, fermetures, " +
    "étiquettes, fil…) avec les quantités prévues et reçues. Dès qu'au moins une ligne de détail existe, c'est elle " +
    "qui pilote le feu et le statut global se verrouille.",
  domaine: "four",
  defaut: "encours",
  porteurSeul: true,
  onglets: [
    { k: "encours", label: "À réceptionner", test: (r) => feuDe(r, "four").etat.kind !== "ok" && !r.lancee },
    { k: "attente", label: "Aucune reçue", test: (r) => feuDe(r, "four").etat.kind === "wait" },
    { k: "partiel", label: "Partielles", test: (r) => feuDe(r, "four").etat.kind === "warn" },
    { k: "complet", label: "Complètes", test: (r) => feuDe(r, "four").etat.kind === "ok" },
    { k: "detail", label: "Suivies en détail", test: (r) => r.fournitures.length > 0 },
    { k: "all", label: "Tout", test: null },
  ],
  colonnes: [
    { titre: "OF / Client" },
    { titre: "Modèle" },
    { titre: "Qté", align: "center" },
    { titre: "Suivi" },
    { titre: "Références", align: "center" },
    { titre: "Reçues", align: "center" },
    { titre: "Manquantes", align: "center" },
    { titre: "Statut" },
  ],
  kpis: (rows) => {
    const att = rows.filter((r) => feuDe(r, "four").etat.kind === "wait" && !r.lancee).length;
    const par = rows.filter((r) => feuDe(r, "four").etat.kind === "warn").length;
    const complet = rows.filter((r) => feuDe(r, "four").etat.kind === "ok").length;
    let refs = 0, mq = 0;
    for (const r of rows) for (const l of r.fournitures) { refs++; if (l.qteRecue < l.qtePrevue) mq++; }
    return [
      { label: "Aucune fourniture reçue", valeur: att, tone: "neutral", icone: "📦" },
      { label: "Réceptions partielles", valeur: par, tone: "warning", icone: "⚠", sub: "il manque des références" },
      { label: "Commandes complètes", valeur: complet, tone: "success", icone: "✅" },
      { label: "Références manquantes", valeur: mq, tone: mq ? "danger" : "success", icone: "🔩", sub: `sur ${refs} références suivies` },
    ];
  },
};

/* ═══════════ 4/5 — BUREAU MODÉLISME ═══════════ */
const MODELISME: EcranConfig = {
  id: "modelisme",
  Icon: PencilRuler,
  icone: "📐",
  titre: "Bureau Modélisme",
  sous: "Patronage et tirage des tracés avant coupe",
  aide:
    "Validez le patronage puis le tirage des tracés pour chaque modèle. Ces deux étapes sont bloquantes : sans elles, " +
    "la direction technique ne peut pas lancer la commande en coupe. Chaque validation enregistre automatiquement " +
    "votre nom et la date.",
  domaine: "modelisme",
  defaut: "afaire",
  onglets: [
    { k: "afaire", label: "À faire", test: aFaireModelisme },
    { k: "okpro", label: "OK PRO à traiter", test: (r) => r.okPro && aFaireModelisme(r) },
    { k: "patron", label: "Patronage fait", test: (r) => etapeFaite(r, "patronage") },
    { k: "traces", label: "Tracés tirés", test: (r) => etapeFaite(r, "traces") },
    { k: "plan", label: "Plan à préparer", test: (r) => !r.parentId && !r.lancee && !r.plan },
    { k: "fini", label: "Terminés", test: (r) => etapeFaite(r, "patronage") && etapeFaite(r, "traces") },
    { k: "all", label: "Tout", test: null },
  ],
  colonnes: [
    { titre: "OF / Client" },
    { titre: "Modèle" },
    { titre: "Qté", align: "center" },
    { titre: "OK Production" },
    { titre: "Patronage" },
    { titre: "Tracés" },
    { titre: "Plan de coupe" },
    { titre: "Export" },
  ],
  kpis: (rows) => {
    const af = rows.filter(aFaireModelisme).length;
    const urg = rows.filter((r) => r.okPro && aFaireModelisme(r)).length;
    const p = rows.filter((r) => etapeFaite(r, "patronage")).length;
    const t = rows.filter((r) => etapeFaite(r, "traces")).length;
    const plans = rows.filter((r) => r.plan).length;
    const aConfirmer = rows.filter((r) => r.plan?.estime).length;
    return [
      { label: "Travail à faire", valeur: af, tone: "brand", icone: "📐" },
      { label: "Prioritaires", valeur: urg, tone: urg ? "danger" : "success", icone: "🔥", sub: "modèle déjà OK production" },
      { label: "Patronages faits", valeur: p, tone: "success", icone: "✏", sub: `${t} tracés tirés` },
      {
        label: "Plans de coupe",
        valeur: plans,
        tone: aConfirmer ? "warning" : "purple",
        icone: "📏",
        sub: aConfirmer ? `${aConfirmer} avec longueurs à confirmer` : "longueurs réelles saisies",
      },
    ];
  },
};

/* ═══════════ 5/5 — NOMENCLATURE ═══════════ */
const NOMEN: EcranConfig = {
  id: "nomen",
  Icon: ClipboardList,
  icone: "📋",
  titre: "Nomenclature",
  sous: "Consommations tissu et besoins par commande",
  aide:
    "La consommation théorique (m/pièce) et le taux de chute déterminent le besoin total en tissu, que le magasin " +
    "tissu compare au métrage reçu. La consommation réelle se saisit après coupe pour mesurer l'écart. Cette étape " +
    "ne bloque pas le lancement, mais sans elle le magasin ne peut pas vérifier ses quantités.",
  domaine: "nomen",
  defaut: "asaisir",
  onglets: [
    { k: "asaisir", label: "À saisir", test: (r) => (r.consoTheo ?? 0) <= 0 && !r.lancee },
    { k: "saisie", label: "Saisies", test: (r) => (r.consoTheo ?? 0) > 0 },
    { k: "reel", label: "Conso réelle", test: (r) => (r.consoReel ?? 0) > 0 },
    { k: "ecart", label: "Écart > 5 %", test: (r) => r.ecartConsoPct != null && Math.abs(r.ecartConsoPct) > 5 },
    { k: "all", label: "Tout", test: null },
  ],
  colonnes: [
    { titre: "OF / Client" },
    { titre: "Modèle" },
    { titre: "Qté", align: "center" },
    { titre: "Conso théo.", align: "center" },
    { titre: "Chute", align: "center" },
    { titre: "Besoin total", align: "center" },
    { titre: "Conso réelle", align: "center" },
    { titre: "Écart", align: "center" },
  ],
  kpis: (rows) => {
    const s = rows.filter((r) => (r.consoTheo ?? 0) <= 0 && !r.lancee).length;
    const okN = rows.filter((r) => (r.consoTheo ?? 0) > 0).length;
    const tot = rows.reduce((a, r) => a + r.besoinTissu, 0);
    const ec = rows.filter((r) => r.ecartConsoPct != null && Math.abs(r.ecartConsoPct) > 5).length;
    return [
      { label: "Nomenclatures à saisir", valeur: s, tone: s ? "warning" : "success", icone: "📋" },
      { label: "Nomenclatures saisies", valeur: okN, tone: "success", icone: "✅" },
      { label: "Besoin tissu total", valeur: `${nb.format(Math.round(tot))} m`, tone: "brand", icone: "🧶", sub: "toutes commandes actives" },
      { label: "Écarts > 5 %", valeur: ec, tone: ec ? "danger" : "success", icone: "📏", sub: "théorique vs réel" },
    ];
  },
};

export const ECRANS: Record<EcranId, EcranConfig> = {
  dt: DT,
  magtissu: MAGTISSU,
  magfour: MAGFOUR,
  modelisme: MODELISME,
  nomen: NOMEN,
};
