/* Identité de la société émettrice : tous les en-têtes, pieds de page,
   documents imprimés et écrans y puisent leur nom et leurs coordonnées. */
export const ENTREPRISE = {
  nom: "Ste TST",
  nomMaj: "STE TST",
  /** Forme courte, pour les libellés (« Interne TST », « Acheté TST »…). */
  nomCourt: "TST",
  activite: "Confection export",
  /** Logo provisoire, à remplacer par le logo TST. */
  logo: "/logo-placeholder.png",

  adresse: "Rue 14 Janvier 2011 - Menzel Bou Zelfa, Tunisie",
  adresseCourte: "Rue 14 Janvier 2011, Menzel Bou Zelfa",
  matriculeFiscal: "1244403V",
  /** Vide = ligne « Tél » masquée sur les documents. */
  telephone: "72 252 687",
  /** Vide = e-mail masqué sur les documents. */
  email: "info@tech-style-tunisia.com",
  // Pas de coordonnées bancaires ici : elles se saisissent sur chaque facture.
} as const;
