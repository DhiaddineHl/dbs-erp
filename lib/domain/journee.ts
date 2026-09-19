/* Validations métier d'une journée GPAO — pures, sans DB ni React, donc
 * testables seules et réutilisables côté serveur ET client.
 *
 * Elles répondent à deux exigences du cahier des charges :
 *   · §26/§32 — les validations (production négative, heures/effectif
 *     invalides…) doivent être faites CÔTÉ SERVEUR, pas seulement dans l'écran ;
 *   · §27 — une journée clôturée ne doit pas pouvoir être modifiée par un
 *     simple appel : ce module dit si un patch touche la production. */

/** Un patch de journée tel qu'il arrive des écrans : un sous-ensemble de
 * champs, valeurs brutes. */
export type PatchJournee = Record<string, unknown>;

/** Le seul champ qu'une journée clôturée accepte encore de voir changer :
 * son propre état de clôture (pour la rouvrir). Tout le reste est gelé. */
const CHAMP_CLOTURE = "cloture";

/** Champs autres que la clôture présents dans le patch. */
export function champsHorsCloture(patch: PatchJournee): string[] {
  return Object.keys(patch).filter((k) => k !== CHAMP_CLOTURE);
}

/** Vrai si le patch modifie autre chose que l'état de clôture — c'est-à-dire
 * s'il touche à la production. Un patch qui ne fait que (dé)clôturer est permis. */
export function modifieProduction(patch: PatchJournee): boolean {
  return champsHorsCloture(patch).length > 0;
}

/* ─────────── validations de valeurs ─────────── */

/** Un nombre fini et ≥ 0 ; les marqueurs de saisie "RI"/"ABS" ne sont pas des
 * quantités et sont donc tolérés tels quels. */
const positifOuMarqueur = (v: unknown): boolean => {
  if (v === "RI" || v === "ABS") return true;
  if (typeof v !== "number") return true; // laissé aux couches de typage
  return Number.isFinite(v) && v >= 0;
};

const toutesValeursPositives = (m: unknown): boolean => {
  if (!m || typeof m !== "object") return true;
  return Object.values(m as Record<string, unknown>).every((v) =>
    v && typeof v === "object"
      ? Object.values(v as Record<string, unknown>).every(positifOuMarqueur)
      : positifOuMarqueur(v),
  );
};

/**
 * Retourne le premier motif de rejet d'un patch, ou null s'il est valide.
 * Ne valide QUE les champs présents dans le patch (les écrans envoient des
 * mises à jour partielles).
 */
export function erreurJournee(patch: PatchJournee): string | null {
  if ("effectif" in patch) {
    const e = Number(patch.effectif);
    if (!Number.isFinite(e) || e < 0) return "Effectif invalide (négatif ou non numérique).";
  }
  if ("nbHeures" in patch) {
    const h = Number(patch.nbHeures);
    if (!Number.isFinite(h) || h <= 0 || h > 24) return "Heures de journée invalides (doivent être entre 0 et 24).";
  }
  if ("objManuel" in patch && patch.objManuel != null) {
    const o = Number(patch.objManuel);
    if (!Number.isFinite(o) || o < 0) return "Objectif manuel négatif.";
  }
  if ("sortie" in patch && !toutesValeursPositives(patch.sortie)) {
    return "Production (sortie) négative.";
  }
  if ("ops" in patch && !toutesValeursPositives(patch.ops)) {
    return "Saisie horaire négative.";
  }
  if ("ret" in patch && !toutesValeursPositives(patch.ret)) {
    return "Nombre de retouches négatif.";
  }
  if ("opsSam" in patch && !toutesValeursPositives(patch.opsSam)) {
    return "SAM horaire négatif.";
  }
  return null;
}
