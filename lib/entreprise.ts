/* Identité de la société émettrice : tous les en-têtes, pieds de page,
   documents imprimés et écrans y puisent leur nom et leurs coordonnées. */
export const ENTREPRISE = {
  nom: "Lassanis Tunisie",
  nomMaj: "LASSANIS TUNISIE",
  /** Forme courte, pour les libellés (« Interne Lassanis », « Acheté Lassanis »…). */
  nomCourt: "Lassanis",
  activite: "Confection export",
  logo: "/lassanis-logo.jpg",

  adresse: "Zone Industrielle Bouficha - 4010 Bouficha - Sousse, Tunisie",
  adresseCourte: "Zone Industrielle Bouficha, Sousse",
  matriculeFiscal: "1996406L/A/M/000",
  /** Vide = ligne « Tél » masquée sur les documents. */
  telephone: "",
  // Pas de coordonnées bancaires ici : elles se saisissent sur chaque facture.
} as const;
