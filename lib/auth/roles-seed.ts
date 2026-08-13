/* Rôles personnalisés réellement utilisés par DBS, relevés dans la sauvegarde
 * du 12/08/2026 (clé `roles` + `rolePerms` de pilotpro_v2).
 *
 * Seuls les rôles créés par le client sont seedés ici, avec leur matrice
 * d'origine. Les quatre rôles de base gardent les valeurs par défaut du code :
 * la configuration du client y est très restrictive (leur « Responsable Prod. »
 * n'a accès qu'à sept modules), ce qui rendrait les comptes de démonstration
 * inutilisables sans rien démontrer de plus.
 *
 * Les identifiants de module absents de la navigation actuelle — `be`,
 * `tissus`, `fournitures`, `matieres`, `planning`, `stockmat`, `costing` —
 * viennent d'écrans supprimés ou fusionnés ; ils sont ignorés à l'insertion. */

export type RoleSeed = {
  key: string;
  label: string;
  color: string;
  /** Modules explicitement refusés. Tout le reste est autorisé. */
  refuses: string[];
};

export const ROLES_DBS: RoleSeed[] = [
  {
    key: "jfl",
    label: "JFL",
    color: "#e5152a",
    refuses: [
      "be", "bl", "br", "ofs", "qrqc", "coupe", "qrouv", "gammes", "actions", "costing",
      "magasin", "archives", "capacite", "matieres", "planning", "stockmat", "commandes",
      "gpao_prod", "planfacon", "parametres", "prevexport", "grand_livre", "tracabilite",
      "ordonnancement",
    ],
  },
  {
    key: "coupe",
    label: "Coupe",
    color: "#0f8a44",
    refuses: [
      "be", "bl", "br", "ofs", "facon", "nomen", "qrouv", "stats", "gammes", "alertes",
      "clients", "cockpit", "costing", "magasin", "magfour", "archives", "capacite",
      "factures", "magtissu", "planning", "commandes", "gpao_prod", "modelisme",
      "parametres", "prevexport", "grand_livre", "tracabilite", "ordonnancement",
    ],
  },
  {
    key: "magasin",
    label: "Magasin produits finis",
    color: "#64748b",
    refuses: [
      "be", "bl", "ofs", "coupe", "facon", "nomen", "qrouv", "stats", "gammes", "alertes",
      "clients", "cockpit", "costing", "archives", "capacite", "factures", "commandes",
      "gpao_prod", "modelisme", "parametres", "grand_livre", "tracabilite", "ordonnancement",
    ],
  },
  {
    key: "magfour",
    label: "Magasin fournitures",
    color: "#d97706",
    refuses: ["nomen", "stats", "alertes", "cockpit", "magtissu", "modelisme", "parametres"],
  },
  {
    key: "magtissu",
    label: "Magasin tissu",
    color: "#0284c7",
    refuses: ["nomen", "alertes", "cockpit", "magfour", "modelisme", "parametres"],
  },
  {
    key: "modeliste",
    label: "Modéliste",
    color: "#c94f9c",
    refuses: [
      "be", "bl", "br", "ofs", "facon", "qrouv", "stats", "gammes", "alertes", "clients",
      "cockpit", "costing", "magasin", "magfour", "archives", "capacite", "factures",
      "magtissu", "commandes", "gpao_prod", "parametres", "prevexport", "grand_livre",
      "ordonnancement",
    ],
  },
  {
    key: "qualitycontrol",
    label: "Contrôle qualité",
    color: "#0f766e",
    refuses: [
      "be", "bl", "br", "ofs", "coupe", "facon", "qrouv", "stats", "gammes", "alertes",
      "clients", "cockpit", "costing", "magasin", "archives", "capacite", "factures",
      "matieres", "planning", "stockmat", "commandes", "gpao_prod", "planfacon",
      "parametres", "prevexport", "grand_livre", "tracabilite", "ordonnancement",
    ],
  },
];
