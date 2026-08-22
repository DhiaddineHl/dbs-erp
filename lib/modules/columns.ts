/* Column definitions shared by CSV export (header = label) and Excel/CSV import
 * (incoming headers are matched against label OR key, accent/space-insensitive). */
export type Column = { key: string; label: string };

export const CLIENT_COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "nom", label: "Raison sociale" },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "tel", label: "Téléphone" },
  { key: "ville", label: "Ville" },
  { key: "pays", label: "Pays" },
  { key: "tva", label: "N° TVA" },
  { key: "cmd", label: "Commandes" },
  { key: "ca", label: "CA total" },
];

export const COMMANDE_COLUMNS: Column[] = [
  { key: "of", label: "N° OF" },
  /* Rempli sur les sous-commandes seulement. Comme « Retard » ou « Statut »,
   * la colonne est exportée et ignorée à l'import : le rattachement se décide
   * dans l'écran, pas dans un tableur. */
  { key: "parentOf", label: "Sous-commande de" },
  { key: "modele", label: "Modèle" },
  { key: "refArticle", label: "Référence" },
  { key: "couleur", label: "Couleur" },
  { key: "saison", label: "Saison" },
  { key: "client", label: "Client" },
  { key: "faconnier", label: "Façonnier" },
  { key: "qte", label: "Qté" },
  { key: "produit", label: "Produit" },
  { key: "prixVente", label: "P. vente" },
  { key: "prixFacon", label: "P. façon" },
  { key: "margeTotale", label: "Marge" },
  { key: "dateExport", label: "Export" },
  { key: "retard", label: "Retard" },
  { key: "av", label: "Avancement" },
  { key: "statut", label: "Statut" },
];

export const FACONNIER_COLUMNS: Column[] = [
  { key: "nom", label: "Nom" },
  { key: "specialite", label: "Spécialité" },
  { key: "contact", label: "Contact" },
  { key: "tel", label: "Téléphone" },
  { key: "prixFacon", label: "Prix façon réf." },
  { key: "cmd", label: "Commandes" },
  { key: "charge", label: "Charge" },
];

export const norm = (s: string) =>
  s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Rend une cellule sous forme de texte.
 *
 * Les lecteurs de tableur rendent une cellule date en objet Date ; le
 * `String()` par défaut en ferait « Sun Feb 01 2026 00:00:00 GMT+0100 », que
 * plus aucun analyseur de date ne reconnaît. On la ramène donc en AAAA-MM-JJ,
 * la forme que toutes les colonnes `date` attendent. Composantes locales :
 * passer par l'UTC reculerait la date d'un jour. */
function cellule(v: unknown): string {
  if (v == null) return "";
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return "";
    const p = (n: number) => String(n).padStart(2, "0");
    return `${v.getFullYear()}-${p(v.getMonth() + 1)}-${p(v.getDate())}`;
  }
  return String(v).trim();
}

/** Build a {fieldKey: value} record from a raw imported row, matching its
 * headers against each column's label or key (normalized). */
export function mapRow(columns: Column[], raw: Record<string, unknown>): Record<string, string> {
  const byNorm = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) byNorm.set(norm(k), cellule(v));
  const out: Record<string, string> = {};
  for (const c of columns) {
    out[c.key] = byNorm.get(norm(c.label)) ?? byNorm.get(norm(c.key)) ?? "";
  }
  return out;
}
