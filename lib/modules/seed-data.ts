/* Single source of the operational modules' demo data (moved out of the page
 * files). Imported only by the seed script; pages read from the DB. */

/** Demo dates are relative so the derived retard stays meaningful over time. */
function dansNJours(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

/* ─────────── refactored entities (real columns, no display strings) ─────────── */

export const CLIENTS = [
  { key: "lacoste_france", code: "CLI-001", nom: "Lacoste France", contact: "M. Dubois", email: "achats@lacoste.fr", tel: "", ville: "Troyes", pays: "France", tva: "" },
  { key: "celio_international", code: "CLI-002", nom: "Celio International", contact: "Mme Martin", email: "prod@celio.com", tel: "", ville: "Saint-Ouen", pays: "France", tva: "" },
  { key: "kiabi", code: "CLI-003", nom: "Kiabi", contact: "M. Bernard", email: "sourcing@kiabi.com", tel: "", ville: "Lille", pays: "France", tva: "" },
  { key: "jules_sa", code: "CLI-004", nom: "Jules SA", contact: "Mme Petit", email: "atelier@jules.com", tel: "", ville: "Roubaix", pays: "France", tva: "" },
];

export const FACONNIERS = [
  { nom: "Atelier Medina", specialite: "Pantalon · Chino", contact: "K. Medina", tel: "+212 6 12 34 56", prixFacon: 4.2 },
  { nom: "Confection Atlas", specialite: "Chemise", contact: "S. Atlas", tel: "+212 6 98 76 54", prixFacon: 3.5 },
  { nom: "TextilPro Sousse", specialite: "Polo · Maille", contact: "H. Ben Ali", tel: "+216 22 33 44", prixFacon: 2.9 },
];

/* Quantities, prices and dates only — statut, retard, marge and avancement are
 * derived by lib/domain/commande.ts, so seeding them would be meaningless. */
export const COMMANDES = [
  { ofNumber: "OF-2026-001", modele: "Chemise Oxford", client: "Lacoste France", faconnier: "", chaine: "Chaîne 3", qte: 1200, produit: 768, prixVente: 12.4, prixFacon: 3.5, dateExport: dansNJours(6), consoTheo: 1.45 },
  { ofNumber: "OF-2026-002", modele: "Pantalon Chino", client: "Celio International", faconnier: "Atelier Medina", chaine: "", qte: 800, produit: 704, prixVente: 15.9, prixFacon: 4.2, dateExport: dansNJours(-2), consoTheo: 1.2 },
  { ofNumber: "OF-2026-003", modele: "Polo piqué", client: "Kiabi", faconnier: "", chaine: "Chaîne 3", qte: 2000, produit: 440, prixVente: 8.6, prixFacon: 2.9, dateExport: dansNJours(14), consoTheo: 0.9 },
  { ofNumber: "OF-2026-004", modele: "Veste denim", client: "Jules SA", faconnier: "", chaine: "", qte: 450, produit: 0, prixVente: 24, prixFacon: 7.8, dateExport: dansNJours(18), consoTheo: 1.8 },
];
