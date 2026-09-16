import type { Tone } from "@/components/shared/status-badge";
import { besoinTissu, chuteEffective, joursJusqua, type CommandeFacts } from "./commande";

/* La règle de lancement, portée de PilotPro (dtFeux / dtPret / dtStatut).
 *
 *   Une commande ne part en coupe ou en sous-traitance que si les cinq feux
 *   bloquants sont verts : tête de série OK production, patronage, tracés,
 *   tissu conforme et fournitures complètes.
 *
 * La nomenclature est un sixième feu, indicatif : elle ne bloque pas, mais sans
 * elle le magasin tissu ne peut pas vérifier ses quantités.
 *
 * Tout est pur — aucun état n'est stocké, tout se recalcule à la lecture. */

export type DomainePrepa = "tds" | "modelisme" | "nomen" | "tissu" | "four" | "lancement";

export const DOMAINE_LABEL: Record<DomainePrepa, string> = {
  tds: "Tête de série",
  tissu: "Magasin tissu",
  four: "Magasin fournitures",
  modelisme: "Bureau modélisme",
  nomen: "Nomenclature",
  lancement: "Lancement",
};

/* ─────────── état élémentaire ─────────── */

export type KindFeu = "ok" | "warn" | "ko" | "wait";
export type EtatFeu = { kind: KindFeu; label: string; tone: Tone };

const TONE_PAR_KIND: Record<KindFeu, Tone> = {
  ok: "success",
  warn: "warning",
  ko: "danger",
  wait: "neutral",
};
const etat = (kind: KindFeu, label: string): EtatFeu => ({ kind, label, tone: TONE_PAR_KIND[kind] });

/* ─────────── entrées ─────────── */

export type VerdictTds = "attente" | "ok" | "refus";
export type Tds = { id: number; n: number; envoi: string | null; retour: string | null; verdict: string; commentaire: string; par: string };
export type Etape = { etape: string; fait: boolean; date: string | null; par: string };
export type LigneFourniture = { id: number; designation: string; qtePrevue: number; qteRecue: number; unite: string };
/** Une matière reçue d'une commande : nom, référence, laize (cm), métrages et contrôle. */
export type LigneTissu = {
  id: number;
  nom: string;
  reference: string;
  couleur: string;
  laize: number | null;
  metragePrevu: number;
  metrageRecu: number;
  controle: string;
  note: string;
};
export type Lancement = {
  date: string;
  mode: "interne" | "soustraitance" | string;
  par: string;
  derogationMotif: string | null;
  derogationPar: string | null;
  derogationDate: string | null;
  derogationManques: string[];
};

/** Tout ce qu'il faut pour juger une commande. */
export type ContextePrepa = {
  commande: CommandeFacts & { statutGlobalFournitures: string };
  tds: Tds[];
  etapes: Etape[];
  fournitures: LigneFourniture[];
  /** Matières reçues, une par tissu. Dès qu'une ligne existe, elle fait foi
   * pour le feu tissu, comme le détail fournitures. Vide = ancien mode mono
   * (champs `tissuRecu`/`tissuControle` de la commande). */
  tissuLignes?: LigneTissu[];
  lancement: Lancement | null;
  chuteDefaut: number;
};

/* ─────────── tête de série ─────────── */

export const derniereTds = (tds: Tds[]): Tds | null =>
  tds.length ? tds.reduce((a, b) => (b.n > a.n ? b : a)) : null;

/** Une seule TDS validée suffit : le modèle reste OK production ensuite. */
export const estOkPro = (tds: Tds[]) => tds.some((t) => t.verdict === "ok");

/** Référence de la TDS qui a donné l'OK production ("TDS2"). */
export function referenceOkPro(tds: Tds[]): string {
  const ok = tds.filter((t) => t.verdict === "ok").sort((a, b) => a.n - b.n)[0];
  return ok ? `TDS${ok.n}` : "";
}

export function etatTds(tds: Tds[]): EtatFeu {
  if (estOkPro(tds)) return etat("ok", "OK Production");
  const last = derniereTds(tds);
  if (!last) return etat("wait", "Aucune TDS");
  return etat("warn", `TDS${last.n} — ${last.verdict === "refus" ? "refusée" : "en attente client"}`);
}

/* ─────────── tissu ─────────── */

/** Feu tissu à partir du détail par matière : toutes conformes → vert ; une
 * refusée → rouge ; reçues mais pas toutes contrôlées → orange ; rien reçu →
 * attente. Une matière « sous réserve » vaut acceptée (elle libère la coupe),
 * mais tant qu'il en reste une non contrôlée le feu reste orange. */
export function etatTissuLignes(lignes: LigneTissu[]): EtatFeu {
  const n = lignes.length;
  if (lignes.some((l) => l.controle === "refuse")) return etat("ko", "Une matière refusée");
  const acceptee = (l: LigneTissu) => l.controle === "conforme" || l.controle === "reserve";
  if (lignes.every(acceptee)) {
    const sousReserve = lignes.some((l) => l.controle === "reserve");
    return etat("ok", sousReserve ? `Acceptées (${n} matières)` : `Conformes (${n} matières)`);
  }
  const recu = lignes.some((l) => !!l.metrageRecu || acceptee(l));
  if (!recu) return etat("wait", `Aucune reçue (${n} matières)`);
  const aControler = lignes.filter((l) => !acceptee(l)).length;
  return etat("warn", `${aControler}/${n} matière(s) à contrôler`);
}

export function etatTissu(c: ContextePrepa["commande"], lignes?: LigneTissu[]): EtatFeu {
  if (lignes && lignes.length) return etatTissuLignes(lignes);
  const controle = c.tissuControle ?? "";
  if (controle === "refuse") return etat("ko", "Refusé");
  if (controle === "conforme") return etat("ok", "Conforme");
  if (controle === "reserve") return etat("warn", "Sous réserve");
  const recu = !!c.tissuDateReelle || (c.tissuRecu ?? 0) > 0;
  if (recu) return etat("warn", "Reçu, à contrôler");
  if (c.receptTissu) return etat("wait", `Attendu ${c.receptTissu}`);
  return etat("wait", "Non reçu");
}

/** Le tissu libère la coupe quand il est accepté. En mode détail : toutes les
 * matières acceptées (conforme ou sous réserve) et aucune refusée. */
export function tissuLibereParLignes(lignes: LigneTissu[]): boolean {
  if (!lignes.length) return false;
  return lignes.every((l) => l.controle === "conforme" || l.controle === "reserve");
}

/* ─────────── fournitures ─────────── */

/** Dès qu'une ligne de détail existe, elle fait foi et le statut global est ignoré. */
export function etatFournitures(lignes: LigneFourniture[], statutGlobal: string): EtatFeu {
  if (lignes.length) {
    const manquantes = lignes.filter((l) => l.qteRecue < l.qtePrevue);
    if (!manquantes.length) return etat("ok", `Complètes (${lignes.length} réf.)`);
    if (!lignes.some((l) => l.qteRecue > 0)) return etat("wait", `Aucune reçue (${lignes.length} réf.)`);
    return etat("warn", `${manquantes.length}/${lignes.length} réf. manquantes`);
  }
  if (statutGlobal === "complet") return etat("ok", "Complètes");
  if (statutGlobal === "partiel") return etat("warn", "Partielles");
  return etat("wait", "En attente");
}

/* ─────────── modélisme ─────────── */

export const trouverEtape = (etapes: Etape[], nom: string) => etapes.find((e) => e.etape === nom) ?? null;

export function etatEtape(etapes: Etape[], nom: string): EtatFeu {
  const e = trouverEtape(etapes, nom);
  if (e?.fait) return etat("ok", `Fait${e.date ? ` le ${e.date}` : ""}`);
  return etat("wait", "À faire");
}

/* ─────────── nomenclature ─────────── */

export function etatNomenclature(c: CommandeFacts): EtatFeu {
  const conso = c.consoTheo ?? 0;
  return conso > 0 ? etat("ok", `${conso.toFixed(3)} m/pc`) : etat("wait", "Non saisie");
}

/* ─────────── les six feux ─────────── */

export type Feu = {
  id: "tds" | "patronage" | "traces" | "tissu" | "four" | "nomen";
  domaine: DomainePrepa;
  label: string;
  icone: string;
  bloquant: boolean;
  /** Écran qui alimente ce feu — sert de lien depuis la fiche. */
  ecran: string;
  etat: EtatFeu;
};

export function feux(ctx: ContextePrepa): Feu[] {
  return [
    { id: "tds", domaine: "tds", label: "Tête de série", icone: "🧵", bloquant: true, ecran: "/dt", etat: etatTds(ctx.tds) },
    { id: "patronage", domaine: "modelisme", label: "Patronage modéliste", icone: "📐", bloquant: true, ecran: "/modelisme", etat: etatEtape(ctx.etapes, "patronage") },
    { id: "traces", domaine: "modelisme", label: "Tirage des tracés", icone: "🖨", bloquant: true, ecran: "/modelisme", etat: etatEtape(ctx.etapes, "traces") },
    { id: "tissu", domaine: "tissu", label: "Tissu", icone: "🧶", bloquant: true, ecran: "/magtissu", etat: etatTissu(ctx.commande, ctx.tissuLignes) },
    { id: "four", domaine: "four", label: "Fournitures", icone: "🔩", bloquant: true, ecran: "/magfour", etat: etatFournitures(ctx.fournitures, ctx.commande.statutGlobalFournitures) },
    { id: "nomen", domaine: "nomen", label: "Nomenclature", icone: "📋", bloquant: false, ecran: "/nomen", etat: etatNomenclature(ctx.commande) },
  ];
}

export const bloquants = (ctx: ContextePrepa) => feux(ctx).filter((f) => f.bloquant && f.etat.kind !== "ok");

/** La règle : tous les feux bloquants au vert. */
export const estPret = (ctx: ContextePrepa) => bloquants(ctx).length === 0;

export const estLancee = (ctx: ContextePrepa) => ctx.lancement !== null;

/* ─────────── statut de préparation ─────────── */

export type KindStatutPrepa = "tds" | "attente" | "pret" | "lance";
export type StatutPrepa = { kind: KindStatutPrepa; label: string; tone: Tone; detail: string };

export function statutPreparation(ctx: ContextePrepa): StatutPrepa {
  const l = ctx.lancement;
  if (l) {
    const mode = l.mode === "soustraitance" ? "Sous-traitance" : "Coupe interne";
    return { kind: "lance", label: "Lancée", tone: "success", detail: `${mode} · ${l.date}` };
  }
  if (estPret(ctx)) return { kind: "pret", label: "Prête à lancer", tone: "brand", detail: "Tous les feux sont verts" };

  const nb = bloquants(ctx).length;
  const points = `${nb} point${nb > 1 ? "s" : ""} bloquant${nb > 1 ? "s" : ""}`;
  if (!estOkPro(ctx.tds)) return { kind: "tds", label: "Tête de série", tone: "warning", detail: points };
  return { kind: "attente", label: "En préparation", tone: "warning", detail: points };
}

/** Ordre de tri de la liste DT : ce qui est le plus loin du lancement d'abord. */
const RANG_STATUT: Record<KindStatutPrepa, number> = { tds: 0, attente: 1, pret: 2, lance: 3 };
export const rangStatut = (s: StatutPrepa) => RANG_STATUT[s.kind];

/* ─────────── écarts tissu (partagés magtissu / nomenclature) ─────────── */

/** Réception prévue dépassée alors que rien n'est arrivé. */
export function receptionEnRetard(c: ContextePrepa["commande"], now = new Date()): number | null {
  if (!c.receptTissu || c.tissuDateReelle) return null;
  const j = joursJusqua(c.receptTissu, now);
  return j !== null && j < 0 ? j : null;
}

/** Écart en pourcentage entre consommation théorique et réelle. */
export function ecartConsommationPct(c: CommandeFacts): number | null {
  const t = c.consoTheo ?? 0;
  const r = c.consoReel ?? 0;
  if (t <= 0 || r <= 0) return null;
  return ((r - t) / t) * 100;
}

export const ecartConsommationImportant = (c: CommandeFacts) => {
  const e = ecartConsommationPct(c);
  return e !== null && Math.abs(e) > 5;
};

/** Détail lisible du besoin théorique, pour la fiche magasin tissu. */
export function detailBesoinTissu(c: ContextePrepa["commande"], chuteDefaut: number) {
  return {
    besoin: besoinTissu(c, chuteDefaut),
    consoTheo: c.consoTheo ?? 0,
    chute: chuteEffective(c, chuteDefaut),
    qte: c.qte,
    recu: c.tissuRecu ?? 0,
  };
}

/* ─────────── droits d'écriture par métier ───────────
 * L'accès à l'écran vient de la matrice de permissions (role_permission) ;
 * ces règles-ci donnent le droit de MODIFIER. Un magasinier peut donc consulter
 * la direction technique sans toucher aux têtes de série. */

export type DomaineDroit = DomainePrepa | "derogation";

export const DROITS_PREPA: Record<DomaineDroit, string[]> = {
  tds: ["admin", "resp", "chef"],
  lancement: ["admin", "resp", "chef"],
  derogation: ["admin", "resp"],
  tissu: ["admin", "resp", "chef", "magasin", "magtissu"],
  four: ["admin", "resp", "chef", "magasin", "magfour"],
  modelisme: ["admin", "resp", "chef", "modeliste"],
  nomen: ["admin", "resp", "chef", "modeliste"],
};

export function peutModifier(domaine: DomaineDroit, role: string | null | undefined): boolean {
  if (!role) return false;
  if (role === "admin") return true;
  return DROITS_PREPA[domaine]?.includes(role) ?? false;
}

/** Carte complète des droits, calculée une fois et passée aux écrans. */
export function droitsDe(role: string | null | undefined): Record<DomaineDroit, boolean> {
  const out = {} as Record<DomaineDroit, boolean>;
  for (const d of Object.keys(DROITS_PREPA) as DomaineDroit[]) out[d] = peutModifier(d, role);
  return out;
}

/** Qui renseigne quoi — utilisé par le bandeau « lecture seule ». */
export const RESPONSABLE_DOMAINE: Record<DomaineDroit, string> = {
  tds: "la direction technique",
  lancement: "la direction technique",
  derogation: "un administrateur ou un responsable",
  tissu: "le magasin tissu",
  four: "le magasin fournitures",
  modelisme: "le bureau modélisme",
  nomen: "le bureau modélisme",
};
