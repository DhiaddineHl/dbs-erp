import type { EditColumn } from "@/components/shared/editable-table";
import {
  CONTROLE,
  CONTROLE_BR,
  PRIO,
  RETARD,
  STATUT_ACTION,
  STATUT_BL,
  STATUT_CMD,
  STATUT_QRQC,
  STATUT_RECEP,
} from "./options";

/* Serialisable column descriptors for the inline-editable tables. Defined
 * server-side and passed straight to <EditableTable> (a client component). */

export const CLIENT_EDIT: EditColumn[] = [
  { key: "code", label: "Code", accent: "brand", strong: true },
  { key: "nom", label: "Raison sociale", strong: true },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "ville", label: "Ville" },
  { key: "cmd", label: "Cmd", kind: "number" },
  { key: "ca", label: "CA total", accent: "success" },
];

type CmdChoices = {
  clients: { value: string; label: string }[];
  faconniers: { value: string; label: string }[];
  chaines: { value: string; label: string }[];
};

export const commandeEdit = (c: CmdChoices): EditColumn[] => [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "modele", label: "Modèle", strong: true },
  { key: "client", label: "Client", kind: "select", choices: c.clients },
  { key: "faconnier", label: "Façonnier", kind: "select", choices: c.faconniers },
  { key: "chaineId", label: "Chaîne", kind: "select", choices: c.chaines },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "pv", label: "P. vente" },
  { key: "pf", label: "P. façon" },
  { key: "marge", label: "Marge", accent: "success" },
  { key: "export", label: "Export" },
  { key: "retard", label: "Retard", kind: "status", opts: RETARD },
  { key: "av", label: "Avancement", kind: "progress" },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_CMD },
];

export const FACONNIER_EDIT: EditColumn[] = [
  { key: "nom", label: "Nom", strong: true },
  { key: "spec", label: "Spécialité" },
  { key: "contact", label: "Contact" },
  { key: "tel", label: "Téléphone" },
  { key: "prix", label: "Prix réf." },
  { key: "cmd", label: "Cmd", kind: "number" },
  { key: "charge", label: "Charge", kind: "number" },
];

/** Commande choices (OF number) feed the "Commande" dropdown in tissu/fourniture. */
type Choice = { value: string; label: string };

export const tissuEdit = (cmds: Choice[]): EditColumn[] => [
  { key: "date", label: "Date" },
  { key: "cmd", label: "Commande", kind: "select", choices: cmds },
  { key: "design", label: "Désignation", strong: true },
  { key: "recue", label: "Reçue", kind: "number" },
  { key: "prevue", label: "Prévue", kind: "number" },
  { key: "ecart", label: "Écart" },
  { key: "controle", label: "Contrôle", kind: "status", opts: CONTROLE },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_RECEP },
];

export const fournitureEdit = (cmds: Choice[]): EditColumn[] => [
  { key: "date", label: "Date" },
  { key: "cmd", label: "Commande", kind: "select", choices: cmds },
  { key: "type", label: "Type" },
  { key: "design", label: "Désignation", strong: true },
  { key: "qte", label: "Quantité" },
  { key: "controle", label: "Contrôle", kind: "status", opts: CONTROLE },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_RECEP },
];

export const COUPE_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "mc", label: "Modèle / Couleur" },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "coupee", label: "Coupée", kind: "number" },
  { key: "planif", label: "Planifié" },
  { key: "fin", label: "Fin" },
  { key: "statut", label: "Statut", kind: "badge" },
];

export const BE_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "mc", label: "Modèle / Couleur" },
  { key: "envoi", label: "Envoi" },
  { key: "ok", label: "OK prod" },
  { key: "ref", label: "Réf. proto" },
  { key: "statut", label: "Statut", kind: "badge" },
];

export const GAMME_EDIT: EditColumn[] = [
  { key: "modele", label: "Modèle", strong: true },
  { key: "ops", label: "Opérations", kind: "number" },
  { key: "sam", label: "SAM total" },
  { key: "cout", label: "Coût MO/pcs" },
  { key: "cap", label: "Capacité/j" },
];

export const CAPACITE_EDIT: EditColumn[] = [
  { key: "ch", label: "Chaîne", strong: true },
  { key: "eff", label: "Effectif", kind: "number" },
  { key: "min", label: "Min dispo/j" },
  { key: "modele", label: "Modèle en cours" },
  { key: "cap", label: "Capacité/j" },
  { key: "cout", label: "Coût/pcs" },
];

export const COSTING_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "modele", label: "Modèle", strong: true },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "sam", label: "SAM" },
  { key: "coutP", label: "Coût prév." },
  { key: "coutT", label: "Coût réel" },
  { key: "pf", label: "Prix façon" },
  { key: "ecart", label: "Écart", kind: "badge" },
  { key: "delai", label: "Délai" },
];

export const ORDO_EDIT: EditColumn[] = [
  { key: "rang", label: "Rang", kind: "number" },
  { key: "prio", label: "Priorité", kind: "status", opts: PRIO },
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "mc", label: "Modèle / Couleur" },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "sam", label: "SAM" },
  { key: "charge", label: "Charge" },
  { key: "assigne", label: "Assigné" },
  { key: "export", label: "Export" },
  { key: "crit", label: "Criticité", kind: "badge" },
];

export const OF_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "article", label: "Article", strong: true },
  { key: "chaine", label: "Chaîne" },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "prod", label: "Produit", kind: "number" },
  { key: "debut", label: "Début" },
  { key: "fin", label: "Fin" },
];

export const BR_EDIT: EditColumn[] = [
  { key: "br", label: "N° BR", accent: "brand", strong: true },
  { key: "date", label: "Date" },
  { key: "facon", label: "Façonnier" },
  { key: "cmd", label: "Commande" },
  { key: "recu", label: "Reçu", kind: "number" },
  { key: "oknc", label: "OK / NC" },
  { key: "controle", label: "Contrôle", kind: "status", opts: CONTROLE_BR },
];

export const MAGASIN_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "mc", label: "Modèle / Couleur" },
  { key: "source", label: "Source", kind: "badge" },
  { key: "cmd", label: "Commandé", kind: "number" },
  { key: "recu", label: "Reçu", kind: "number" },
  { key: "statut", label: "Statut", kind: "badge" },
];

export const BL_EDIT: EditColumn[] = [
  { key: "bl", label: "N° BL", accent: "brand", strong: true },
  { key: "date", label: "Date" },
  { key: "client", label: "Client" },
  { key: "lignes", label: "Lignes", kind: "number" },
  { key: "qte", label: "Quantité", kind: "number" },
  { key: "total", label: "Total HT", accent: "success" },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_BL },
];

export const ARCHIVE_EDIT: EditColumn[] = [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "modele", label: "Modèle", strong: true },
  { key: "client", label: "Client" },
  { key: "qte", label: "Qté", kind: "number" },
  { key: "ca", label: "CA", accent: "success" },
  { key: "marge", label: "Marge" },
  { key: "livre", label: "Livré" },
  { key: "retard", label: "Retard", kind: "badge" },
];

export const QRQC_EDIT: EditColumn[] = [
  { key: "date", label: "Date" },
  { key: "pb", label: "Problème", strong: true },
  { key: "cause", label: "Cause 5M" },
  { key: "cmd", label: "Commande" },
  { key: "action", label: "Action corrective" },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_QRQC },
];

export const ACTION_EDIT: EditColumn[] = [
  { key: "action", label: "Action", strong: true },
  { key: "resp", label: "Responsable" },
  { key: "echeance", label: "Échéance" },
  { key: "prio", label: "Priorité", kind: "status", opts: PRIO },
  { key: "statut", label: "Statut", kind: "status", opts: STATUT_ACTION },
];
