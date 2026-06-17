import type { Tone } from "@/components/shared/status-badge";

/* Curated status options (label + UI tone) shared by the add-dialog selects and
 * the create actions (which resolve a label back to its tone). */
export type Opt = { label: string; tone: Tone };

export const RETARD: Opt[] = [
  { label: "À l'heure", tone: "success" },
  { label: "J-6", tone: "warning" },
  { label: "J-14", tone: "neutral" },
  { label: "Retard 2j", tone: "danger" },
  { label: "—", tone: "neutral" },
];
export const STATUT_CMD: Opt[] = [
  { label: "Active", tone: "brand" },
  { label: "Partielle", tone: "warning" },
  { label: "⚠ Retard", tone: "danger" },
  { label: "Terminée", tone: "success" },
];
export const CONTROLE: Opt[] = [
  { label: "Conforme", tone: "success" },
  { label: "À vérifier", tone: "warning" },
  { label: "En cours", tone: "warning" },
  { label: "Non conforme", tone: "danger" },
];
export const STATUT_RECEP: Opt[] = [
  { label: "Libéré", tone: "success" },
  { label: "Libérée", tone: "success" },
  { label: "En attente", tone: "warning" },
  { label: "Bloqué", tone: "danger" },
];
export const CONTROLE_BR: Opt[] = [
  { label: "Conforme", tone: "success" },
  { label: "Écart toléré", tone: "warning" },
  { label: "Non conforme", tone: "danger" },
];
export const STATUT_BL: Opt[] = [
  { label: "Brouillon", tone: "warning" },
  { label: "Émis", tone: "brand" },
  { label: "Facturé", tone: "success" },
];
export const CAUSE_5M: Opt[] = [
  { label: "Main d'œuvre", tone: "info" },
  { label: "Machine", tone: "info" },
  { label: "Matière", tone: "info" },
  { label: "Méthode", tone: "info" },
  { label: "Milieu", tone: "info" },
];
export const STATUT_QRQC: Opt[] = [
  { label: "Ouvert", tone: "danger" },
  { label: "En cours", tone: "warning" },
  { label: "Résolu", tone: "success" },
];
export const PRIO: Opt[] = [
  { label: "Haute", tone: "danger" },
  { label: "Moyenne", tone: "warning" },
  { label: "Basse", tone: "neutral" },
];
export const STATUT_ACTION: Opt[] = [
  { label: "À faire", tone: "neutral" },
  { label: "En cours", tone: "warning" },
  { label: "En retard", tone: "danger" },
  { label: "Clôturée", tone: "success" },
];

/** Size grids offered in the commande form (mirrors PilotPro TAILLE_GRIDS). */
export const TAILLE_GRIDS: Record<string, string[]> = {
  standard: ["XS", "S", "M", "L", "XL", "XXL"],
  num: ["34", "36", "38", "40", "42", "44", "46"],
  uni: ["TU"],
};

export const labels = (list: Opt[]) => list.map((o) => o.label);

export function toneOf(list: Opt[], label: string): Tone {
  return list.find((o) => o.label === label)?.tone ?? "neutral";
}

/** Tone for free-form ±-prefixed deltas (e.g. "+50 m" → success, "-20 m" → danger). */
export function ecartTone(label: string): Tone {
  const s = (label || "").trim();
  return s.startsWith("+") ? "success" : s.startsWith("-") ? "danger" : "neutral";
}
