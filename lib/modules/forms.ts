import {
  CAUSE_5M,
  CONTROLE,
  PRIO,
  STATUT_ACTION,
  STATUT_QRQC,
  STATUT_RECEP,
  labels,
} from "./options";

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
  { name: "prixVente", label: "Prix vente (€/pcs)", placeholder: "12,40" },
  { name: "prixFacon", label: "Prix façon (€/pcs)", placeholder: "3,50" },
  { name: "consoTheo", label: "Conso. théorique (m/pcs)", placeholder: "1,45" },
  { name: "receptTissu", label: "Réception tissu", type: "date" },
  { name: "dateExport", label: "Date export prévue", type: "date" },
  { name: "dateExportReel", label: "Date export réelle", type: "date" },
  { name: "produit", label: "Déjà produit", type: "number" },
  { name: "note", label: "Note", full: true },
];

export const FACONNIER_FIELDS: Field[] = [
  { name: "nom", label: "Nom", required: true, full: true },
  { name: "specialite", label: "Spécialité", placeholder: "Pantalon · Chino" },
  { name: "contact", label: "Contact" },
  { name: "tel", label: "Téléphone" },
  { name: "prixFacon", label: "Prix façon réf. (€/pcs)", placeholder: "4,20" },
];

export const TISSU_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "10 juin" },
  { name: "cmd", label: "Commande", type: "select", dynamic: true, required: true },
  { name: "design", label: "Désignation", required: true, full: true },
  { name: "recue", label: "Qté reçue", type: "number" },
  { name: "prevue", label: "Qté prévue", type: "number" },
  { name: "ecart", label: "Écart", placeholder: "-50 m / +50 m / 0 m" },
  { name: "controle", label: "Contrôle", type: "select", options: labels(CONTROLE) },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_RECEP) },
];

export const FOURNITURE_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "10 juin" },
  { name: "cmd", label: "Commande", type: "select", dynamic: true, required: true },
  { name: "type", label: "Type", placeholder: "Boutons / Fermetures…" },
  { name: "design", label: "Désignation", required: true, full: true },
  { name: "qte", label: "Quantité", placeholder: "14 400 u" },
  { name: "controle", label: "Contrôle", type: "select", options: labels(CONTROLE) },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_RECEP) },
];

export const GAMME_FIELDS: Field[] = [
  { name: "modele", label: "Modèle", required: true, full: true },
  { name: "ops", label: "Opérations", type: "number" },
  { name: "sam", label: "SAM total", placeholder: "612 s" },
  { name: "cout", label: "Coût MO/pcs", placeholder: "0,60 €" },
  { name: "cap", label: "Capacité/j/op.", placeholder: "47 pcs" },
];

export const QRQC_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "12 juin" },
  { name: "pb", label: "Problème", required: true, full: true },
  { name: "cause", label: "Cause 5M", type: "select", options: labels(CAUSE_5M) },
  { name: "cmd", label: "Commande", placeholder: "OF-2026-001" },
  { name: "action", label: "Action corrective", full: true },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_QRQC) },
];

export const ACTION_FIELDS: Field[] = [
  { name: "action", label: "Action", required: true, full: true },
  { name: "resp", label: "Responsable" },
  { name: "echeance", label: "Échéance", placeholder: "16 juin" },
  { name: "prio", label: "Priorité", type: "select", options: labels(PRIO) },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_ACTION) },
];
