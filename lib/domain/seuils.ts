/* Source UNIQUE des seuils de rendement et de qualité.
 *
 * Avant ce fichier, les seuils vivaient en dur à trois endroits, avec des
 * valeurs différentes : `lib/domain/rendement.ts` (75/85 — portail QR),
 * `app/(app)/gpao_prod/store.ts` (60/85, alerte 65 — écrans atelier) et
 * `app/(app)/qc/dashboard.tsx` (75/90 — conformité). Une même ouvrière à 62 %
 * pouvait donc être « orange » sur un écran et « rouge, sous le seuil » sur un
 * autre.
 *
 * Cette étape NE CHANGE AUCUNE valeur : elle rassemble simplement les
 * définitions ici, et tous les écrans importent d'ici. Les deux bandes
 * (atelier 60↔85 vs portail 75↔85) sont conservées telles quelles, parce
 * qu'elles n'ont pas la même portée : la coloration d'une cellule et l'alerte
 * nominative qui déclenche une conversation ne sont pas le même chiffre.
 *
 * Étape suivante possible (bloc 2, à valider) : rendre ces valeurs
 * configurables depuis Paramètres via `app_setting`, en gardant ces
 * constantes comme défauts. Le point d'entrée est déjà unique. */

/** Seuils de rendement ouvrière / chaîne, en pourcentage. */
export const SEUILS_RENDEMENT = {
  /** En dessous : rouge (coloration atelier). Ex-`SEUIL_B`. */
  critique: 60,
  /** À partir de : vert. Ex-`SEUIL_H` / `SEUIL_BON`. */
  bon: 85,
  /** Portail QR : en dessous, l'ouvrière est « sous le seuil ». Ex-`SEUIL_ALERTE`. */
  alertePortail: 75,
  /** Défaut de l'alerte nominative atelier (`gpao.seuilAlerte`, configurable).
   *  Ex-`SEUIL_ALERTE_DEFAUT`. */
  alerteAtelierDefaut: 65,
  /** Taux de retouches (%) au-delà duquel on alerte. Ex-`SEUIL_RET`. */
  retouche: 5,
} as const;

/** Seuils du taux de conformité qualité, en pourcentage. */
export const SEUILS_QUALITE = {
  /** À partir de : conforme (vert). */
  bon: 90,
  /** À partir de : sous surveillance (orange) ; en dessous : rouge. */
  alerte: 75,
} as const;

/** Niveau de conformité qualité à partir d'un taux (%). */
export function niveauQualite(taux: number | null): "bon" | "alerte" | "critique" | null {
  if (taux === null) return null;
  return taux >= SEUILS_QUALITE.bon ? "bon" : taux >= SEUILS_QUALITE.alerte ? "alerte" : "critique";
}
