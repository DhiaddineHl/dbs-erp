/* Identité de l'entreprise — une seule source pour les documents imprimés,
 * la facture, les relances et les libellés de l'application.
 *
 * Les champs vides ne sont pas encore connus : les gabarits les omettent
 * plutôt que d'imprimer une ligne creuse. */
export const ENTREPRISE = {
  /** Nom d'usage, en casse normale (« Patrick Confection »). */
  nom: "Patrick Confection",
  /** Nom en capitales, pour les en-têtes et étiquettes. */
  nomMaj: "PATRICK CONFECTION",
  /** Raison sociale complète, telle qu'imprimée sur la facture. */
  raisonSociale: "STE PATRICK CONFECTION",
  /** Sigle pour les badges et colonnes étroites. */
  sigle: "PC",
  adresse: "Dar Chaabane El Fehri, Nabeul",
  pays: "Tunisie",
  matriculeFiscal: "1115787P/A/M/000",
  telephones: ["+216 72 361 921", "+216 23 913 010"],
  email: "",
  /** Coordonnées bancaires — à compléter. */
  rib: "",
  swift: "",
  banque: "",
} as const;

/** Adresse sur une ligne, pays compris. */
export const adresseComplete = () => `${ENTREPRISE.adresse}, ${ENTREPRISE.pays}`;

/** « Tél : a / b » — vide si aucun numéro. */
export const telephonesLigne = () =>
  ENTREPRISE.telephones.length ? `Tél : ${ENTREPRISE.telephones.join(" / ")}` : "";

/** Façonnier qui désigne l'atelier lui-même (production interne) : son nom,
 * son sigle, ou « interne ». Comparaison insensible à la casse. */
export const NOMS_INTERNES = [ENTREPRISE.nom, ENTREPRISE.sigle, "Patrick", "interne"].map((n) => n.toLowerCase());
export const estNomInterne = (nom: string) => NOMS_INTERNES.includes(nom.trim().toLowerCase());
