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

/** Rend une saisie de réception cohérente AVANT enregistrement.
 *
 *  - « conforme » laissé vide = reçu − non conforme (et non plus « tout le
 *    reçu » : un lot à 20 NC n'entrait jamais à 20 NC) ;
 *  - « 0 » conforme est une vraie valeur : un lot entièrement refusé n'entre
 *    plus au stock (avant, 0 était remplacé par la quantité reçue) ;
 *  - contrôle « refusé » = rien n'entre au stock, tout est non conforme. */
export function normaliserReception(v: {
  qteRecue: number;
  /** null = champ laissé vide. */
  qteOk: number | null;
  qteNc: number;
  controle: string;
}): { qteRecue: number; qteOk: number; qteNc: number; controle: ControleBr } {
  const recue = Math.max(0, Math.round(v.qteRecue));
  const controle: ControleBr = v.controle === "refuse" || v.controle === "ecart" ? v.controle : "ok";
  if (controle === "refuse") return { qteRecue: recue, qteOk: 0, qteNc: recue, controle };
  const nc = Math.max(0, Math.round(v.qteNc));
  const ok = v.qteOk === null ? Math.max(0, recue - nc) : Math.max(0, Math.round(v.qteOk));
  return { qteRecue: recue, qteOk: ok, qteNc: nc, controle: nc > 0 && controle === "ok" ? "ecart" : controle };
}

/* ─────────── avancement : UNE formule pour « produit » ───────────
 *
 * Avant, deux modules écrivaient `commande.produit` chacun avec sa règle : la
 * GPAO y mettait sa production interne, puis la moindre entrée en stock ou
 * coupe la remplaçait par la seule somme des réceptions façonniers — une
 * commande interne retombait à 0. Désormais :
 *
 *   produit = production GPAO des modèles liés
 *           + pièces conformes reçues des façonniers
 *           + non conformes réintégrées après retouche
 *   (plafonné à la quantité commandée) */
export function produitCommande(v: { qte: number; gpao: number; brOk: number; reprises: number }): number {
  const total = Math.max(0, v.gpao) + Math.max(0, v.brOk) + Math.max(0, v.reprises);
  return Math.min(total, Math.max(0, v.qte));
}

/** Non conformes d'un BR encore sans décision (ni retouchées, ni rebutées). */
export const ncEnAttente = (qteNc: number, traitees: number) => Math.max(0, qteNc - traitees);

/** Origines d'un mouvement de stock produits finis. */
export type OrigineMouvement = "interne" | "br" | "retouche" | "rebut";
export const ORIGINES_MOUVEMENT: Record<OrigineMouvement, { label: string; entreStock: boolean }> = {
  interne: { label: "Production interne", entreStock: true },
  br: { label: "Réception façonnier", entreStock: true },
  retouche: { label: "NC réintégrées après retouche", entreStock: true },
  rebut: { label: "NC mises au rebut", entreStock: false },
};

/* ─────────── magasin produits finis ─────────── */

export type EtatMagasin = "vide" | "partiel" | "complet" | "prepare" | "expediePartiel" | "expedie";

export const ETATS_MAGASIN: Record<EtatMagasin, { label: string; tone: Tone }> = {
  vide: { label: "Rien en stock", tone: "neutral" },
  partiel: { label: "Partiel", tone: "warning" },
  complet: { label: "Complet", tone: "success" },
  prepare: { label: "Préparé export", tone: "brand" },
  expediePartiel: { label: "Expédié en partie", tone: "info" },
  expedie: { label: "✓ Expédié", tone: "success" },
};

/** Stock physique : ce qui est entré moins ce qui est parti sur un BL envoyé. */
export const stockPhysique = (c: { magasinQte: number; expedieQte?: number }) =>
  Math.max(0, c.magasinQte - (c.expedieQte ?? 0));

/** L'état avance dans un seul sens : ce qui est expédié l'emporte sur tout.
 * Une commande n'est « expédiée » que quand toute la quantité est partie (ou
 * qu'on l'a soldée à la main) : on peut livrer en plusieurs fois. */
export function etatMagasin(c: {
  qte: number;
  magasinQte: number;
  expedieQte?: number;
  magasinPrepare: boolean;
  magasinExpedie: boolean;
}): EtatMagasin {
  const expedie = c.expedieQte ?? 0;
  if (c.magasinExpedie || (c.qte > 0 && expedie >= c.qte)) return "expedie";
  // Déjà livrée en partie : c'est l'information utile, sauf si un nouveau lot
  // est en stock et préparé pour le prochain BL.
  if (expedie > 0 && (!c.magasinPrepare || stockPhysique(c) <= 0)) return "expediePartiel";
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

/** Quantité livrable : le stock physique, sinon ce qui reste à livrer.
 * Le repli existe parce que toutes les commandes ne passent pas par le stock. */
export function quantiteLivrable(c: { qte: number; produit: number; magasinQte: number; expedieQte?: number }): number {
  const expedie = c.expedieQte ?? 0;
  if (c.magasinQte > 0) return stockPhysique(c);
  const reste = c.qte - Math.max(c.produit, expedie);
  return reste > 0 ? reste : Math.max(0, c.qte - expedie);
}

/** Une commande est entièrement livrée quand le cumul des BL envoyés couvre la quantité. */
export const livraisonComplete = (qte: number, expedieQte: number) => qte > 0 && expedieQte >= qte;

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

export type CommandeConfiee = {
  of: string;
  modele: string;
  ref: string;
  client: string;
  mois: string;
  qte: number;
  produit: number;
  restant: number;
  ca: number;
};

export type PlanFaconnier = {
  faconnier: string;
  total: { nbCommandes: number; qte: number; restant: number; ca: number };
  parMois: Record<string, ChargeMois>;
  /** Détail : la liste des commandes confiées à ce façonnier. */
  commandes: CommandeConfiee[];
};

export type LigneCharge = {
  faconnier: string;
  mois: string;
  qte: number;
  produit: number;
  ca: number;
  /** Détail commande (pour la liste des confiées). */
  of?: string;
  modele?: string;
  ref?: string;
  client?: string;
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
      commandes: [] as CommandeConfiee[],
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
    f.commandes.push({
      of: l.of ?? "",
      modele: l.modele ?? "",
      ref: l.ref ?? "",
      client: l.client ?? "",
      mois: l.mois,
      qte: l.qte,
      produit: l.produit,
      restant,
      ca: l.ca,
    });
    parFaconnier.set(l.faconnier, f);
  }

  // Détail trié par mois puis par reste décroissant (le plus urgent d'abord).
  for (const f of parFaconnier.values()) {
    f.commandes.sort(
      (a, b) => (a.mois || "9999").localeCompare(b.mois || "9999") || b.restant - a.restant,
    );
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

/* ─────────── saisie mobile du magasinier (QR) ───────────
 *
 * Ce que le téléphone propose de réceptionner, sans rien avoir à chercher :
 *   - production interne : ce que les chaînes GPAO ont sorti et qui n'est pas
 *     encore entré au magasin (la quantité est pré-remplie) ;
 *   - façonniers : les commandes sous-traitées dont il reste des pièces à
 *     recevoir, rangées par façonnier. */

/** Rôles autorisés à saisir au magasin (entrées, réceptions, BL). */
export const ROLES_SAISIE_MAGASIN = ["admin", "resp", "chef", "magasin"];

export type CommandeReceptionnable = {
  id: number;
  of: string;
  modele: string;
  couleur: string;
  client: string;
  faconnier: string;
  chaine: string;
  qte: number;
  produit: number;
  produitGpao: number;
  entreesInternes: number;
  etatMagasin: EtatMagasin;
};

export const aEntrerInterne = (c: Pick<CommandeReceptionnable, "produitGpao" | "entreesInternes">) =>
  Math.max(0, c.produitGpao - c.entreesInternes);

export const resteFaconnier = (c: Pick<CommandeReceptionnable, "qte" | "produit">) => Math.max(0, c.qte - c.produit);

export type ListesReception<T> = {
  /** Production interne : d'abord ce qui attend d'être entré. */
  internes: (T & { aEntrer: number })[];
  /** Façonniers : commandes avec un reste, groupées par façonnier. */
  faconniers: { faconnier: string; commandes: (T & { reste: number })[] }[];
};

export function listesReception<T extends CommandeReceptionnable>(commandes: T[]): ListesReception<T> {
  const actives = commandes.filter((c) => c.etatMagasin !== "expedie");

  const internes = actives
    .filter((c) => !c.faconnier && (c.chaine || c.produitGpao > 0))
    .map((c) => ({ ...c, aEntrer: aEntrerInterne(c) }))
    .filter((c) => c.aEntrer > 0 || c.produit < c.qte)
    .sort((a, b) => b.aEntrer - a.aEntrer || a.of.localeCompare(b.of));

  const parFaconnier = new Map<string, (T & { reste: number })[]>();
  for (const c of actives) {
    if (!c.faconnier) continue;
    const reste = resteFaconnier(c);
    if (reste <= 0) continue;
    const g = parFaconnier.get(c.faconnier) ?? [];
    g.push({ ...c, reste });
    parFaconnier.set(c.faconnier, g);
  }
  const faconniers = [...parFaconnier.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([faconnier, cmds]) => ({ faconnier, commandes: cmds.sort((a, b) => a.of.localeCompare(b.of)) }));

  return { internes, faconniers };
}
