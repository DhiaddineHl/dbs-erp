import type { Tone } from "@/components/shared/status-badge";
import { actionOuverte, type StatutAction } from "./qc";

/* Actions qualité — UN seul registre.
 *
 * Avant, trois endroits notaient la même chose : les actions correctives du
 * contrôle qualité, les fiches QRQC et les « plans d'actions ». Les deux
 * derniers étaient des tableaux libres sans lien avec les commandes ni avec
 * les contrôles. Tout vit désormais dans `qc_action_corrective` :
 *
 *   - « qc »   : née d'un défaut relevé pendant un contrôle ;
 *   - « qrqc » : problème terrain (lot refusé, réclamation, dérive en chaîne),
 *                analysé en 5M ;
 *   - « plan » : action d'amélioration sans problème déclencheur.
 *
 * Même statut (À traiter → En cours → Corrigé → Vérifié → Clôturé), même
 * responsable, même échéance : un seul endroit à regarder le matin. */

export type OrigineAction = "qc" | "qrqc" | "plan";

export const ORIGINES_ACTION: { value: OrigineAction; label: string; court: string; tone: Tone }[] = [
  { value: "qc", label: "Contrôle qualité", court: "Contrôle", tone: "brand" },
  { value: "qrqc", label: "QRQC — problème terrain", court: "QRQC", tone: "danger" },
  { value: "plan", label: "Plan d'actions — amélioration", court: "Plan", tone: "info" },
];
export const origineAction = (v: string) => ORIGINES_ACTION.find((o) => o.value === v) ?? ORIGINES_ACTION[0];

export const CAUSES_5M = ["Main d'œuvre", "Machine", "Matière", "Méthode", "Milieu"] as const;

export type Priorite = "" | "haute" | "moyenne" | "basse";
export const PRIORITES: { value: Exclude<Priorite, "">; label: string; tone: Tone }[] = [
  { value: "haute", label: "Haute", tone: "danger" },
  { value: "moyenne", label: "Moyenne", tone: "warning" },
  { value: "basse", label: "Basse", tone: "neutral" },
];
const RANG_PRIORITE: Record<string, number> = { haute: 0, moyenne: 1, basse: 2, "": 3 };

const cle = (s: string) =>
  (s ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/œ/g, "oe")
    .replace(/[’`]/g, "'")
    .toLowerCase()
    .trim();

/** Codes utilisés par l'ancien PilotPro (« main_oeuvre », « matiere »…). */
const CODES_5M: Record<string, (typeof CAUSES_5M)[number]> = {
  main_oeuvre: "Main d'œuvre",
  "main oeuvre": "Main d'œuvre",
  "main-d'oeuvre": "Main d'œuvre",
  mo: "Main d'œuvre",
  machine: "Machine",
  matiere: "Matière",
  methode: "Méthode",
  milieu: "Milieu",
};

/** Rattache un texte libre à l'une des 5M (« main d'oeuvre », « MATIERE »…),
 * ou "" s'il n'en est pas une — c'est alors une cause rédigée, pas une famille. */
export function cause5mDepuisTexte(texte: string): string {
  const k = cle(texte);
  if (!k) return "";
  return CAUSES_5M.find((c) => cle(c) === k) ?? CODES_5M[k] ?? CODES_5M[k.replace(/_/g, " ")] ?? "";
}

/** Statut d'une ancienne fiche QRQC (Ouvert / En cours / Résolu). */
export function statutDepuisQrqc(label: string): StatutAction {
  const k = cle(label);
  if (k.startsWith("resolu")) return "cloture";
  if (k === "en cours") return "en_cours";
  return "a_traiter";
}

/** Statut d'une ancienne ligne de plan d'actions (À faire / En cours / En retard / Clôturée). */
export function statutDepuisPlan(label: string): StatutAction {
  const k = cle(label);
  if (k.startsWith("cloture")) return "cloture";
  if (k === "en cours") return "en_cours";
  return "a_traiter"; // « En retard » n'est pas un statut : c'est l'échéance qui le dit
}

export function prioriteDepuisLabel(label: string): Priorite {
  const k = cle(label);
  return (PRIORITES.find((p) => p.value === k)?.value ?? "") as Priorite;
}

/* ─────────── lecture ─────────── */

export type ActionResume = {
  id: number;
  statut: string;
  /** ISO "YYYY-MM-DD" ou "" */
  echeance: string;
  origine: string;
  cause5m: string;
  priorite: string;
};

export const enRetard = (a: Pick<ActionResume, "statut" | "echeance">, aujourdhui: string) =>
  actionOuverte(a.statut) && !!a.echeance && a.echeance < aujourdhui;

export type SyntheseActions = {
  total: number;
  ouvertes: number;
  enRetard: number;
  /** Ouvertes sans responsable ou sans échéance : personne ne les portera. */
  sansPilote: number;
  parOrigine: Record<OrigineAction, number>;
  /** Causes 5M des actions ouvertes, de la plus fréquente à la moins fréquente. */
  parCause: { cause: string; n: number }[];
};

export function syntheseActions(
  actions: (ActionResume & { responsable?: string })[],
  aujourdhui: string,
): SyntheseActions {
  const ouvertes = actions.filter((a) => actionOuverte(a.statut));
  const parOrigine: Record<OrigineAction, number> = { qc: 0, qrqc: 0, plan: 0 };
  const causes = new Map<string, number>();
  for (const a of ouvertes) {
    const o = origineAction(a.origine).value;
    parOrigine[o] += 1;
    if (a.cause5m) causes.set(a.cause5m, (causes.get(a.cause5m) ?? 0) + 1);
  }
  return {
    total: actions.length,
    ouvertes: ouvertes.length,
    enRetard: ouvertes.filter((a) => enRetard(a, aujourdhui)).length,
    sansPilote: ouvertes.filter((a) => !(a.responsable ?? "").trim() || !a.echeance).length,
    parOrigine,
    parCause: [...causes.entries()].map(([cause, n]) => ({ cause, n })).sort((a, b) => b.n - a.n),
  };
}

export type FiltreActions = {
  /** ouvertes (défaut) | retard | closes | toutes */
  etat: "ouvertes" | "retard" | "closes" | "toutes";
  origine: "" | OrigineAction;
  cause: string;
  q: string;
};

export const FILTRE_DEFAUT: FiltreActions = { etat: "ouvertes", origine: "", cause: "", q: "" };

export function filtrerActions<T extends ActionResume & { texte?: string }>(
  actions: T[],
  f: FiltreActions,
  aujourdhui: string,
): T[] {
  const q = cle(f.q);
  return actions.filter((a) => {
    if (f.etat === "ouvertes" && !actionOuverte(a.statut)) return false;
    if (f.etat === "closes" && actionOuverte(a.statut)) return false;
    if (f.etat === "retard" && !enRetard(a, aujourdhui)) return false;
    if (f.origine && origineAction(a.origine).value !== f.origine) return false;
    if (f.cause && a.cause5m !== f.cause) return false;
    if (q && !cle(a.texte ?? "").includes(q)) return false;
    return true;
  });
}

/** Ordre de travail : en retard d'abord, puis priorité, puis échéance la plus
 * proche (sans échéance en dernier), puis la plus récente. Les closes après. */
export function trierActions<T extends ActionResume>(actions: T[], aujourdhui: string): T[] {
  return [...actions].sort((a, b) => {
    const oa = actionOuverte(a.statut) ? 0 : 1;
    const ob = actionOuverte(b.statut) ? 0 : 1;
    if (oa !== ob) return oa - ob;
    const ra = enRetard(a, aujourdhui) ? 0 : 1;
    const rb = enRetard(b, aujourdhui) ? 0 : 1;
    if (ra !== rb) return ra - rb;
    const pa = RANG_PRIORITE[a.priorite] ?? 3;
    const pb = RANG_PRIORITE[b.priorite] ?? 3;
    if (pa !== pb) return pa - pb;
    const ea = a.echeance || "9999-12-31";
    const eb = b.echeance || "9999-12-31";
    if (ea !== eb) return ea.localeCompare(eb);
    return b.id - a.id;
  });
}
