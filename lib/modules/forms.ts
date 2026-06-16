import {
  CAUSE_5M,
  CONTROLE,
  CONTROLE_BR,
  PRIO,
  RETARD,
  STATUT_ACTION,
  STATUT_BL,
  STATUT_CMD,
  STATUT_QRQC,
  STATUT_RECEP,
  labels,
} from "./options";

export type Field = {
  name: string;
  label: string;
  type?: "text" | "number" | "select" | "date";
  options?: string[];
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
  { name: "ville", label: "Ville" },
  { name: "cmd", label: "Commandes actives", type: "number" },
  { name: "ca", label: "CA total", placeholder: "86 400 €" },
];

export const COMMANDE_FIELDS: Field[] = [
  { name: "modele", label: "Modèle", required: true },
  { name: "client", label: "Client", required: true },
  { name: "assigne", label: "Assigné à", placeholder: "Chaîne 1 / Façonnier…" },
  { name: "qte", label: "Quantité", type: "number" },
  { name: "pv", label: "Prix vente", placeholder: "12,40 €" },
  { name: "pf", label: "Prix façon", placeholder: "3,50 €" },
  { name: "marge", label: "Marge", placeholder: "10 680 €" },
  { name: "export", label: "Date export", placeholder: "20 juin" },
  { name: "av", label: "Avancement %", type: "number" },
  { name: "retard", label: "Retard", type: "select", options: labels(RETARD) },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_CMD) },
];

export const FACONNIER_FIELDS: Field[] = [
  { name: "nom", label: "Nom", required: true, full: true },
  { name: "spec", label: "Spécialité", placeholder: "Pantalon · Chino" },
  { name: "contact", label: "Contact" },
  { name: "tel", label: "Téléphone" },
  { name: "prix", label: "Prix façon réf.", placeholder: "4,20 €" },
  { name: "cmd", label: "Cmd actives", type: "number" },
  { name: "charge", label: "Charge (pcs)", type: "number" },
];

export const TISSU_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "10 juin" },
  { name: "cmd", label: "Commande", placeholder: "OF-2026-001" },
  { name: "design", label: "Désignation", required: true, full: true },
  { name: "recue", label: "Qté reçue", type: "number" },
  { name: "prevue", label: "Qté prévue", type: "number" },
  { name: "ecart", label: "Écart", placeholder: "-50 m / +50 m / 0 m" },
  { name: "controle", label: "Contrôle", type: "select", options: labels(CONTROLE) },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_RECEP) },
];

export const FOURNITURE_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "10 juin" },
  { name: "cmd", label: "Commande", placeholder: "OF-2026-001" },
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

export const BR_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "12 juin" },
  { name: "facon", label: "Façonnier", required: true },
  { name: "cmd", label: "Commande", placeholder: "OF-2026-002" },
  { name: "recu", label: "Reçu", type: "number" },
  { name: "oknc", label: "OK / NC", placeholder: "698 / 6" },
  { name: "controle", label: "Contrôle", type: "select", options: labels(CONTROLE_BR) },
];

export const BL_FIELDS: Field[] = [
  { name: "date", label: "Date", placeholder: "10 juin" },
  { name: "client", label: "Client", required: true },
  { name: "lignes", label: "Lignes", type: "number" },
  { name: "qte", label: "Quantité", type: "number" },
  { name: "total", label: "Total HT", placeholder: "14 880 €" },
  { name: "statut", label: "Statut", type: "select", options: labels(STATUT_BL) },
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
