
export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "date" | "tailles";
  options?: string[];
  /** When set, the field renders a dropdown whose options are supplied at
   * runtime via the dialog's `dynamicOptions[name]` (clients, façonniers…). */
  dynamic?: boolean;
  required?: boolean;
  placeholder?: string;
  full?: boolean;
};

/* Field schemas drive the generic add-dialog. Auto-generated identifiers
 * (client code, OF/BR/BL numbers) are produced server-side and omitted here. */

export const CLIENT_FIELDS: Field[] = [
  { name: "nom", label: "Raison sociale", required: true, full: true },
  { name: "contact", label: "Contact" },
  { name: "email", label: "Email" },
  { name: "tel", label: "Téléphone" },
  { name: "ville", label: "Ville" },
  { name: "pays", label: "Pays" },
  { name: "tva", label: "N° TVA" },
  { name: "adresse", label: "Adresse", full: true },
];

/* Marge, avancement, retard and statut are no longer typed in: they are
 * derived from quantities, prices and dates by lib/domain/commande.ts. */
export const COMMANDE_FIELDS: Field[] = [
  { name: "modele", label: "Modèle / Article", required: true, full: true },
  { name: "refArticle", label: "Référence" },
  { name: "couleur", label: "Couleur" },
  { name: "saison", label: "Saison", placeholder: "PE26" },
  { name: "client", label: "Client", type: "select", dynamic: true, required: true },
  { name: "faconnier", label: "Façonnier", type: "select", dynamic: true },
  { name: "chaineId", label: "Chaîne interne", type: "select", dynamic: true },
  { name: "tailles", label: "Quantités par taille", type: "tailles", full: true },
  { name: "qte", label: "Quantité (si pas de grille)", type: "number" },
  { name: "devise", label: "Devise", type: "select", options: ["EUR", "TND"], required: true },
  { name: "prixVente", label: "Prix vente HT (/pcs)", placeholder: "12,40" },
  { name: "prixFacon", label: "Prix façon HT (/pcs)", placeholder: "3,50" },
  { name: "consoTheo", label: "Conso. théorique (m/pcs)", placeholder: "1,45" },
  { name: "receptTissu", label: "Réception tissu", type: "date" },
  { name: "dateExport", label: "Date export prévue", type: "date" },
  { name: "dateExportReel", label: "Date export réelle", type: "date" },
  { name: "produit", label: "Déjà produit", type: "number" },
  { name: "note", label: "Note", full: true },
];

/* Modification d'une commande existante : même formulaire que la création,
 * sans la grille de tailles — la répartition par taille touche la
 * production déjà lancée (coupe, sous-commandes) et se corrige depuis les
 * écrans dédiés, pas en réécrivant la commande. La quantité globale reste
 * modifiable pour autant. */
export const COMMANDE_EDIT_FIELDS: Field[] = COMMANDE_FIELDS.filter((f) => f.name !== "tailles").map((f) =>
  f.name === "qte" ? { ...f, label: "Quantité" } : f,
);

export const FACONNIER_FIELDS: Field[] = [
  { name: "nom", label: "Nom", required: true, full: true },
  { name: "specialite", label: "Spécialité", placeholder: "Pantalon · Chino" },
  { name: "contact", label: "Contact" },
  { name: "tel", label: "Téléphone" },
  { name: "prixFacon", label: "Prix façon réf. (€/pcs)", placeholder: "4,20" },
];
