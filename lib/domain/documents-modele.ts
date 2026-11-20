/* FICHES DU MODÈLE (direction technique) — règles pures. */

export const NATURES_DOCUMENT = {
  fiche_technique: "Fiche technique",
  fiche_commentaire: "Fiche commentaire",
  autre: "Autre document",
} as const;
export type NatureDocument = keyof typeof NATURES_DOCUMENT;
export const estNatureDocument = (n: string): n is NatureDocument => n in NATURES_DOCUMENT;

/** Dossiers techniques : souvent plusieurs Mo (PDF de 40 pages). */
export const DOCUMENT_MAX = 25 * 1024 * 1024;

/** S'ouvre et s'imprime directement dans le navigateur (le reste se télécharge). */
export const imprimable = (mime: string) => mime === "application/pdf" || mime.startsWith("image/");

export const tailleLisible = (o: number) => (o >= 1024 * 1024 ? `${(o / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(o / 1024))} Ko`);

/** Fichier sûr à proposer en téléchargement (pas de guillemets ni de saut). */
export const nomTelechargement = (nom: string) => (nom || "document").replace(/["\r\n\\/]+/g, "_").slice(0, 150);
