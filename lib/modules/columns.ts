/* Column definitions shared by CSV export (header = label) and Excel/CSV import
 * (incoming headers are matched against label OR key, accent/space-insensitive). */
export type Column = { key: string; label: string };

export const CLIENT_COLUMNS: Column[] = [
  { key: "code", label: "Code" },
  { key: "nom", label: "Raison sociale" },
  { key: "contact", label: "Contact" },
  { key: "email", label: "Email" },
  { key: "ville", label: "Ville" },
  { key: "cmd", label: "Commandes" },
  { key: "ca", label: "CA total" },
];

export const COMMANDE_COLUMNS: Column[] = [
  { key: "of", label: "N° OF" },
  { key: "modele", label: "Modèle" },
  { key: "client", label: "Client" },
  { key: "assigne", label: "Assigné" },
  { key: "qte", label: "Qté" },
  { key: "pv", label: "P. vente" },
  { key: "pf", label: "P. façon" },
  { key: "marge", label: "Marge" },
  { key: "export", label: "Export" },
  { key: "retard", label: "Retard" },
  { key: "av", label: "Avancement" },
  { key: "statut", label: "Statut" },
];

export const norm = (s: string) =>
  s
    .toString()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");

/** Build a {fieldKey: value} record from a raw imported row, matching its
 * headers against each column's label or key (normalized). */
export function mapRow(columns: Column[], raw: Record<string, unknown>): Record<string, string> {
  const byNorm = new Map<string, string>();
  for (const [k, v] of Object.entries(raw)) byNorm.set(norm(k), v == null ? "" : String(v).trim());
  const out: Record<string, string> = {};
  for (const c of columns) {
    out[c.key] = byNorm.get(norm(c.label)) ?? byNorm.get(norm(c.key)) ?? "";
  }
  return out;
}
