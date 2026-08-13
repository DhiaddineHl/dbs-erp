/* Single source of the operational modules' demo data (moved out of the page
 * files). Imported only by the seed script; pages read from the DB. */
import type {
  ActionRow,
  AlertRow,
  BeRow,
  CapaciteChaineRow,
  CostingRow,
  FournitureRow,
  GammeRow,
  OfRow,
  OrdoRow,
  QrqcRow,
  TissuRow,
} from "./types";

/* Demo rows carry no `id` — the DB serial assigns it. */
type Seed<T> = Omit<T, "id">;

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

export const TISSUS: Seed<TissuRow>[] = [
  { date: "10 juin", cmd: "OF-2026-001", design: "Oxford coton 140g", recue: 1850, prevue: 1900, ecart: ["danger", "-50 m"], controle: ["success", "Conforme"], statut: ["success", "Libéré"] },
  { date: "11 juin", cmd: "OF-2026-002", design: "Gabardine stretch", recue: 1200, prevue: 1200, ecart: ["neutral", "0 m"], controle: ["warning", "À vérifier"], statut: ["warning", "En attente"] },
  { date: "12 juin", cmd: "OF-2026-003", design: "Piqué coton 180g", recue: 2400, prevue: 2350, ecart: ["success", "+50 m"], controle: ["warning", "En cours"], statut: ["warning", "En attente"] },
  { date: "12 juin", cmd: "OF-2026-004", design: "Denim 12oz", recue: 680, prevue: 700, ecart: ["danger", "-20 m"], controle: ["danger", "Non conforme"], statut: ["danger", "Bloqué"] },
];

export const FOURNITURES: Seed<FournitureRow>[] = [
  { date: "10 juin", cmd: "OF-2026-001", type: "Boutons", design: "Nacre 18L · blanc", qte: "14 400 u", controle: ["success", "Conforme"], statut: ["success", "Libérée"] },
  { date: "11 juin", cmd: "OF-2026-002", type: "Fermetures", design: "YKK 18cm · noir", qte: "800 u", controle: ["warning", "À vérifier"], statut: ["warning", "En attente"] },
  { date: "11 juin", cmd: "OF-2026-001", type: "Étiquettes", design: "Tissée marque", qte: "1 200 u", controle: ["success", "Conforme"], statut: ["success", "Libérée"] },
  { date: "12 juin", cmd: "OF-2026-003", type: "Fil", design: "Polyester 120 · assorti", qte: "240 bob", controle: ["warning", "En cours"], statut: ["warning", "En attente"] },
];

export const BE: Seed<BeRow>[] = [
  { of: "OF-2026-001", mc: "Chemise Oxford · Lacoste", envoi: "05 juin", ok: "07 juin", ref: "TDS-001", statut: ["success", "OK PRO reçu"] },
  { of: "OF-2026-003", mc: "Polo piqué · Kiabi", envoi: "10 juin", ok: "—", ref: "TDS-003", statut: ["warning", "En attente"] },
  { of: "OF-2026-005", mc: "Chemisier soie · Jules", envoi: "—", ok: "—", ref: "—", statut: ["neutral", "À préparer"] },
];

export const GAMMES: Seed<GammeRow>[] = [
  { modele: "Chemise Oxford", ops: 14, sam: "612 s", cout: "0,60 €", cap: "47 pcs" },
  { modele: "Pantalon Chino", ops: 18, sam: "845 s", cout: "0,82 €", cap: "34 pcs" },
  { modele: "Polo piqué", ops: 9, sam: "388 s", cout: "0,38 €", cap: "74 pcs" },
];

export const CAPACITE_CHAINES: Seed<CapaciteChaineRow>[] = [
  { ch: "Chaîne 1", eff: 14, min: "6 720", modele: "Chemise Oxford", cap: "47 pcs", cout: "705 €" },
  { ch: "Chaîne 2", eff: 11, min: "5 280", modele: "Polo piqué", cap: "74 pcs", cout: "554 €" },
];

export const COSTING: Seed<CostingRow>[] = [
  { of: "OF-2026-001", modele: "Chemise Oxford", qte: 1200, sam: "612 s", coutP: "0,60 €", coutT: "720 €", pf: "3,50 €", ecart: ["success", "+2,90 €"], delai: "26 j" },
  { of: "OF-2026-003", modele: "Polo piqué", qte: 2000, sam: "388 s", coutP: "0,38 €", coutT: "760 €", pf: "2,90 €", ecart: ["success", "+2,52 €"], delai: "27 j" },
];

export const ORDO: Seed<OrdoRow>[] = [
  { rang: 1, prio: ["danger", "Haute"], of: "OF-2026-002", mc: "Pantalon Chino · Celio", qte: 800, sam: "845 s", charge: "11 267", assigne: "Atelier Medina", export: "14 juin", crit: ["danger", "Critique"] },
  { rang: 2, prio: ["warning", "Moyenne"], of: "OF-2026-001", mc: "Chemise Oxford · Lacoste", qte: 1200, sam: "612 s", charge: "12 240", assigne: "Chaîne 1", export: "20 juin", crit: ["warning", "À surveiller"] },
  { rang: 3, prio: ["neutral", "Normale"], of: "OF-2026-003", mc: "Polo piqué · Kiabi", qte: 2000, sam: "388 s", charge: "12 933", assigne: "Chaîne 2", export: "28 juin", crit: ["success", "OK"] },
];

export const OFS: Seed<OfRow>[] = [
  { of: "OF-2026-001", article: "Chemise Oxford", chaine: "Chaîne 1", qte: 1200, prod: 768, debut: "08 juin", fin: "20 juin" },
  { of: "OF-2026-003", article: "Polo piqué", chaine: "Chaîne 2", qte: 2000, prod: 440, debut: "12 juin", fin: "28 juin" },
  { of: "OF-2026-002", article: "Pantalon Chino", chaine: "Atelier Medina", qte: 800, prod: 704, debut: "06 juin", fin: "14 juin" },
];

export const ALERTS: Seed<AlertRow>[] = [
  { iconName: "Clock", tone: "danger", title: "Commande en retard de livraison", detail: "OF-2026-002 · Celio International — export prévu le 14 juin", level: ["danger", "Critique"] },
  { iconName: "Euro", tone: "danger", title: "Commande à marge négative", detail: "OF-2026-009 · prix de vente inférieur au prix façon", level: ["danger", "Critique"] },
  { iconName: "Layers", tone: "warning", title: "Tissu en attente de contrôle", detail: "4 réceptions bloquent la libération coupe", level: ["warning", "Avertissement"] },
  { iconName: "PencilRuler", tone: "warning", title: "Tête de série sans OK PRO", detail: "OF-2026-003 · en attente de validation client", level: ["warning", "Avertissement"] },
];

export const QRQC: Seed<QrqcRow>[] = [
  { date: "12 juin", pb: "Coutures décalées sur col", cause: "Méthode", cmd: "OF-2026-001", action: "Réglage gabarit + reprise piquage", statut: ["success", "Résolu"] },
  { date: "13 juin", pb: "Taux de retouches élevé", cause: "Main d'œuvre", cmd: "OF-2026-003", action: "Formation ouvrière poste 4", statut: ["warning", "En cours"] },
  { date: "14 juin", pb: "Nuance tissu non conforme", cause: "Matière", cmd: "OF-2026-004", action: "Retour fournisseur + nouvelle réception", statut: ["danger", "Ouvert"] },
];

export const ACTIONS: Seed<ActionRow>[] = [
  { action: "Réétalonner machine boutonnière", resp: "M. Haddad", echeance: "16 juin", prio: ["danger", "Haute"], statut: ["warning", "En cours"] },
  { action: "Auditer fournisseur tissu denim", resp: "Mme Karim", echeance: "20 juin", prio: ["warning", "Moyenne"], statut: ["neutral", "À faire"] },
  { action: "Mettre à jour gamme Polo piqué", resp: "Bureau Méthodes", echeance: "12 juin", prio: ["warning", "Moyenne"], statut: ["danger", "En retard"] },
  { action: "Formation qualité poste assemblage", resp: "RH Atelier", echeance: "25 juin", prio: ["neutral", "Basse"], statut: ["success", "Clôturée"] },
];
