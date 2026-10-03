/* Fiche de coupe — règles pures (testables sans base).
 *
 * La coupe part du PLAN DE COUPE (lib/domain/plan-coupe) : on ne retape pas
 * les quantités, on les importe. Le coupé réel peut différer du prévu (manque
 * tissu, défaut…) : l'écart est montré, et au-delà d'un seuil il doit être
 * expliqué. Pour des OF réunis (un plan sur le porteur), la fiche répartit le
 * coupé par OF : chaque OF reçoit sa propre quantité coupée. */

export const SEUIL_ECART_DEFAUT = 2; // % par taille
export const CLE_SEUIL_ECART = "coupe.seuilEcartPct";

export const MOTIFS_ECART = [
  { value: "manque_tissu", label: "Manque tissu" },
  { value: "defaut_tissu", label: "Défaut tissu" },
  { value: "changement_client", label: "Changement client" },
  { value: "complement", label: "Complément coupe" },
  { value: "reassort", label: "Réassort" },
  { value: "autre", label: "Autre" },
] as const;
export const motifEcartLabel = (v: string) => MOTIFS_ECART.find((m) => m.value === v)?.label ?? v;

const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const ent = (n: unknown) => {
  const x = Math.round(Number(n));
  return Number.isFinite(x) && x > 0 ? x : 0;
};

/** Un OF qui reçoit une part de la coupe. `tailles` = sa propre grille
 * commandée ; vide quand la commande est en taille unique. */
export type MembreCoupe = { id: number; of: string; qtePropre: number; tailles: Record<string, number>; porteur: boolean };

/** Commandé par OF et par taille, sur la gamme du plan.
 *
 * Un OF qui a sa grille la donne telle quelle (tailles hors gamme ignorées).
 * Un OF sans grille (taille unique) : sur un plan « TU », toute sa quantité ;
 * sur un plan détaillé, sa quantité répartie au prorata du prévu. */
export function commandeParMembre(sizes: string[], prevu: Record<string, number>, membres: MembreCoupe[]): Record<number, Record<string, number>> {
  const totalPrevu = sizes.reduce((s, t) => s + ent(prevu[t]), 0);
  const out: Record<number, Record<string, number>> = {};
  for (const m of membres) {
    const ligne: Record<string, number> = Object.fromEntries(sizes.map((t) => [t, 0]));
    const aGrille = Object.values(m.tailles).some((q) => ent(q) > 0);
    if (aGrille) for (const t of sizes) ligne[t] = ent(m.tailles[t]);
    else if (sizes.length === 1) ligne[sizes[0]] = ent(m.qtePropre);
    else if (totalPrevu > 0) {
      let reste = ent(m.qtePropre);
      sizes.forEach((t, i) => {
        const q = i === sizes.length - 1 ? reste : Math.floor((ent(m.qtePropre) * ent(prevu[t])) / totalPrevu);
        ligne[t] = Math.max(0, q);
        reste -= ligne[t];
      });
    }
    out[m.id] = ligne;
  }
  return out;
}

/** Proposition de coupé par OF : chacun reçoit son commandé ; le surplus que
 * le plan prévoit en plus va au porteur ; s'il prévoit moins, on retire
 * d'abord au porteur, puis aux plus gros OF. La somme par taille = le prévu. */
export function repartitionParDefaut(sizes: string[], prevu: Record<string, number>, membres: MembreCoupe[]): Record<number, Record<string, number>> {
  const cmd = commandeParMembre(sizes, prevu, membres);
  const out: Record<number, Record<string, number>> = Object.fromEntries(membres.map((m) => [m.id, { ...cmd[m.id] }]));
  const porteur = membres.find((m) => m.porteur) ?? membres[0];
  if (!porteur) return out;
  for (const t of sizes) {
    let ecart = ent(prevu[t]) - membres.reduce((s, m) => s + out[m.id][t], 0);
    if (ecart > 0) out[porteur.id][t] += ecart;
    else {
      const ordre = [porteur, ...membres.filter((m) => m !== porteur).sort((a, b) => out[b.id][t] - out[a.id][t])];
      for (const m of ordre) {
        if (ecart >= 0) break;
        const retrait = Math.min(out[m.id][t], -ecart);
        out[m.id][t] -= retrait;
        ecart += retrait;
      }
    }
  }
  return out;
}

export type LigneEcart = { taille: string; commande: number; prevu: number; coupe: number; ecart: number; pct: number | null; motifRequis: boolean };

/** Prévu / coupé / écart par taille. Le motif est exigé quand l'écart
 * dépasse le seuil (en % du prévu) ; une taille non prévue mais coupée
 * l'exige toujours. */
export function ecartsCoupe(
  sizes: string[],
  commande: Record<string, number>,
  prevu: Record<string, number>,
  coupe: Record<string, number>,
  seuilPct: number,
): LigneEcart[] {
  return sizes.map((t) => {
    const p = ent(prevu[t]);
    const c = ent(coupe[t]);
    const ecart = c - p;
    const pct = p > 0 ? r2((ecart / p) * 100) : null;
    return {
      taille: t,
      commande: ent(commande[t]),
      prevu: p,
      coupe: c,
      ecart,
      pct,
      motifRequis: ecart !== 0 && (pct == null || Math.abs(pct) > seuilPct),
    };
  });
}

export const totalLignes = (lignes: LigneEcart[]) =>
  lignes.reduce(
    (s, l) => ({ commande: s.commande + l.commande, prevu: s.prevu + l.prevu, coupe: s.coupe + l.coupe, ecart: s.ecart + l.ecart }),
    { commande: 0, prevu: 0, coupe: 0, ecart: 0 },
  );

/** Refus de validation : rien de coupé, quantité invalide, ou écart au-delà du
 * seuil sans motif (ou « Autre » sans précision). */
export function refusValidation(lignes: LigneEcart[], motif: string, precision: string): string | null {
  if (!lignes.some((l) => l.coupe > 0)) return "Aucune pièce coupée : saisissez le coupé.";
  const aExpliquer = lignes.filter((l) => l.motifRequis);
  if (aExpliquer.length && !motif) {
    return `Écart à expliquer sur ${aExpliquer.map((l) => `${l.taille} (${l.ecart > 0 ? "+" : ""}${l.ecart})`).join(", ")} : choisissez un motif.`;
  }
  if (aExpliquer.length && motif === "autre" && !precision.trim()) return "Motif « Autre » : précisez l'écart.";
  return null;
}

/** Consommation théorique / réelle / écart. Théorique = conso prévue par
 * pièce × pièces coupées. */
export function bilanConsommation(consoPiece: number | null, pieces: number, reel: number) {
  const theorique = consoPiece != null && consoPiece > 0 ? r2(consoPiece * pieces) : null;
  const ecart = theorique != null ? r2(reel - theorique) : null;
  const pct = theorique != null && theorique > 0 && ecart != null ? r2((ecart / theorique) * 100) : null;
  return { theorique, reel: r2(reel), ecart, pct };
}

/** Prochain numéro d'une séquence annuelle PREFIXE-AAAA-NNN. */
export function prochainNumero(prefixe: string, annee: number, existants: string[]): string {
  const p = `${prefixe}-${annee}-`;
  const max = existants.reduce((m, n) => (n.startsWith(p) ? Math.max(m, parseInt(n.slice(p.length), 10) || 0) : m), 0);
  return `${p}${String(max + 1).padStart(3, "0")}`;
}
