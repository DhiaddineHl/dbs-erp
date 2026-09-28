import type { Tone } from "@/components/shared/status-badge";

/* Options partagées par les formulaires et le tableau éditable des référentiels. */
export type Opt = { label: string; tone: Tone };

/** Size grids offered in the commande form (mirrors PilotPro TAILLE_GRIDS). */
export const TAILLE_GRIDS: Record<string, string[]> = {
  standard: ["XS", "S", "M", "L", "XL", "XXL"],
  num: ["34", "36", "38", "40", "42", "44", "46"],
  uni: ["TU"],
};

export function toneOf(list: Opt[], label: string): Tone {
  return list.find((o) => o.label === label)?.tone ?? "neutral";
}

/** Tone for free-form ±-prefixed deltas (e.g. "+50 m" → success, "-20 m" → danger). */
export function ecartTone(label: string): Tone {
  const s = (label || "").trim();
  return s.startsWith("+") ? "success" : s.startsWith("-") ? "danger" : "neutral";
}
