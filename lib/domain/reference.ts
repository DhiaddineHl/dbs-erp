/* LA RÉFÉRENCE INDUSTRIELLE DBS — l'objet central de la mémoire industrielle.
 *
 * Avant, l'identité d'un article se calculait de trois façons différentes selon
 * l'endroit (cf. audit §D) :
 *   · regroupement + tissu : (client, refArticle)
 *   · rapprochement facture + doublons : (client, modele, refArticle)
 *   · passerelle GPAO : modele seul
 *
 * Ce module donne UNE clé canonique, et l'entité `reference_industrielle`
 * (schéma) lui donne un id stable auquel les commandes/OF, la production, le SAM
 * et l'historique se rattachent. Une même référence peut être commandée
 * plusieurs fois (2026-001, 2026-034, 2027-008) : les commandes ne fusionnent
 * JAMAIS, elles pointent seulement vers la même référence.
 *
 * Tout est pur : pas de DB, pas de React. */

import { normaliserNom } from "./commande";

/** Ce qui identifie une référence, tel qu'on le lit sur une commande. */
export type IdentiteReference = {
  client: string | null | undefined;
  refArticle: string | null | undefined;
  modele: string | null | undefined;
};

/**
 * Clé canonique d'une référence industrielle.
 *
 * Priorité à la référence article (le code stable de l'article, ce que le
 * magasin et le donneur d'ordre connaissent) ; à défaut, repli sur le modèle.
 * La casse et les accents sont neutralisés. Retourne "" quand rien n'identifie
 * l'article (ni référence ni modèle) — on ne rattache alors aucune référence
 * plutôt que d'en inventer une fausse.
 */
export function cleReference(id: IdentiteReference): string {
  const client = normaliserNom(id.client);
  const ref = normaliserNom(id.refArticle);
  const modele = normaliserNom(id.modele);
  if (!ref && !modele) return "";
  if (ref) return `${client}|ref:${ref}`;
  return `${client}|mod:${modele}`;
}

/** Deux commandes désignent-elles la même référence industrielle ? */
export function memeReference(a: IdentiteReference, b: IdentiteReference): boolean {
  const ka = cleReference(a);
  return ka !== "" && ka === cleReference(b);
}

/** Libellé lisible d'une référence : « GÉRARD DAREL · AMI-27 (Chemise) ». */
export function libelleReference(id: IdentiteReference): string {
  const parts: string[] = [];
  const client = String(id.client ?? "").trim();
  const ref = String(id.refArticle ?? "").trim();
  const modele = String(id.modele ?? "").trim();
  if (client) parts.push(client);
  if (ref) parts.push(ref);
  const base = parts.join(" · ") || modele || "Sans référence";
  return ref && modele ? `${base} (${modele})` : base;
}

/** Regroupe des lignes portant une identité de référence par clé canonique.
 * Les lignes sans clé (ni ref ni modèle) sont ignorées. */
export function grouperParReference<T extends IdentiteReference>(lignes: readonly T[]): Map<string, T[]> {
  const parCle = new Map<string, T[]>();
  for (const l of lignes) {
    const cle = cleReference(l);
    if (!cle) continue;
    const g = parCle.get(cle);
    if (g) g.push(l);
    else parCle.set(cle, [l]);
  }
  return parCle;
}
