/* Magasin fournitures — logique pure.
 *
 * DBS travaille en CM : les fournitures sont fournies par le client. Pour
 * quelques clients en CMT, DBS en achète une partie. D'où l'ORIGINE sur chaque
 * ligne : un manque ne se traite pas pareil —
 *   - fourni client → demande de complément au client ;
 *   - acheté DBS    → liste d'achat, regroupée par fournisseur.
 * Tout est en quantités : pas de valeur (la matière n'est pas à DBS). */
import { ENTREPRISE } from "@/lib/entreprise";

export type OrigineFourniture = "client" | "dbs";

export const ORIGINES_FOURNITURE: { value: OrigineFourniture; label: string; court: string }[] = [
  { value: "client", label: "Fourni par le client", court: "Client" },
  { value: "dbs", label: `Acheté par ${ENTREPRISE.nomCourt} (CMT)`, court: ENTREPRISE.nomCourt },
];
export const origineFourniture = (v: string): OrigineFourniture => (v === "dbs" ? "dbs" : "client");

const sansAccents = (s: string) => (s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Clé d'un modèle : sa référence article si elle existe, sinon son nom.
 * Deux commandes du même modèle partagent la même nomenclature. */
export function cleModele(refArticle: string, modele: string): string {
  const base = (refArticle ?? "").trim() || (modele ?? "").trim();
  return sansAccents(base).toLowerCase().replace(/\s+/g, " ").trim();
}

export function libelleModele(refArticle: string, modele: string): string {
  const ref = (refArticle ?? "").trim();
  const nom = (modele ?? "").trim();
  return ref && nom ? `${ref} · ${nom}` : ref || nom || "—";
}

const UNITES_ENTIERES = new Set(["pcs", "pc", "u", "unite", "unité", "unites", "unités", "piece", "pièce", "pieces", "pièces", "cone", "cône", "cones", "cônes", "rouleau", "rouleaux"]);

/** Besoin d'une commande à partir de la nomenclature du modèle :
 * qté par pièce × pièces × (1 + casse %). Arrondi au-dessus — on ne reçoit
 * pas un demi-bouton ; au centième pour une unité continue (m, kg). */
export function prevuNomenclature(qteParPiece: number, pieces: number, cassePct: number, unite = "pcs"): number {
  const brut = Math.max(0, qteParPiece) * Math.max(0, pieces) * (1 + Math.max(0, cassePct) / 100);
  if (UNITES_ENTIERES.has(sansAccents(unite).toLowerCase().trim())) return Math.ceil(brut - 1e-9);
  return Math.ceil(brut * 100 - 1e-9) / 100;
}

export const resteLigne = (l: { qtePrevue: number; qteRecue: number }) => Math.max(0, l.qtePrevue - l.qteRecue);
export const excedentLigne = (l: { qtePrevue: number; qteRecue: number }) => Math.max(0, l.qteRecue - l.qtePrevue);

/* ─────────── manques : demande au client / liste d'achat ─────────── */

export type LigneManque = {
  ligneId: number;
  commandeId: number;
  of: string;
  modele: string;
  client: string;
  designation: string;
  unite: string;
  origine: string;
  fournisseur: string;
  qtePrevue: number;
  qteRecue: number;
  dateExport: string;
};

export type DemandeClient = { client: string; lignes: (LigneManque & { manque: number })[] };
export type AchatFournisseur = {
  fournisseur: string;
  articles: { designation: string; unite: string; qte: number; ofs: string[] }[];
};

export function manques(lignes: LigneManque[]): { demandes: DemandeClient[]; achats: AchatFournisseur[] } {
  const demandes = new Map<string, DemandeClient>();
  const achats = new Map<string, Map<string, AchatFournisseur["articles"][number]>>();
  for (const l of lignes) {
    const manque = Math.round(resteLigne(l) * 100) / 100;
    if (manque <= 0) continue;
    if (origineFourniture(l.origine) === "client") {
      const k = l.client || "Client non renseigné";
      const d = demandes.get(k) ?? { client: k, lignes: [] };
      d.lignes.push({ ...l, manque });
      demandes.set(k, d);
    } else {
      const f = l.fournisseur.trim() || "Fournisseur à définir";
      const parArticle = achats.get(f) ?? new Map();
      const cle = `${sansAccents(l.designation).toLowerCase().trim()}\u0000${l.unite}`;
      const a = parArticle.get(cle) ?? { designation: l.designation || "—", unite: l.unite, qte: 0, ofs: [] };
      a.qte = Math.round((a.qte + manque) * 100) / 100;
      if (l.of && !a.ofs.includes(l.of)) a.ofs.push(l.of);
      parArticle.set(cle, a);
      achats.set(f, parArticle);
    }
  }
  return {
    demandes: [...demandes.values()]
      .map((d) => ({ ...d, lignes: d.lignes.sort((a, b) => (a.dateExport || "9999").localeCompare(b.dateExport || "9999") || a.of.localeCompare(b.of)) }))
      .sort((a, b) => a.client.localeCompare(b.client)),
    achats: [...achats.entries()]
      .map(([fournisseur, m]) => ({ fournisseur, articles: [...m.values()].sort((a, b) => a.designation.localeCompare(b.designation)) }))
      .sort((a, b) => a.fournisseur.localeCompare(b.fournisseur)),
  };
}

/* ─────────── alerte délais ───────────
 *
 * Il n'y a pas de date de lancement planifiée : c'est la date d'export qui
 * cadre. À X jours de l'export, une commande pas encore lancée à qui il manque
 * des fournitures doit être relancée auprès du client. */

export const JOURS_ALERTE_FOURNITURES = 21;
export const JOURS_ALERTE_TISSU = 30;
export const CLE_JOURS_ALERTE = "magasins.joursAlerte";

export function joursAvant(dateIso: string, aujourdhui: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateIso ?? "")) return null;
  const a = Date.parse(`${dateIso}T00:00:00Z`);
  const b = Date.parse(`${aujourdhui}T00:00:00Z`);
  return Math.round((a - b) / 86_400_000);
}

export type NiveauRelance = "retard" | "urgent" | "bientot" | null;

/** retard = export dépassé ; urgent = dans la fenêtre d'alerte ;
 * bientôt = dans la fenêtre + 7 jours (pour anticiper). */
export function niveauRelance(dateExport: string, aujourdhui: string, jours: number): { niveau: NiveauRelance; joursRestants: number | null } {
  const j = joursAvant(dateExport, aujourdhui);
  if (j == null) return { niveau: null, joursRestants: null };
  if (j < 0) return { niveau: "retard", joursRestants: j };
  if (j <= jours) return { niveau: "urgent", joursRestants: j };
  if (j <= jours + 7) return { niveau: "bientot", joursRestants: j };
  return { niveau: null, joursRestants: j };
}

/* ─────────── restes ─────────── */

export type StatutReste = "en_stock" | "reutilise" | "rendu";
export const STATUTS_RESTE: Record<StatutReste, string> = {
  en_stock: "En stock",
  reutilise: "Réutilisé",
  rendu: "Rendu au client",
};
