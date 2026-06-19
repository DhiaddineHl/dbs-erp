import "server-only";
import {
  listBe,
  listCommandes,
  listFournitures,
  listGammes,
  listMagasin,
  listTissus,
} from "@/lib/services/modules";
import { getFactures } from "@/lib/services/facturation";
import { getChaines, getJournees, getModeles } from "@/lib/services/gpao";
import type { Tone } from "@/components/shared/status-badge";

/** Parse a French-formatted amount ("10 680 €", "12,40 €", "25%") to a number. */
export function parseFr(s: string | null | undefined): number {
  if (!s) return 0;
  const cleaned = s
    .replace(/ | /g, " ") // narrow / non-breaking spaces
    .replace(/[€%a-zA-Z]/g, "")
    .replace(/\s/g, "")
    .replace(",", ".");
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

const WEEKDAY_FR = ["dim", "lun", "mar", "mer", "jeu", "ven", "sam"];

export type CockpitData = {
  pipeline: { commandes: number; matieres: number; prepa: number; production: number; magasin: number };
  insights: { tone: string; text: string; href: string }[];
  kpis: { caEnCours: number; margeBrute: number; margePct: number; facture: number; nbFactures: number; enRetard: number };
  nbCommandes: number;
  nbFacturesActives: number;
  chains: { nom: string; spec: string; ouv: number; pcs: number; rend: number; color: string }[];
  week: { d: string; v: number }[];
};

export async function getCockpitData(): Promise<CockpitData> {
  const [commandes, tissus, be, gammes, magasin, factures, chaines, journees, modeles] =
    await Promise.all([
      listCommandes(),
      listTissus(),
      listBe(),
      listGammes(),
      listMagasin(),
      getFactures(),
      getChaines(),
      getJournees(),
      getModeles(),
    ]);

  const livre = (label: string) => /livr|clôtur|cloture/i.test(label);
  const actives = commandes.filter((c) => !livre(c.statut[1]));

  const tissusPending = tissus.filter((t) => t.controle[0] !== "success");
  const beNoOk = be.filter((b) => !b.ok || b.ok === "—");
  const late = commandes.filter((c) => c.retard[0] === "danger");
  const unassigned = commandes.filter((c) => !c.assigne || c.assigne === "—");

  const gammeModeles = new Set(gammes.map((g) => g.modele.trim().toLowerCase()));
  const noSam = [...new Set(commandes.map((c) => c.modele.trim().toLowerCase()))].filter(
    (m) => m && !gammeModeles.has(m),
  );

  const caEnCours = actives.reduce((s, c) => s + parseFr(c.pv) * c.qte, 0);
  const margeBrute = commandes.reduce((s, c) => s + parseFr(c.marge), 0);
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
    return { d: WEEKDAY_FR[d.getDay()], v };
  });

  return {
    pipeline: {
      commandes: actives.length,
      matieres: tissusPending.length,
      prepa: beNoOk.length,
      production: commandes.filter((c) => c.av > 0 && c.av < 100).length,
      magasin: magasin.filter((m) => m.statut[1] !== "Expédié" && m.statut[0] !== "success").length,
    },
    insights: [
      late.length && { tone: "danger", text: `${late.length} commande(s) en retard de livraison`, href: "/commandes" },
      unassigned.length && { tone: "warning", text: `${unassigned.length} commande(s) non assignées (chaîne/façonnier)`, href: "/commandes" },
      tissusPending.length && { tone: "stage-2", text: `${tissusPending.length} tissu(s) en attente de contrôle`, href: "/tissus" },
      beNoOk.length && { tone: "stage-3", text: `${beNoOk.length} tête(s) de série en attente OK PRO client`, href: "/be" },
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
  const [commandes, tissus, fournitures, be, gammes, magasin] = await Promise.all([
    listCommandes(),
    listTissus(),
    listFournitures(),
    listBe(),
    listGammes(),
    listMagasin(),
  ]);

  const alerts: AlertItem[] = [];

  for (const c of commandes) {
    if (c.retard[0] === "danger") {
      alerts.push({
        iconName: "TriangleAlert",
        tone: "danger",
        title: `Retard livraison — ${c.of}`,
        detail: `${c.client} · ${c.modele} · ${c.retard[1]}`,
        level: ["danger", "Critique"],
      });
    }
  }

  for (const t of tissus) {
    if (t.controle[0] === "danger") {
      alerts.push({
        iconName: "Layers",
        tone: "danger",
        title: `Tissu non conforme — ${t.cmd}`,
        detail: `${t.design} · ${t.controle[1]}`,
        level: ["danger", "Critique"],
      });
    } else if (t.controle[0] !== "success") {
      alerts.push({
        iconName: "Layers",
        tone: "warning",
        title: `Tissu en attente de contrôle — ${t.cmd}`,
        detail: `${t.design} · ${t.controle[1]}`,
        level: ["warning", "À vérifier"],
      });
    }
  }

  for (const f of fournitures) {
    if (f.controle[0] !== "success") {
      alerts.push({
        iconName: "AlertCircle",
        tone: "warning",
        title: `Fourniture à contrôler — ${f.cmd}`,
        detail: `${f.type} · ${f.design}`,
        level: ["warning", "À vérifier"],
      });
    }
  }

  for (const b of be) {
    if (!b.ok || b.ok === "—") {
      alerts.push({
        iconName: "PencilRuler",
        tone: "warning",
        title: `OK PRO client en attente — ${b.of}`,
        detail: `${b.mc}`,
        level: ["warning", "À relancer"],
      });
    }
  }

  for (const c of commandes) {
    if (!c.assigne || c.assigne === "—") {
      alerts.push({
        iconName: "Clock",
        tone: "warning",
        title: `Commande non assignée — ${c.of}`,
        detail: `${c.client} · ${c.modele}`,
        level: ["warning", "À planifier"],
      });
    }
    const ca = parseFr(c.pv) * c.qte;
    const marge = parseFr(c.marge);
    if (ca > 0 && marge > 0 && marge / ca < MARGE_MINI) {
      alerts.push({
        iconName: "Euro",
        tone: "warning",
        title: `Marge faible — ${c.of}`,
        detail: `${c.client} · ${Math.round((marge / ca) * 100)}% du CA`,
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

  void magasin; // reserved for future "à expédier" alerts

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

export async function getStatsData(): Promise<{ rows: StatsRow[]; totals: { ca: number; marge: number; pieces: number } }> {
  const commandes = await listCommandes();
  const by = new Map<string, StatsRow>();
  for (const c of commandes) {
    const k = c.client || "—";
    const row = by.get(k) ?? { unite: k, cmd: 0, pieces: 0, produit: 0, av: 0, ca: 0, marge: 0 };
    row.cmd += 1;
    row.pieces += c.qte;
    row.produit += Math.round((c.qte * c.av) / 100);
    row.ca += parseFr(c.pv) * c.qte;
    row.marge += parseFr(c.marge);
    by.set(k, row);
  }
  const rows = [...by.values()]
    .map((r) => ({ ...r, av: r.pieces > 0 ? Math.round((r.produit / r.pieces) * 100) : 0 }))
    .sort((a, b) => b.ca - a.ca);
  const totals = rows.reduce(
    (t, r) => ({ ca: t.ca + r.ca, marge: t.marge + r.marge, pieces: t.pieces + r.pieces }),
    { ca: 0, marge: 0, pieces: 0 },
  );
  return { rows, totals };
}
