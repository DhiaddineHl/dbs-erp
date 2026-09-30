import type { EditColumn } from "@/components/shared/editable-table";
import { STATUTS_MANUELS, statutLabel } from "@/lib/domain/commande";

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
  { key: "caLibelle", label: "CA total HT", kind: "readonly", readOnly: true, accent: "success" },
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
