import "server-only";
import {
  facturationMensuelle,
  margesFaconniers,
  repartitionProduction,
  type LigneCoutee,
  type MargesFaconniers,
  type PointFacturation,
  type RepartitionProduction,
} from "@/lib/domain/graphiques";
import { getCostLines } from "@/lib/services/facturation";
import { listGammes } from "@/lib/services/modules";
import { listCommandesAval } from "@/lib/services/aval";
import { listCommandes } from "@/lib/services/commandes";
import { listPreparation } from "@/lib/services/preparation";
import { getFactures } from "@/lib/services/facturation";
import { getChaines, getJournees, getModeles } from "@/lib/services/gpao";
import type { Tone } from "@/components/shared/status-badge";

const WEEKDAY_FR = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export type CockpitData = {
  pipeline: { commandes: number; matieres: number; prepa: number; production: number; magasin: number };
  insights: { tone: string; text: string; href: string }[];
  kpis: { caEnCours: number; margeBrute: number; margePct: number; facture: number; nbFactures: number; enRetard: number };
  nbCommandes: number;
  nbFacturesActives: number;
  chains: { nom: string; spec: string; ouv: number; pcs: number; rend: number; color: string }[];
  week: { d: string; iso: string; v: number }[];
};

export async function getCockpitData(): Promise<CockpitData> {
  const [commandes, prepa, gammes, magasin, factures, chaines, journees, modeles] =
    await Promise.all([
      listCommandes(),
      listPreparation(),
      listGammes(),
      listCommandesAval({ archived: false }),
      getFactures(),
      getChaines(),
      getJournees(),
      getModeles(),
    ]);

  const actives = commandes.filter((c) => c.statutKey !== "livree");

  // Le pipeline lit désormais les feux : « matières » = tissu pas encore
  // conforme, « prépa » = tête de série pas encore OK production.
  const feu = (r: (typeof prepa)[number], id: string) => r.feux.find((f) => f.id === id)!;
  const tissusPending = prepa.filter((r) => !r.lancee && feu(r, "tissu").etat.kind !== "ok");
  const beNoOk = prepa.filter((r) => !r.lancee && !r.okPro);
  const pretes = prepa.filter((r) => r.pret && !r.lancee);
  const late = commandes.filter((c) => c.statutKey === "retard");
  const unassigned = commandes.filter((c) => !c.assigne);

  const gammeModeles = new Set(gammes.map((g) => g.modele.trim().toLowerCase()));
  const noSam = [...new Set(commandes.map((c) => c.modele.trim().toLowerCase()))].filter(
    (m) => m && !gammeModeles.has(m),
  );

  const caEnCours = actives.reduce((s, c) => s + c.ca, 0);
  const margeBrute = commandes.reduce((s, c) => s + c.margeTotale, 0);
  const factureNet = factures.reduce(
    (s, f) => s + (f.type === "avoir" ? -f.total : f.type === "proforma" ? 0 : f.total),
    0,
  );
  const nbFactures = factures.filter((f) => f.type === "facture").length;

  // GPAO chains: latest journée per chaîne → pieces + rendement (mirrors store.ts).
  const modeleSam = new Map(modeles.map((m) => [m.id, m.sam]));
  const latestByChaine = new Map<number, (typeof journees)[number]>();
  for (const j of journees) {
    const prev = latestByChaine.get(j.chaineId);
    if (!prev || j.date > prev.date) latestByChaine.set(j.chaineId, j);
  }
  const STAGE_COLORS = ["var(--s1)", "var(--s2)", "var(--s4)", "var(--s3)", "var(--s5)"];
  const chains = chaines.map((c, i) => {
    const j = latestByChaine.get(c.id);
    let pcs = 0;
    let rend = 0;
    if (j) {
      for (const col of j.cols) {
        const v = (j.sortie as Record<string, number>)[col];
        if (typeof v === "number") pcs += v;
      }
      const sam = modeleSam.get(j.modeleId) ?? 0;
      const dispo = j.effectif * j.nbHeures * 3600;
      rend = dispo > 0 ? Math.round(((pcs * sam) / dispo) * 100) : 0;
    }
    return { nom: c.nom, spec: c.chef || "—", ouv: c.ouvrieres.length, pcs, rend, color: STAGE_COLORS[i % STAGE_COLORS.length] };
  });

  // Production over the last 7 days from GPAO journées' sortie totals.
  const today = new Date();
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(today);
    d.setDate(today.getDate() - (6 - k));
    const iso = d.toISOString().slice(0, 10);
    let v = 0;
    for (const j of journees) {
      if (j.date !== iso) continue;
      for (const col of j.cols) {
        const val = (j.sortie as Record<string, number>)[col];
        if (typeof val === "number") v += val;
      }
    }
    return { d: WEEKDAY_FR[d.getDay()], iso, v };
  });

  return {
    pipeline: {
      commandes: actives.length,
      matieres: tissusPending.length,
      prepa: beNoOk.length,
      production: prepa.filter((r) => r.lancee).length,
      magasin: magasin.filter((m) => m.magasinQte > 0 && !m.magasinExpedie).length,
    },
    insights: [
      late.length && { tone: "danger", text: `${late.length} commande(s) en retard de livraison`, href: "/commandes" },
      unassigned.length && { tone: "warning", text: `${unassigned.length} commande(s) non assignées (chaîne/façonnier)`, href: "/commandes" },
      pretes.length && { tone: "success", text: `${pretes.length} commande(s) prête(s) à lancer — tous les feux au vert`, href: "/dt" },
      tissusPending.length && { tone: "stage-2", text: `${tissusPending.length} tissu(s) non conforme(s) ou en attente de contrôle`, href: "/magtissu" },
      beNoOk.length && { tone: "stage-3", text: `${beNoOk.length} tête(s) de série en attente OK PRO client`, href: "/dt" },
      noSam.length && { tone: "purple", text: `${noSam.length} modèle(s) sans gamme SAM définie`, href: "/gammes" },
    ].filter(Boolean) as CockpitData["insights"],
    kpis: {
      caEnCours,
      margeBrute,
      margePct: caEnCours > 0 ? Math.round((margeBrute / caEnCours) * 100) : 0,
      facture: factureNet,
      nbFactures,
      enRetard: late.length,
    },
    nbCommandes: actives.length,
    nbFacturesActives: nbFactures,
    chains,
    week,
  };
}

/* ─────────── Computed alertes (replaces the static seeded rows) ─────────── */
export type AlertItem = {
  iconName: string;
  tone: Tone;
  title: string;
  detail: string;
  level: [Tone, string];
};

export type AlertesData = { alerts: AlertItem[]; total: number; critiques: number; avertissements: number };

const MARGE_MINI = 0.15; // marge brute < 15 % du CA ligne → alerte

export async function getAlertes(): Promise<AlertesData> {
  const [commandes, prepa, gammes, magasin] = await Promise.all([
    listCommandes(),
    listPreparation(),
    listGammes(),
    listCommandesAval({ archived: false }),
  ]);

  const alerts: AlertItem[] = [];

  for (const c of commandes) {
    if (c.statutKey === "retard") {
      alerts.push({
        iconName: "TriangleAlert",
        tone: "danger",
        title: `Retard livraison — ${c.of}`,
        detail: `${c.client} · ${c.modele} · ${c.retard[1]}`,
        level: ["danger", "Critique"],
      });
    }
  }

  /* Les alertes matières et TDS viennent maintenant des feux : une commande
   * déjà lancée ne remonte plus, et une réception dont la date est dépassée
   * devient visible — ce que les tables d'affichage ne savaient pas faire. */
  for (const r of prepa) {
    if (r.lancee) continue;
    const tissu = r.feux.find((f) => f.id === "tissu")!;
    if (tissu.etat.kind === "ko") {
      alerts.push({
        iconName: "Layers",
        tone: "danger",
        title: `Tissu refusé — ${r.of}`,
        detail: `${r.modele} · ${r.couleur || r.client}`,
        level: ["danger", "Critique"],
      });
    } else if (tissu.etat.kind !== "ok") {
      alerts.push({
        iconName: "Layers",
        tone: "warning",
        title: `Tissu — ${r.of}`,
        detail: `${r.modele} · ${tissu.etat.label}`,
        level: ["warning", "À vérifier"],
      });
    }
    if (r.joursRetardReception != null) {
      alerts.push({
        iconName: "Clock",
        tone: "danger",
        title: `Réception tissu en retard — ${r.of}`,
        detail: `${r.modele} · prévue le ${r.receptTissu}, ${Math.abs(r.joursRetardReception)} j de retard`,
        level: ["danger", "Critique"],
      });
    }
    if (r.ecartTissu != null && r.ecartTissu < 0) {
      alerts.push({
        iconName: "AlertCircle",
        tone: "danger",
        title: `Métrage insuffisant — ${r.of}`,
        detail: `${r.modele} · manque ${Math.abs(r.ecartTissu).toFixed(1)} m sur ${r.besoinTissu.toFixed(1)} m`,
        level: ["danger", "Critique"],
      });
    }

    const four = r.feux.find((f) => f.id === "four")!;
    if (four.etat.kind !== "ok") {
      alerts.push({
        iconName: "Boxes",
        tone: "warning",
        title: `Fournitures — ${r.of}`,
        detail: `${r.modele} · ${four.etat.label}`,
        level: ["warning", "À vérifier"],
      });
    }

    if (!r.okPro) {
      const derniere = r.tds.at(-1);
      alerts.push({
        iconName: "PencilRuler",
        tone: "warning",
        title: derniere
          ? `TDS${derniere.n} ${derniere.verdict === "refus" ? "refusée" : "en attente client"} — ${r.of}`
          : `Tête de série à lancer — ${r.of}`,
        detail: `${r.modele} · ${r.client}`,
        level: ["warning", derniere?.verdict === "refus" ? "À relancer" : "À suivre"],
      });
    }
  }

  // Une dérogation reste signalée après le lancement : c'est une dette de
  // conformité, pas un incident passé.
  for (const r of prepa) {
    if (r.lancement?.derogationMotif) {
      alerts.push({
        iconName: "TriangleAlert",
        tone: "danger",
        title: `Lancée par dérogation — ${r.of}`,
        detail: `${r.modele} · ${r.lancement.derogationManques.join(" · ") || r.lancement.derogationMotif}`,
        level: ["danger", "Conformité"],
      });
    }
  }

  for (const c of commandes) {
    if (!c.assigne) {
      alerts.push({
        iconName: "Clock",
        tone: "warning",
        title: `Commande non assignée — ${c.of}`,
        detail: `${c.client} · ${c.modele}`,
        level: ["warning", "À planifier"],
      });
    }
    if (c.margeUnitaire < 0) {
      alerts.push({
        iconName: "Euro",
        tone: "danger",
        title: `Marge négative — ${c.of}`,
        detail: `${c.client} · ${c.modele} · ${c.margeUnitaire.toFixed(2)} €/pcs`,
        level: ["danger", "Critique"],
      });
    } else if (c.ca > 0 && c.margePct < MARGE_MINI * 100) {
      alerts.push({
        iconName: "Euro",
        tone: "warning",
        title: `Marge faible — ${c.of}`,
        detail: `${c.client} · ${Math.round(c.margePct)}% du CA`,
        level: ["warning", "Surveiller"],
      });
    }
  }

  const gammeModeles = new Set(gammes.map((g) => g.modele.trim().toLowerCase()));
  for (const m of [...new Set(commandes.map((c) => c.modele))]) {
    if (m && !gammeModeles.has(m.trim().toLowerCase())) {
      alerts.push({
        iconName: "AlertCircle",
        tone: "warning",
        title: `Modèle sans gamme SAM — ${m}`,
        detail: "Décomposition opératoire à définir (Méthodes)",
        level: ["warning", "Méthodes"],
      });
    }
  }

  /* Le magasin remonte ce qui dort : un lot complet non expédié est du CA
   * immobilisé, et un lot préparé sans bon de livraison est un oubli. */
  for (const m of magasin) {
    if (m.magasinExpedie || m.magasinQte <= 0) continue;
    if (m.magasinQte >= m.qte) {
      alerts.push({
        iconName: "Truck",
        tone: "warning",
        title: `Lot complet à expédier — ${m.of}`,
        detail: `${m.client} · ${m.modele} · ${m.magasinQte} pcs au magasin`,
        level: ["warning", "À expédier"],
      });
    }
  }

  // Critiques first, then warnings.
  alerts.sort((a, b) => (a.level[0] === "danger" ? 0 : 1) - (b.level[0] === "danger" ? 0 : 1));

  const critiques = alerts.filter((a) => a.level[0] === "danger").length;
  return { alerts, total: alerts.length, critiques, avertissements: alerts.length - critiques };
}

export type StatsRow = {
  unite: string;
  cmd: number;
  pieces: number;
  produit: number;
  av: number;
  ca: number;
  marge: number;
};

/* ─────────── Séries pour les graphiques ─────────── */

const nombreOuNull = (v: string): number | null => {
  if (v === "" || v == null) return null;
  const n = parseFloat(String(v).replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

/**
 * Aplatit factures + annotations de coût en lignes exploitables par
 * `lib/domain/graphiques`. C'est la seule jointure : le domaine ne connaît
 * ni la base ni la forme des factures.
 */
export async function getLignesCoutees(): Promise<LigneCoutee[]> {
  const [factures, couts] = await Promise.all([getFactures(), getCostLines()]);
  const out: LigneCoutee[] = [];
  for (const f of factures) {
    const annotations = couts[`${f.id}|${f.type}`]?.lines ?? {};
    f.lignes.forEach((l, i) => {
      const c = annotations[i];
      out.push({
        date: f.date,
        type: f.type,
        qte: l.qte,
        mt: l.mt,
        pu: l.pu,
        lieu: c?.lieu ?? "",
        faconnier: c?.fac ?? "",
        // Convention de l'écran Factures : en interne le coût vaut le prix
        // facturé (marge nulle), la case n'étant pas saisissable.
        cout: c?.lieu === "interne" ? l.pu : nombreOuNull(c?.cout ?? ""),
      });
    });
  }
  return out;
}

export type GraphiquesFinance = { facturation: PointFacturation[]; marges: MargesFaconniers };

export async function getGraphiquesFinance(): Promise<GraphiquesFinance> {
  const lignes = await getLignesCoutees();
  return { facturation: facturationMensuelle(lignes), marges: margesFaconniers(lignes) };
}

export async function getStatsData(): Promise<{
  rows: StatsRow[];
  totals: { ca: number; marge: number; pieces: number };
  repartition: RepartitionProduction;
}> {
  const commandes = await listCommandes();
  const by = new Map<string, StatsRow>();
  for (const c of commandes) {
    const k = c.client || "—";
    const row = by.get(k) ?? { unite: k, cmd: 0, pieces: 0, produit: 0, av: 0, ca: 0, marge: 0 };
    row.cmd += 1;
    row.pieces += c.qte;
    row.produit += c.produit;
    row.ca += c.ca;
    row.marge += c.margeTotale;
    by.set(k, row);
  }
  const rows = [...by.values()]
    .map((r) => ({ ...r, av: r.pieces > 0 ? Math.round((r.produit / r.pieces) * 100) : 0 }))
    .sort((a, b) => b.ca - a.ca);
  const totals = rows.reduce(
    (t, r) => ({ ca: t.ca + r.ca, marge: t.marge + r.marge, pieces: t.pieces + r.pieces }),
    { ca: 0, marge: 0, pieces: 0 },
  );
  // La répartition ne porte que sur ce qui reste à produire : une commande
  // livrée n'occupe plus ni l'atelier ni un façonnier.
  const repartition = repartitionProduction(
    commandes.filter((c) => c.statutKey !== "livree").map((c) => ({ assigne: c.assigne ?? "", qte: c.qte })),
  );
  return { rows, totals, repartition };
}
