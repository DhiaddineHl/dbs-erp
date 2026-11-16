/* PRÉVISION D'EXPORT PUBLIÉE AUX CLIENTS — règles pures (aucun accès base).
 *
 * Chaque week-end, vous publiez les deux semaines à venir. Le client lit une
 * photo figée : date prévue, quantité, état, et ce qui a changé depuis la
 * publication précédente. */

const jour = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const plus = (d: string, n: number) => iso(new Date(jour(d).getTime() + n * 86_400_000));

export const NB_SEMAINES = 2;

/** Période à publier : du vendredi au dimanche (le week-end) et en semaine,
 * c'est la semaine PROCHAINE et la suivante ; le lundi, la semaine qui
 * commence (publication tardive). */
export function periodePrevision(aujourdhui: string): { debut: string; fin: string; semaines: { debut: string; fin: string }[] } {
  const j = jour(aujourdhui).getUTCDay(); // 0 = dimanche … 1 = lundi
  const debut = j === 1 ? aujourdhui.slice(0, 10) : plus(aujourdhui, ((8 - j) % 7) || 7);
  const semaines = Array.from({ length: NB_SEMAINES }, (_, i) => ({ debut: plus(debut, 7 * i), fin: plus(debut, 7 * i + 6) }));
  return { debut, fin: semaines[semaines.length - 1].fin, semaines };
}

/** C'est le moment de publier : vendredi, samedi ou dimanche. */
export const estWeekEnd = (aujourdhui: string) => [5, 6, 0].includes(jour(aujourdhui).getUTCDay());

export type EtatExport = "prete" | "emballage" | "production";
export const ETATS_EXPORT: Record<EtatExport, string> = {
  prete: "Prête à partir",
  emballage: "En emballage",
  production: "En production",
};

/** Un mot simple, vu du client. */
export function etatExport(v: { reste: number; stock: number; produit: number; qte: number; pret: boolean }): EtatExport {
  if (v.pret || (v.reste > 0 && v.stock >= v.reste)) return "prete";
  if (v.stock > 0 || (v.qte > 0 && v.produit >= v.qte)) return "emballage";
  return "production";
}

export type LignePrevue = {
  commandeId: number;
  clientId: number | null;
  of: string;
  modele: string;
  reference: string;
  couleur: string;
  date: string;
  qte: number;
  qteCommande: number;
  etat: EtatExport;
};
export type Changement = "nouvelle" | "inchangee" | "avancee" | "reportee" | "quantite" | "retiree";
export const CHANGEMENTS: Record<Changement, string> = {
  nouvelle: "Nouvelle",
  inchangee: "Inchangée",
  avancee: "Avancée",
  reportee: "Reportée",
  quantite: "Quantité modifiée",
  retiree: "Hors des 2 semaines",
};
export type LigneComparee = Omit<LignePrevue, "date" | "etat"> & {
  date: string | null;
  etat: EtatExport | "";
  changement: Changement;
  dateAvant: string | null;
  qteAvant: number | null;
};

/** Compare la prévision à publier avec la précédente publication :
 *  · une commande déjà annoncée : avancée / reportée / quantité modifiée /
 *    inchangée ;
 *  · une nouvelle venue : « nouvelle » (s'il y avait une publication avant) ;
 *  · une commande annoncée pour cette période qui n'y est plus : une ligne
 *    « hors des 2 semaines » (le client sait qu'elle a glissé). */
export function comparerPrevision(
  nouvelle: LignePrevue[],
  precedente: { commandeId: number | null; clientId: number | null; of: string; modele: string; reference: string; couleur: string; date: string | null; qte: number; qteCommande: number }[] | null,
  periode: { debut: string; fin: string },
): LigneComparee[] {
  const avant = new Map((precedente ?? []).filter((l) => l.commandeId != null && l.date).map((l) => [l.commandeId!, l]));
  const out: LigneComparee[] = nouvelle.map((l) => {
    const a = avant.get(l.commandeId);
    let changement: Changement = precedente ? "nouvelle" : "inchangee";
    if (a) {
      if (a.date! < l.date) changement = "reportee";
      else if (a.date! > l.date) changement = "avancee";
      else if (a.qte !== l.qte) changement = "quantite";
      else changement = "inchangee";
    }
    return { ...l, changement, dateAvant: a && a.date !== l.date ? a.date : null, qteAvant: a && a.qte !== l.qte ? a.qte : null };
  });
  const presentes = new Set(nouvelle.map((l) => l.commandeId));
  for (const a of avant.values()) {
    // Annoncée pour un jour de la nouvelle période, et plus là : elle a glissé.
    if (presentes.has(a.commandeId!) || !a.date || a.date < periode.debut || a.date > periode.fin) continue;
    out.push({
      commandeId: a.commandeId!, clientId: a.clientId, of: a.of, modele: a.modele, reference: a.reference, couleur: a.couleur,
      date: null, qte: 0, qteCommande: a.qteCommande, etat: "", changement: "retiree", dateAvant: a.date, qteAvant: a.qte,
    });
  }
  return out.sort((x, y) => (x.date ?? "9999").localeCompare(y.date ?? "9999") || x.of.localeCompare(y.of));
}

/** Contrôle d'une quantité modifiée à la main avant publication. */
export function refusQuantite(qte: unknown, max: number): string | null {
  const n = Number(qte);
  if (!Number.isFinite(n) || n < 0 || Math.round(n) !== n) return "Quantité : un nombre entier.";
  if (n > max) return `Quantité ${n} au-delà des ${max} pièces commandées.`;
  return null;
}
