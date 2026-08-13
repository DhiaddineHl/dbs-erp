import type { Tone } from "@/components/shared/status-badge";

/* Traçabilité : la vie d'une commande, du carnet de commandes à la facture.
 *
 * Rien n'est stocké ici. Les événements sont reconstruits à partir des faits
 * déjà enregistrés ailleurs — TDS, contrôles matière, lancement, lâchers de
 * coupe, réceptions, inspections, bons de livraison, factures. C'est
 * volontaire : une frise stockée diverge du réel dès la première correction,
 * une frise dérivée ne peut pas mentir. */

export type EtapeCle =
  | "commande"
  | "matieres"
  | "preparation"
  | "lancement"
  | "coupe"
  | "production"
  | "qualite"
  | "magasin"
  | "livraison"
  | "facturation";

export const ETAPES: { cle: EtapeCle; label: string; icone: string }[] = [
  { cle: "commande", label: "Commande", icone: "📋" },
  { cle: "matieres", label: "Matières", icone: "🧵" },
  { cle: "preparation", label: "Préparation", icone: "📐" },
  { cle: "lancement", label: "Lancement", icone: "🚦" },
  { cle: "coupe", label: "Coupe", icone: "✂️" },
  { cle: "production", label: "Production", icone: "🏭" },
  { cle: "qualite", label: "Qualité", icone: "🔍" },
  { cle: "magasin", label: "Magasin", icone: "📦" },
  { cle: "livraison", label: "Livraison", icone: "🚚" },
  { cle: "facturation", label: "Facturation", icone: "🧾" },
];

export type Evenement = {
  /** ISO ou null quand le fait est connu mais non daté. */
  date: string | null;
  etape: EtapeCle;
  titre: string;
  detail: string;
  tone: Tone;
  acteur?: string;
};

/** Chronologique. Les faits non datés restent groupés en fin d'étape plutôt
 * que jetés : « on sait que c'est arrivé, on ne sait pas quand ». */
export function trierEvenements(evts: Evenement[]): Evenement[] {
  const rang = new Map(ETAPES.map((e, i) => [e.cle, i]));
  return [...evts].sort((a, b) => {
    if (a.date && b.date && a.date !== b.date) return a.date.localeCompare(b.date);
    if (a.date && !b.date) return -1;
    if (!a.date && b.date) return 1;
    return (rang.get(a.etape) ?? 0) - (rang.get(b.etape) ?? 0);
  });
}

export type EtatJalon = "fait" | "encours" | "avenir";

export type Jalon = {
  cle: EtapeCle;
  label: string;
  icone: string;
  etat: EtatJalon;
  /** Date du premier événement de l'étape, si connue. */
  date: string | null;
  nb: number;
};

/** La frise du haut : une étape est « faite » quand l'étape suivante a commencé,
 * « en cours » quand elle est la dernière atteinte. */
export function construireJalons(evts: Evenement[], atteintes: Set<EtapeCle>): Jalon[] {
  const rang = new Map(ETAPES.map((e, i) => [e.cle, i]));
  let dernier = -1;
  for (const cle of atteintes) dernier = Math.max(dernier, rang.get(cle) ?? -1);

  return ETAPES.map((e, i) => {
    const siens = evts.filter((v) => v.etape === e.cle);
    const etat: EtatJalon = !atteintes.has(e.cle) ? "avenir" : i < dernier ? "fait" : "encours";
    return {
      cle: e.cle,
      label: e.label,
      icone: e.icone,
      etat,
      date: siens.find((v) => v.date)?.date ?? null,
      nb: siens.length,
    };
  });
}

/** Durée du cycle, du premier au dernier fait daté. */
export function dureeCycle(evts: Evenement[]): { debut: string; fin: string; jours: number } | null {
  const dates = evts.map((e) => e.date).filter((d): d is string => !!d).sort();
  if (dates.length < 2) return null;
  const debut = dates[0];
  const fin = dates[dates.length - 1];
  const j = Math.round((Date.parse(`${fin}T00:00:00`) - Date.parse(`${debut}T00:00:00`)) / 86_400_000);
  return Number.isFinite(j) ? { debut, fin, jours: j } : null;
}
