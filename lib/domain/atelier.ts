/* Atelier : registre du personnel et catalogue des opérations.
 *
 * Le rapprochement ouvrière ↔ personne est ici, en fonctions pures, parce que
 * c'est la partie qui se trompe : deux orthographes d'un même nom, un prénom
 * et un nom inversés, un accent perdu à l'export. */

export const STATUTS_PERSONNEL = {
  active: { label: "En poste", tone: "success" as const },
  inactive: { label: "Sortie", tone: "neutral" as const },
};

export type StatutPersonnel = keyof typeof STATUTS_PERSONNEL;
export const estStatutPersonnel = (v: string): v is StatutPersonnel => v === "active" || v === "inactive";

/** Clé de rapprochement d'un nom : minuscules, sans accent, mots triés.
 * Distincte de `normaliserNom` de lib/domain/commande.ts, qui ne trie pas.
 * Le tri des mots fait correspondre « Ben Hayej Ikram » et « Ikram Ben Hayej ». */
export function cleNom(s: string): string {
  return String(s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

export type Rapprochement = {
  ouvriereId: number;
  personnelId: number | null;
  /** exact = les noms normalisés coïncident ; aucun = rien trouvé. */
  qualite: "exact" | "aucun";
};

/** Rapproche des ouvrières de chaîne avec le registre, par nom normalisé.
 *
 * Volontairement strict : pas de distance d'édition, pas de correspondance
 * partielle. Relier la mauvaise personne fausse un rendement individuel et
 * c'est invisible ; ne rien relier se voit tout de suite à l'écran. */
export function rapprocherParNom(
  ouvrieres: { id: number; nom: string; personnelId: number | null }[],
  personnes: { id: number; nom: string }[],
): Rapprochement[] {
  const index = new Map<string, number[]>();
  for (const p of personnes) {
    const cle = cleNom(p.nom);
    if (!cle) continue;
    const g = index.get(cle);
    if (g) g.push(p.id);
    else index.set(cle, [p.id]);
  }

  return ouvrieres
    .filter((o) => o.personnelId === null)
    .map((o) => {
      const trouves = index.get(cleNom(o.nom)) ?? [];
      // Un homonyme dans le registre : on refuse de choisir à la place de l'humain.
      return trouves.length === 1
        ? { ouvriereId: o.id, personnelId: trouves[0], qualite: "exact" as const }
        : { ouvriereId: o.id, personnelId: null, qualite: "aucun" as const };
    });
}

/* ─────────── catalogue d'opérations ─────────── */

/** Regroupe les libellés qui ne diffèrent que par la casse, les accents ou les
 * espaces. Les 509 lignes du client contiennent beaucoup de doublons de frappe. */
export function doublonsOperations(
  operations: { id: number; nom: string; sam: number }[],
): { cle: string; membres: { id: number; nom: string; sam: number }[] }[] {
  const par = new Map<string, { id: number; nom: string; sam: number }[]>();
  for (const o of operations) {
    const cle = cleNom(o.nom);
    if (!cle) continue;
    const g = par.get(cle);
    if (g) g.push(o);
    else par.set(cle, [o]);
  }
  return [...par.entries()]
    .filter(([, m]) => m.length > 1)
    .map(([cle, membres]) => ({ cle, membres }))
    .sort((a, b) => b.membres.length - a.membres.length);
}

/** Suggestions du catalogue pour une saisie en cours. */
export function chercherOperations(
  operations: { id: number; nom: string; sam: number; archive: boolean }[],
  saisie: string,
  max = 12,
) {
  const n = cleNom(saisie);
  const actives = operations.filter((o) => !o.archive);
  if (!n) return actives.slice(0, max);
  return actives
    .filter((o) => cleNom(o.nom).includes(n))
    .sort((a, b) => a.nom.length - b.nom.length)
    .slice(0, max);
}
