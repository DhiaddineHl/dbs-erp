/* État d'encaissement de départ, repris de l'application du client.
 *
 * Celle-ci ne stockait pas les factures soldées : elle tenait la liste inverse,
 * `PENDING_INIT`, et considérait comme réglée toute facture absente de cette
 * liste. On reproduit la même vérité, mais explicitement — chaque facture
 * soldée reçoit son règlement, ce qui rend la balance âgée et les relances
 * exactes dès la première ouverture. */

/** Numéros de facture (partie avant « /2026 ») restées impayées. */
export const FACTURES_IMPAYEES = new Set([
  "21", "40", "44", "49", "50", "52", "55", "56", "58", "59", "60", "62", "63",
  "65", "66", "67", "68", "69", "72", "73", "74", "77", "78", "79", "80", "81", "82",
]);

/** Comptes bancaires réellement utilisés par le client, puis les usuels. */
export const COMPTES_BANCAIRES = ["BIAT - EUR", "BIAT DC", "Attijari Bank - EUR", "UIB - EUR", "Amen Bank - EUR"];

/** Taux de conversion EUR → TND en vigueur dans la sauvegarde du client. */
export const TAUX_EUR_INITIAL = 3.34;

/** Fournisseurs de démonstration du grand livre. Les 165 comptes réels du
 * client seront repris par l'import de la phase 7 ; ceux-ci servent à ce que le
 * module soit utilisable et l'échéancier lisible sur une base neuve. */
export const FOURNISSEURS_DEMO: {
  nom: string;
  categorie: string;
  devise: string;
  transactions: { jours: number; libelle: string; debit: number; credit: number }[];
}[] = [
  {
    nom: "SUNPLASTIK",
    categorie: "Matières / Fournitures",
    devise: "TND",
    transactions: [
      { jours: -120, libelle: "FN°11942", debit: 0, credit: 5444.118 },
      { jours: -120, libelle: "R/S", debit: 54.441, credit: 0 },
      { jours: -70, libelle: "REG TN°011332454516", debit: 2700, credit: 0 },
      { jours: -40, libelle: "REG TN°011332454613", debit: 2689.677, credit: 0 },
      { jours: 12, libelle: "Traite à échoir", debit: 1850.5, credit: 0 },
    ],
  },
  {
    nom: "TWINTEX",
    categorie: "Façonniers",
    devise: "TND",
    transactions: [
      { jours: -60, libelle: "Façon juin — 1 200 pcs", debit: 0, credit: 8400 },
      { jours: -25, libelle: "Acompte virement", debit: 5000, credit: 0 },
      { jours: 5, libelle: "Solde façon juin", debit: 3400, credit: 0 },
    ],
  },
  {
    nom: "TRANSIT NABEUL",
    categorie: "Transport / Logistique",
    devise: "EUR",
    transactions: [
      { jours: -45, libelle: "Groupage export mai", debit: 0, credit: 1240.5 },
      { jours: -15, libelle: "Virement", debit: 1240.5, credit: 0 },
      { jours: -20, libelle: "Groupage export juin", debit: 0, credit: 980 },
      { jours: 22, libelle: "Échéance groupage juin", debit: 980, credit: 0 },
    ],
  },
  {
    nom: "STEG",
    categorie: "Charges fixes",
    devise: "TND",
    transactions: [
      { jours: -90, libelle: "Électricité T2", debit: 0, credit: 4320.75 },
      { jours: -85, libelle: "Règlement", debit: 4320.75, credit: 0 },
    ],
  },
];
