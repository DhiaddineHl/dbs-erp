import type { Tone } from "@/components/shared/status-badge";
import { cleRapprochement } from "./commande";

/* Flux aval — contrôles de cohérence, machine à états du magasin, et le
 * rapprochement facturation qui referme la boucle commande ↔ facture. */

/* ─────────── réception sous-traitance ─────────── */

export type ControleBr = "ok" | "ecart" | "refuse";

export const CONTROLES_BR: { value: ControleBr; label: string; tone: Tone }[] = [
  { value: "ok", label: "✓ Conforme", tone: "success" },
  { value: "ecart", label: "⚠ Écart", tone: "warning" },
  { value: "refuse", label: "✗ Refusé", tone: "danger" },
];

export type AlerteReception = { niveau: "info" | "warn" | "bloquant"; message: string };

/** Contrôles de cohérence d'une réception, portés de saveBR().
 *
 * Le plus important : on ne peut pas produire plus de pièces qu'il n'en a été
 * coupé. Le client se contente d'un avertissement contournable ; on le garde
 * comme tel — un lâcher de coupe peut avoir été oublié à la saisie. */
export function verifierReception(input: {
  qteCommandee: number;
  dejaProduit: number;
  totalCoupe: number;
  qteRecue: number;
  qteOk: number;
  qteNc: number;
}): AlerteReception[] {
  const alertes: AlerteReception[] = [];
  const { qteCommandee, dejaProduit, totalCoupe, qteRecue, qteOk, qteNc } = input;

  if (qteOk + qteNc > qteRecue) {
    alertes.push({
      niveau: "bloquant",
      message: `Conforme (${qteOk}) + non conforme (${qteNc}) dépasse la quantité reçue (${qteRecue}).`,
    });
  }

  const reste = qteCommandee - dejaProduit;
  const ecart = qteRecue - reste;
  if (ecart > 0) {
    alertes.push({ niveau: "info", message: `${ecart} pièce(s) reçues en plus du reste à produire.` });
  } else if (ecart < 0) {
    alertes.push({ niveau: "info", message: `Il manquera ${Math.abs(ecart)} pièce(s) après cette réception.` });
  }

  if (totalCoupe > 0 && dejaProduit + qteOk > totalCoupe) {
    alertes.push({
      niveau: "warn",
      message:
        `Vous déclarez ${dejaProduit + qteOk} pièces produites au total alors que ${totalCoupe} seulement ont été coupées. ` +
        `On ne peut pas produire plus que ce qui est coupé — vérifiez les lâchers de coupe.`,
    });
  }

  if (qteNc > 0 && qteRecue > 0) {
    const pct = Math.round((qteNc / qteRecue) * 100);
    alertes.push({
      niveau: pct >= 5 ? "warn" : "info",
      message: `${qteNc} pièce(s) non conformes, soit ${pct} % du lot reçu.`,
    });
  }

  return alertes;
}

export const receptionBloquee = (alertes: AlerteReception[]) => alertes.some((a) => a.niveau === "bloquant");

/* ─────────── magasin produits finis ─────────── */

export type EtatMagasin = "vide" | "partiel" | "complet" | "prepare" | "expedie";

export const ETATS_MAGASIN: Record<EtatMagasin, { label: string; tone: Tone }> = {
  vide: { label: "Rien en stock", tone: "neutral" },
  partiel: { label: "Partiel", tone: "warning" },
  complet: { label: "Complet", tone: "success" },
  prepare: { label: "Préparé export", tone: "brand" },
  expedie: { label: "✓ Expédié", tone: "success" },
};

/** L'état avance dans un seul sens : ce qui est expédié l'emporte sur tout. */
export function etatMagasin(c: {
  qte: number;
  magasinQte: number;
  magasinPrepare: boolean;
  magasinExpedie: boolean;
}): EtatMagasin {
  if (c.magasinExpedie) return "expedie";
  if (c.magasinPrepare) return "prepare";
  if (c.magasinQte <= 0) return "vide";
  return c.magasinQte >= c.qte ? "complet" : "partiel";
}

export type StatutBl = "draft" | "sent" | "invoiced";

export const STATUTS_BL: Record<StatutBl, { label: string; tone: Tone }> = {
  draft: { label: "Brouillon", tone: "neutral" },
  sent: { label: "Envoyé", tone: "brand" },
  invoiced: { label: "✓ Facturé", tone: "success" },
};

/** Quantité livrable : ce qui est au magasin, sinon ce qui reste à livrer.
 * Le repli existe parce que toutes les commandes ne passent pas par le stock. */
export function quantiteLivrable(c: { qte: number; produit: number; magasinQte: number }): number {
  if (c.magasinQte > 0) return c.magasinQte;
  const reste = c.qte - c.produit;
  return reste > 0 ? reste : c.qte;
}

/* ─────────── numérotation ─────────── */

const numero = (prefixe: string, sequence: number, largeur: number, annee: number) =>
  `${prefixe}-${annee}-${String(sequence).padStart(largeur, "0")}`;

export const numeroBr = (seq: number, annee = new Date().getFullYear()) => numero("BR", seq, 4, annee);
export const numeroBl = (seq: number, annee = new Date().getFullYear()) => numero("BL", seq, 4, annee);

/** Plus grande séquence utilisée pour l'année, tous préfixes confondus. */
export function derniereSequence(numeros: string[], prefixe: string, annee = new Date().getFullYear()): number {
  const debut = `${prefixe}-${annee}-`;
  let max = 0;
  for (const n of numeros) {
    if (!n.startsWith(debut)) continue;
    const s = parseInt(n.slice(debut.length), 10);
    if (Number.isFinite(s) && s > max) max = s;
  }
  return max;
}

/* ─────────── rapprochement facturation ─────────── */

export type LigneFacturee = { client: string; modele: string; ref: string; qte: number; numero: string };

export type CommandeRapprochable = {
  id: number;
  of: string;
  client: string;
  modele: string;
  refArticle: string;
  qte: number;
  factureQte: number;
  archived: boolean;
  facNums: string[];
};

export type Affectation = {
  commandeId: number;
  of: string;
  modele: string;
  avant: number;
  apres: number;
  qte: number;
  complete: boolean;
  numeros: string[];
};

/** Répartit les quantités facturées sur les commandes qui ne le sont pas encore.
 *
 * Porté de rapprocherFacturation(). Le principe : pour chaque triplet
 * (client, modèle, référence), on totalise ce que les factures disent avoir
 * livré, on retranche ce qui est déjà reporté sur les commandes — archives
 * comprises, sinon on double-compte — et on répartit le reliquat sur les
 * commandes actives, de la plus ancienne à la plus récente.
 *
 * Fonction pure : elle décrit les affectations, elle ne les écrit pas. */
export function calculerRapprochement(
  lignesFacturees: LigneFacturee[],
  commandes: CommandeRapprochable[],
): Affectation[] {
  const totalParCle = new Map<string, number>();
  const numerosParCle = new Map<string, string[]>();

  for (const l of lignesFacturees) {
    if (l.qte <= 0) continue;
    const cle = cleRapprochement(l.client, l.modele, l.ref);
    totalParCle.set(cle, (totalParCle.get(cle) ?? 0) + l.qte);
    const nums = numerosParCle.get(cle) ?? [];
    if (!nums.includes(l.numero)) nums.push(l.numero);
    numerosParCle.set(cle, nums);
  }

  // Ce qui est déjà reporté quelque part, archives incluses.
  const dejaParCle = new Map<string, number>();
  for (const c of commandes) {
    const cle = cleRapprochement(c.client, c.modele, c.refArticle);
    dejaParCle.set(cle, (dejaParCle.get(cle) ?? 0) + c.factureQte);
  }

  const affectations: Affectation[] = [];

  for (const [cle, total] of totalParCle) {
    let reste = total - (dejaParCle.get(cle) ?? 0);
    if (reste <= 0) continue;

    const cibles = commandes
      .filter(
        (c) =>
          !c.archived &&
          c.factureQte < c.qte &&
          cleRapprochement(c.client, c.modele, c.refArticle) === cle,
      )
      .sort((a, b) => a.id - b.id);

    for (const c of cibles) {
      if (reste <= 0) break;
      const manque = c.qte - c.factureQte;
      const pris = Math.min(manque, reste);
      if (pris <= 0) continue;

      const apres = c.factureQte + pris;
      reste -= pris;
      affectations.push({
        commandeId: c.id,
        of: c.of,
        modele: c.modele,
        avant: c.factureQte,
        apres,
        qte: c.qte,
        complete: apres >= c.qte,
        numeros: numerosParCle.get(cle) ?? [],
      });
    }
  }

  return affectations;
}

/* ─────────── prévision export ─────────── */

export type StatutLogistique = "attente" | "pret" | "expedie";

export const STATUTS_LOGISTIQUE: Record<StatutLogistique, { label: string; tone: Tone }> = {
  attente: { label: "En attente", tone: "neutral" },
  pret: { label: "Prêt à expédier", tone: "brand" },
  expedie: { label: "Expédié", tone: "success" },
};

export const estStatutLogistique = (v: string): v is StatutLogistique =>
  v === "attente" || v === "pret" || v === "expedie";

/** Date qui pilote la planification : la prévision saisie l'emporte sur la date
 * contractuelle — c'est justement à ça qu'elle sert. */
export const dateExportPlanifiee = (c: { exportPrev: string; dateExport: string }) =>
  c.exportPrev || c.dateExport || "";

export type UrgenceExport = "depasse" | "imminent" | "proche" | "planifie" | "sansdate";

export const URGENCES_EXPORT: Record<UrgenceExport, { label: string; tone: Tone }> = {
  depasse: { label: "Dépassé", tone: "danger" },
  imminent: { label: "≤ 7 jours", tone: "danger" },
  proche: { label: "≤ 21 jours", tone: "warning" },
  planifie: { label: "Planifié", tone: "brand" },
  sansdate: { label: "Sans date", tone: "neutral" },
};

/** Urgence d'un export à partir du nombre de jours restants. Une commande déjà
 * expédiée n'est jamais urgente, quelle que soit sa date. */
export function urgenceExport(jours: number | null, expedie: boolean): UrgenceExport {
  if (expedie) return "planifie";
  if (jours == null) return "sansdate";
  if (jours < 0) return "depasse";
  if (jours <= 7) return "imminent";
  if (jours <= 21) return "proche";
  return "planifie";
}

/* ─────────── plan façonnier ─────────── */

export type ChargeMois = {
  /** "2026-08" */
  mois: string;
  nbCommandes: number;
  qte: number;
  restant: number;
  ca: number;
};

export type PlanFaconnier = {
  faconnier: string;
  total: { nbCommandes: number; qte: number; restant: number; ca: number };
  parMois: Record<string, ChargeMois>;
};

export type LigneCharge = {
  faconnier: string;
  mois: string;
  qte: number;
  produit: number;
  ca: number;
};

/** Charge mensuelle par façonnier. Le « restant » est ce qui n'est pas encore
 * produit : c'est lui qui dit si un mois est tenable, pas la quantité commandée. */
export function planFaconnier(lignes: LigneCharge[]): PlanFaconnier[] {
  const parFaconnier = new Map<string, PlanFaconnier>();

  for (const l of lignes) {
    const f = parFaconnier.get(l.faconnier) ?? {
      faconnier: l.faconnier,
      total: { nbCommandes: 0, qte: 0, restant: 0, ca: 0 },
      parMois: {} as Record<string, ChargeMois>,
    };
    const restant = Math.max(0, l.qte - l.produit);
    const m = (f.parMois[l.mois] ??= { mois: l.mois, nbCommandes: 0, qte: 0, restant: 0, ca: 0 });
    m.nbCommandes++;
    m.qte += l.qte;
    m.restant += restant;
    m.ca += l.ca;
    f.total.nbCommandes++;
    f.total.qte += l.qte;
    f.total.restant += restant;
    f.total.ca += l.ca;
    parFaconnier.set(l.faconnier, f);
  }

  return [...parFaconnier.values()].sort((a, b) => b.total.restant - a.total.restant);
}

const MOIS_FR = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** "2026-08" → "août 2026". Une chaîne inattendue est rendue telle quelle. */
export function libelleMoisExport(mois: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(mois);
  if (!m) return mois || "sans date";
  return `${MOIS_FR[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}
