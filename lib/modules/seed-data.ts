/* Single source of the operational modules' demo data (moved out of the page
 * files). Imported only by the seed script; pages read from the DB. */
import type {
  ActionRow,
  AlertRow,
  ArchiveRow,
  BeRow,
  BlRow,
  BrRow,
  CapaciteChaineRow,
  ClientRow,
  CommandeRow,
  CostingRow,
  CoupeRow,
  FaconnierRow,
  FournitureRow,
  GammeRow,
  MagasinRow,
  OfRow,
  OrdoRow,
  QrqcRow,
  TissuRow,
} from "./types";

/* Demo rows carry no `id` (assigned by the DB serial) and commande seed
 * predates the façonnier/chaîne link, so those are stripped here too. */
type Seed<T> = Omit<T, "id">;

export const CLIENTS: Seed<ClientRow>[] = [
  { code: "CLI-001", nom: "Lacoste France", contact: "M. Dubois", email: "achats@lacoste.fr", ville: "Troyes", cmd: 4, ca: "86 400 €" },
  { code: "CLI-002", nom: "Celio International", contact: "Mme Martin", email: "prod@celio.com", ville: "Saint-Ouen", cmd: 3, ca: "52 100 €" },
  { code: "CLI-003", nom: "Kiabi", contact: "M. Bernard", email: "sourcing@kiabi.com", ville: "Lille", cmd: 3, ca: "61 800 €" },
  { code: "CLI-004", nom: "Jules SA", contact: "Mme Petit", email: "atelier@jules.com", ville: "Roubaix", cmd: 2, ca: "48 300 €" },
];

export const COMMANDES: Omit<
  CommandeRow,
  "id" | "faconnier" | "chaineId" | "refArticle" | "couleur" | "tailles" | "receptTissu" | "dateExportReel" | "note"
>[] = [
  { of: "OF-2026-001", modele: "Chemise Oxford", client: "Lacoste France", assigne: "Chaîne 1", qte: 1200, pv: "12,40 €", pf: "3,50 €", marge: "10 680 €", export: "20 juin", retard: ["warning", "J-6"], av: 64, statut: ["brand", "Active"] },
  { of: "OF-2026-002", modele: "Pantalon Chino", client: "Celio Int.", assigne: "Façonnier Medina", qte: 800, pv: "15,90 €", pf: "4,20 €", marge: "9 360 €", export: "14 juin", retard: ["danger", "Retard 2j"], av: 88, statut: ["danger", "⚠ Retard"] },
  { of: "OF-2026-003", modele: "Polo piqué", client: "Kiabi", assigne: "Chaîne 2", qte: 2000, pv: "8,60 €", pf: "2,90 €", marge: "11 400 €", export: "28 juin", retard: ["neutral", "J-14"], av: 22, statut: ["brand", "Active"] },
  { of: "OF-2026-004", modele: "Veste denim", client: "Jules SA", assigne: "—", qte: 450, pv: "24,00 €", pf: "7,80 €", marge: "7 290 €", export: "02 juil", retard: ["neutral", "J-18"], av: 0, statut: ["warning", "Partielle"] },
];

export const FACONNIERS: Seed<FaconnierRow>[] = [
  { nom: "Atelier Medina", spec: "Pantalon · Chino", contact: "K. Medina", tel: "+212 6 12 34 56", prix: "4,20 €", cmd: 3, charge: 2400 },
  { nom: "Confection Atlas", spec: "Chemise", contact: "S. Atlas", tel: "+212 6 98 76 54", prix: "3,50 €", cmd: 2, charge: 1800 },
  { nom: "TextilPro Sousse", spec: "Polo · Maille", contact: "H. Ben Ali", tel: "+216 22 33 44", prix: "2,90 €", cmd: 1, charge: 900 },
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

export const COUPE: Seed<CoupeRow>[] = [
  { of: "OF-2026-001", mc: "Chemise Oxford · Lacoste", qte: 1200, coupee: 1200, planif: "08 juin", fin: "09 juin", statut: ["success", "Coupé"] },
  { of: "OF-2026-003", mc: "Polo piqué · Kiabi", qte: 2000, coupee: 850, planif: "12 juin", fin: "—", statut: ["brand", "En cours"] },
  { of: "OF-2026-005", mc: "Chemisier soie · Jules", qte: 600, coupee: 0, planif: "16 juin", fin: "—", statut: ["warning", "Planifié"] },
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

export const BRS: Seed<BrRow>[] = [
  { br: "BR-2026-001", date: "12 juin", facon: "Atelier Medina", cmd: "OF-2026-002", recu: 704, oknc: "698 / 6", controle: ["success", "Conforme"] },
  { br: "BR-2026-002", date: "13 juin", facon: "Confection Atlas", cmd: "OF-2026-006", recu: 540, oknc: "512 / 28", controle: ["warning", "Écart toléré"] },
  { br: "BR-2026-003", date: "14 juin", facon: "TextilPro Sousse", cmd: "OF-2026-007", recu: 300, oknc: "271 / 29", controle: ["danger", "Non conforme"] },
];

export const MAGASIN: Seed<MagasinRow>[] = [
  { of: "OF-2026-002", mc: "Pantalon Chino · Celio", source: ["purple", "Façonnier"], cmd: 800, recu: 698, statut: ["warning", "Préparation"] },
  { of: "OF-2026-001", mc: "Chemise Oxford · Lacoste", source: ["brand", "Interne"], cmd: 1200, recu: 768, statut: ["brand", "En cours"] },
  { of: "OF-2026-008", mc: "T-shirt col rond · Kiabi", source: ["brand", "Interne"], cmd: 1500, recu: 1500, statut: ["success", "À expédier"] },
];

export const BLS: Seed<BlRow>[] = [
  { bl: "BL-2026-001", date: "10 juin", client: "Lacoste France", lignes: 2, qte: 1200, total: "14 880 €", statut: ["success", "Facturé"] },
  { bl: "BL-2026-002", date: "12 juin", client: "Kiabi", lignes: 1, qte: 1500, total: "12 900 €", statut: ["brand", "Émis"] },
  { bl: "BL-2026-003", date: "13 juin", client: "Celio International", lignes: 3, qte: 800, total: "12 720 €", statut: ["warning", "Brouillon"] },
];

export const ARCHIVES: Seed<ArchiveRow>[] = [
  { of: "OF-2025-118", modele: "Sweat capuche", client: "Jules SA", qte: 900, ca: "21 600 €", marge: "5 040 €", livre: "28 mai", retard: ["success", "À l'heure"] },
  { of: "OF-2025-117", modele: "Chemise lin", client: "Lacoste France", qte: 1100, ca: "16 940 €", marge: "4 290 €", livre: "22 mai", retard: ["success", "2j avance"] },
  { of: "OF-2025-115", modele: "Pantalon cargo", client: "Celio International", qte: 750, ca: "14 250 €", marge: "3 075 €", livre: "19 mai", retard: ["danger", "+3j"] },
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
