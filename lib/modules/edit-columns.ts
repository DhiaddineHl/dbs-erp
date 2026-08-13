import type { EditColumn } from "@/components/shared/editable-table";
import { STATUTS_MANUELS, statutLabel } from "@/lib/domain/commande";
import {
  CONTROLE,
  PRIO,
  STATUT_ACTION,
  STATUT_QRQC,
  STATUT_RECEP,
} from "./options";

/** "" = leave the statut derived; anything else pins it. */
const STATUT_MANUEL_CHOICES = STATUTS_MANUELS.map((s) => ({ value: s, label: statutLabel(s) }));

/* Serialisable column descriptors for the inline-editable tables. Defined
 * server-side and passed straight to <EditableTable> (a client component). */

export const CLIENT_EDIT: EditColumn[] = [
  { key: "code", label: "Code", accent: "brand", strong: true },
  { key: "nom", label: "Raison sociale", strong: true },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "tel", label: "Téléphone" },
  { key: "ville", label: "Ville" },
  { key: "pays", label: "Pays" },
  { key: "tva", label: "N° TVA" },
  // Derived from the commandes — shown, never typed.
  { key: "cmd", label: "Cmd", kind: "number", readOnly: true, align: "right" },
  { key: "ca", label: "CA total", kind: "money", readOnly: true, accent: "success" },
];

type CmdChoices = {
  clients: { value: string; label: string }[];
  faconniers: { value: string; label: string }[];
  chaines: { value: string; label: string }[];
};

/* Statut and retard are computed by lib/domain/commande.ts, so they render as
 * badges. What an operator can pin is `statutManuel`, which overrides the
 * derived value; leaving it on « Auto » gives the commande back its autonomy. */
export const commandeEdit = (c: CmdChoices): EditColumn[] => [
  { key: "of", label: "N° OF", accent: "brand", strong: true },
  { key: "modele", label: "Modèle", strong: true },
  { key: "refArticle", label: "Réf." },
  { key: "couleur", label: "Couleur" },
  { key: "client", label: "Client", kind: "select", choices: c.clients },
  { key: "faconnier", label: "Façonnier", kind: "select", choices: c.faconniers },
  { key: "chaineId", label: "Chaîne", kind: "select", choices: c.chaines },
  { key: "qte", label: "Qté", kind: "number", align: "right" },
  { key: "produit", label: "Produit", kind: "number", align: "right" },
  { key: "prixVente", label: "P. vente", kind: "money", align: "right" },
  { key: "prixFacon", label: "P. façon", kind: "money", align: "right" },
  { key: "margeTotale", label: "Marge", kind: "money", readOnly: true, accent: "success", align: "right" },
  { key: "dateExport", label: "Export", kind: "date" },
  { key: "retard", label: "Retard", kind: "badge" },
  { key: "av", label: "Avancement", kind: "progress", readOnly: true },
  { key: "statut", label: "Statut", kind: "badge" },
  { key: "statutManuel", label: "Forcer", kind: "select", choices: STATUT_MANUEL_CHOICES },
];

export const FACONNIER_EDIT: EditColumn[] = [
  { key: "nom", label: "Nom", strong: true },
  { key: "specialite", label: "Spécialité" },
  { key: "contact", label: "Contact" },
  { key: "tel", label: "Téléphone" },
  { key: "prixFacon", label: "Prix réf.", kind: "money", align: "right" },
  { key: "cmd", label: "Cmd", kind: "number", readOnly: true, align: "right" },
  { key: "charge", label: "Charge", kind: "number", readOnly: true, align: "right" },
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
