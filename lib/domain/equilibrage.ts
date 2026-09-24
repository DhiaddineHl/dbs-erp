/* Équilibrage de chaîne — logique métier pure (testable sans base ni React).
 *
 * Principe : une chaîne débite au rythme de son poste le plus lent (le GOULOT).
 * Pour chaque poste on additionne le débit (pièces/h) des ouvrières qui le
 * tiennent — deux personnes sur un poste doublent son débit. Le poste au débit
 * total le plus faible est le goulot : c'est lui qui plafonne la sortie de
 * chaîne. Le TAUX D'ÉQUILIBRAGE mesure le temps utile rapporté au temps si tous
 * les postes tournaient au rythme du goulot : proche de 100 % = peu d'attente. */

export type OuvrierePoste = {
  id: number;
  nom: string;
  poste: string;
  /** pièces/h effectives de cette ouvrière (prod ÷ heures travaillées). */
  debit: number;
  /** heures travaillées (pour pondérer / repérer les temps partiels). */
  heures: number;
};

export type PosteEquilibre = {
  poste: string;
  effectif: number;
  /** débit total du poste = somme des débits des ouvrières (pièces/h). */
  debit: number;
  ouvrieres: OuvrierePoste[];
  goulot: boolean;
  /** écart au goulot en % : (debit - goulot) / goulot × 100. */
  ecartGoulotPct: number | null;
};

export type Suggestion = { type: "surcapacite" | "renfort"; message: string };

export type Equilibrage = {
  postes: PosteEquilibre[];
  goulot: PosteEquilibre | null;
  /** débit de chaîne théorique = débit du goulot (pièces/h). */
  debitChaine: number;
  /** 0..100 — temps utile ÷ (nb postes × temps du goulot). */
  tauxEquilibrage: number | null;
  suggestions: Suggestion[];
};

const r1 = (n: number) => Math.round(n * 10) / 10;

/** Poste « normalisé » pour le regroupement : on retire le préfixe modèle
 * « "Lilith" » éventuellement présent, on trime, on met en minuscules pour la
 * clé mais on garde un libellé lisible. */
function clePoste(poste: string): { cle: string; label: string } {
  const label = poste.replace(/^"[^"]*"\s*/, "").trim() || poste.trim() || "—";
  return { cle: label.toLowerCase(), label };
}

export function equilibrage(ouvrieres: OuvrierePoste[]): Equilibrage {
  // Regroupe par poste (les ouvrières sans débit — n'ont rien produit — sont
  // ignorées : elles fausseraient le goulot en apparaissant à 0).
  const parPoste = new Map<string, PosteEquilibre>();
  for (const o of ouvrieres) {
    if (o.debit <= 0 || o.heures <= 0) continue;
    const { cle, label } = clePoste(o.poste);
    const p =
      parPoste.get(cle) ??
      ({ poste: label, effectif: 0, debit: 0, ouvrieres: [], goulot: false, ecartGoulotPct: null } as PosteEquilibre);
    p.effectif += 1;
    p.debit += o.debit;
    p.ouvrieres.push(o);
    parPoste.set(cle, p);
  }

  const postes = [...parPoste.values()].sort((a, b) => a.debit - b.debit);
  if (postes.length === 0) {
    return { postes, goulot: null, debitChaine: 0, tauxEquilibrage: null, suggestions: [] };
  }

  const goulot = postes[0]; // le plus faible débit
  goulot.goulot = true;
  const debitChaine = goulot.debit;
  for (const p of postes) {
    p.debit = r1(p.debit);
    p.ecartGoulotPct = debitChaine > 0 ? Math.round(((p.debit - debitChaine) / debitChaine) * 100) : null;
  }

  /* Taux d'équilibrage = Σ(débit de chaque poste) ÷ (nb postes × débit max
   * possible au rythme du goulot). Sans déséquilibre, tous les postes seraient
   * au débit du goulot → 100 %. En pratique on rapporte la charge utile totale
   * au potentiel si chaque poste tournait comme le meilleur. On utilise le
   * poste le PLUS RAPIDE comme référence de potentiel par poste. */
  const debitMax = Math.max(...postes.map((p) => p.debit));
  const sommeDebits = postes.reduce((s, p) => s + p.debit, 0);
  const tauxEquilibrage = debitMax > 0 ? Math.round((sommeDebits / (postes.length * debitMax)) * 100) : null;

  const suggestions = construireSuggestions(postes, r1(debitChaine));
  return { postes, goulot, debitChaine: r1(debitChaine), tauxEquilibrage, suggestions };
}

function construireSuggestions(postes: PosteEquilibre[], debitChaine: number): Suggestion[] {
  const out: Suggestion[] = [];
  if (postes.length < 2 || debitChaine <= 0) return out;
  const goulot = postes[0];

  // Postes nettement plus rapides que le goulot (> 30 %) : ils attendent, donc
  // une ressource y est en surcapacité et pourrait renforcer le goulot.
  for (const p of postes) {
    if (p === goulot) continue;
    if (p.ecartGoulotPct != null && p.ecartGoulotPct >= 30 && p.effectif >= 2) {
      out.push({
        type: "surcapacite",
        message: `« ${p.poste} » tourne ${p.ecartGoulotPct}% au-dessus du goulot (${p.debit}/h vs ${debitChaine}/h) : une opératrice pourrait renforcer « ${goulot.poste} ».`,
      });
    }
  }

  // Le goulot lui-même : renforcer d'une personne le ramènerait ~ à son débit
  // par tête × (n+1). On estime le gain.
  if (goulot.effectif >= 1) {
    const parTete = goulot.debit / goulot.effectif;
    const nouveau = r1(goulot.debit + parTete);
    out.push({
      type: "renfort",
      message: `Goulot « ${goulot.poste} » (${goulot.debit}/h). +1 opératrice → ~${nouveau}/h de débit de chaîne (si le poste suivant suit).`,
    });
  }

  return out;
}
