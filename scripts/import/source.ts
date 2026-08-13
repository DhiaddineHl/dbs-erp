/* Lecture de la sauvegarde PilotPro.
 *
 * Le fichier est un export de localStorage : douze clés dont les valeurs sont
 * elles-mêmes du JSON encodé en chaîne. Rien n'y est typé, les dates y sont des
 * chaînes parfois vides, les nombres parfois des chaînes, et une partie du
 * texte a été abîmée par des allers-retours d'encodage.
 *
 * Ce module fait trois choses et une seule fois : il lit, il répare ce qui est
 * réparable, et il compte ce qui ne l'est pas. */

import { readFileSync } from "node:fs";

/* ─────────── réparation de l'encodage ───────────
 *
 * Symptôme : des suites de U+FFFD (le caractère de remplacement) là où il y
 * avait un caractère non-ASCII. Les suites s'allongent à chaque sauvegarde —
 * le même « ° » apparaît en 2, 4, 6… copies selon son ancienneté.
 *
 * U+FFFD est une perte définitive : l'octet d'origine n'existe plus. On ne
 * « décode » donc rien, on reconnaît des contextes. Les 289 libellés abîmés du
 * grand livre sont tous de la forme « FN⟨run⟩12345 » : entre un N et un
 * chiffre, c'était un « ° ». Le reste tient dans une poignée de mots. */

const RUN = /�+/g;

/** Contextes reconnus, appliqués sur la chaîne où chaque run est réduit à ▮. */
const REGLES: { motif: RegExp; par: string }[] = [
  // N°12345 — numéros de facture, de chèque, de virement (289 occurrences).
  { motif: /N▮(?=\d)/g, par: "N°" },
  { motif: /G▮RARD/g, par: "GÉRARD" },
  { motif: /coup▮/g, par: "coupé" },
  { motif: /factur▮/g, par: "facturé" },
  { motif: /c▮t▮|c▮té/g, par: "côté" },
  // Un run isolé entre deux espaces séparait deux libellés.
  { motif: / ▮ /g, par: " — " },
];

export type ReparationTexte = { avant: string; apres: string; residuel: boolean };

/** Répare une chaîne. `residuel` vaut vrai s'il restait des caractères perdus
 * après application des règles : ils sont retirés, mais comptés. */
export function reparerTexte(s: string): ReparationTexte {
  const avant = s;
  if (!s.includes("�")) return { avant, apres: s, residuel: false };

  let out = s.replace(RUN, "▮");
  for (const r of REGLES) out = out.replace(r.motif, r.par);

  const residuel = out.includes("▮");
  // Ce qui reste est illisible : on l'enlève plutôt que de le laisser passer
  // pour du texte. Le rapport dira combien de fois c'est arrivé.
  if (residuel) out = out.replace(/\s*▮+\s*/g, " ").replace(/\s{2,}/g, " ").trim();

  return { avant, apres: out, residuel };
}

/* ─────────── normalisation ─────────── */

/** Date ISO ou null. Les chaînes vides et les dates aberrantes deviennent null. */
export function dateOuNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const t = Date.parse(`${s}T00:00:00Z`);
  if (Number.isNaN(t)) return null;
  const annee = Number(s.slice(0, 4));
  return annee >= 2000 && annee <= 2100 ? s : null;
}

/** Nombre, en acceptant les chaînes à virgule et les espaces de milliers. */
export function nombre(v: unknown, defaut = 0): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : defaut;
  if (typeof v !== "string") return defaut;
  const n = Number(v.replace(/\s/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : defaut;
}

/** Nombre ou null — pour les colonnes où « non renseigné » n'est pas zéro.
 * Un prix de vente à 0 et un prix de vente inconnu ne se calculent pas pareil. */
export function nombreOuNull(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = nombre(v, NaN);
  return Number.isFinite(n) ? n : null;
}

export const entier = (v: unknown, defaut = 0) => Math.round(nombre(v, defaut));

export const texte = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/* ─────────── formes de la sauvegarde ───────────
 * Décrites telles qu'elles sont dans le fichier, y compris les noms en
 * snake_case et les champs préfixés d'un souligné. */

export type OrderSrc = {
  id: number;
  of_number?: string;
  modele?: string;
  ref_article?: string;
  couleur?: string;
  saison?: string;
  note?: string;
  client?: string;
  faconnier?: string;
  chaine_id?: number;
  qte?: number;
  produit?: number;
  coupe_qte?: number;
  magasin_qte?: number;
  facture_qte?: number;
  tissu_recu?: number;
  prix_vente?: number | string;
  prix_facon?: number | string;
  conso_theo?: number | string;
  conso_reel?: number | string;
  chute_pct?: number | string;
  tailles?: { taille: string; qte: number }[];
  recept_tissu?: string;
  date_export?: string;
  date_export_reel?: string;
  date_livraison?: string;
  exportPrev?: string;
  statut?: string;
  statut_manuel?: string;
  statutLog?: string;
  tissu_libere?: boolean;
  ok_pro?: boolean;
  ok_pro_ref?: string;
  ok_pro_note?: string;
  ok_pro_valide_par?: string;
  date_ok_pro?: string;
  be_statut?: string;
  be_date_envoi?: string;
  coupe_statut?: string;
  coupe_date_plan?: string;
  coupe_date_fin?: string;
  fac_num?: string;
  fac_nums?: string[];
  facturee?: boolean;
  parent_id?: number | null;
  /** Ligne de facturation, pas une commande de production. */
  _pre?: boolean;
  /** "frais" | "avoir" — lignes qui ne sont pas des commandes du tout. */
  _type?: string;
  dt_tds?: { n: number; envoi?: string; retour?: string; verdict?: string; comm?: string; par?: string }[];
  dt_four_lignes?: { designation?: string; prevue?: number; recue?: number; unite?: string }[];
};

export type ClientSrc = {
  id: number; nom: string; code?: string; contact?: string; email?: string;
  tel?: string; ville?: string; pays?: string; tva?: string; adresse?: string;
};

export type FaconnierSrc = { id: number; nom: string; specialite?: string; contact?: string; tel?: string; prix_facon?: number };

export type BrSrc = {
  id: number; numero: string; date: string; cmdId: number; faconnier?: string;
  qte_recue?: number; qte_ok?: number; qte_nc?: number; statut?: string; note?: string;
};

export type CoupeSrc = { id: number; cmdId: number; date: string; qte: number; taille?: string; type?: string; note?: string };

export type TissuSrc = {
  id: number; cmdId: number; date?: string; designation?: string;
  qte_prevue?: number; qte_recue?: number; ctrl?: string; statut?: string; note?: string;
};

export type QcSrc = {
  id: number; of?: string; orderId?: number; date?: string; lot?: number; ref?: string;
  client?: string; modele?: string; couleur?: string; faconnier?: string; controleur?: string;
  statut?: string; verdict?: string; note?: string; qrqcId?: number | null;
  recontroleDe?: number | null;
  defects?: { famille?: string; desc?: string; gravite?: string; nb?: number }[];
  mesures?: { point?: string; taille?: string; spec?: number; tol?: number; mesure?: number }[];
};

export type QrqcSrc = { id: number; date?: string; probleme?: string; cause?: string; cmdId?: number; action?: string; statut?: string };

export type UserSrc = { id: number; login: string; name: string; role: string };

export type ReglementSrc = { id: string; date?: string; montant?: number | string; mode?: string; compte?: string; ref?: string; note?: string };

export type CompteGlSrc = {
  id: number; nom: string; categorie?: string; devise?: string;
  /** Solde enregistré par l'ancienne application — repris pour contrôle seulement. */
  solde?: number;
  transactions?: { date?: string; libelle?: string; debit?: number; credit?: number }[];
};

export type FactureOverrideSrc = {
  id: string; type: string; date?: string; client?: string; total?: number | string;
  poids?: string; mp?: string; pieces?: number;
  lignes?: { modele?: string; desig?: string; ref?: string; couleur?: string; qte?: number; pu?: number; mt?: number }[];
  extras?: { label?: string; mt?: number }[];
};

export type CoutArticleSrc = { lines?: Record<string, { lieu?: string; fac?: string; cout?: string | number }> };

export type GpaoSrc = {
  chaines?: { id: number; nom: string; chef?: string; ouvrieres?: { id: number; nom: string; poste?: string; sam?: number }[] }[];
  modeles?: { id: number; nom: string; ref?: string; client?: string; sam?: number; qte?: number; archive?: boolean }[];
  journees?: Record<string, unknown>[];
};

export type Sauvegarde = {
  orders: OrderSrc[];
  clients: ClientSrc[];
  faconniers: FaconnierSrc[];
  brs: BrSrc[];
  coupes: CoupeSrc[];
  tissus: TissuSrc[];
  qcInspections: QcSrc[];
  qrqcs: QrqcSrc[];
  users: UserSrc[];
  deletedOfs: string[];
  gpao: GpaoSrc;
  grandLivre: CompteGlSrc[];
  overrides: Record<string, FactureOverrideSrc>;
  couts: Record<string, CoutArticleSrc>;
  paiements: Record<string, { reglements?: ReglementSrc[] }>;
  comptesBancaires: string[];
  tauxEur: number;
};

/* ─────────── rapport ───────────
 * Un import silencieux est un import qu'on ne peut pas contrôler. Chaque étape
 * remplit ce rapport, y compris — surtout — de ce qu'elle a refusé de faire. */

export class Rapport {
  private lignes: string[] = [];
  private avertissements: string[] = [];
  reparations = 0;
  pertes = 0;

  etape(titre: string) {
    this.lignes.push(`\n── ${titre}`);
  }

  ok(quoi: string, n: number, detail = "") {
    this.lignes.push(`  ✓ ${String(n).padStart(5)} ${quoi}${detail ? ` — ${detail}` : ""}`);
  }

  info(message: string) {
    this.lignes.push(`  · ${message}`);
  }

  alerte(message: string) {
    this.avertissements.push(message);
    this.lignes.push(`  ⚠ ${message}`);
  }

  /** Répare une chaîne en tenant les compteurs. */
  texte(v: unknown): string {
    const s = texte(v);
    if (!s.includes("�")) return s;
    const r = reparerTexte(s);
    this.reparations++;
    if (r.residuel) this.pertes++;
    return r.apres;
  }

  imprimer() {
    console.log(this.lignes.join("\n"));
    console.log(`\n── encodage`);
    console.log(`  · ${this.reparations} chaîne(s) réparée(s), dont ${this.pertes} avec perte irrécupérable`);
    if (this.avertissements.length) {
      console.log(`\n── ${this.avertissements.length} point(s) à vérifier`);
      for (const a of this.avertissements) console.log(`  ⚠ ${a}`);
    }
  }
}

/* ─────────── lecture ─────────── */

function sousJson<T>(brut: Record<string, string>, cle: string, defaut: T): T {
  const v = brut[cle];
  if (typeof v !== "string" || !v) return defaut;
  try {
    return JSON.parse(v) as T;
  } catch {
    return defaut;
  }
}

export function lireSauvegarde(chemin: string): Sauvegarde {
  const fichier = JSON.parse(readFileSync(chemin, "utf8")) as { keys?: Record<string, string> };
  const cles = fichier.keys ?? {};

  const ds = sousJson<Record<string, unknown>>(cles, "pilotpro_v2", {});
  const gpao = sousJson<GpaoSrc>(cles, "dbs_gpao_prod_v2", {});

  const tableau = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);

  return {
    orders: tableau<OrderSrc>(ds.orders),
    clients: tableau<ClientSrc>(ds.clients),
    faconniers: tableau<FaconnierSrc>(ds.faconniers),
    brs: tableau<BrSrc>(ds.brs),
    coupes: tableau<CoupeSrc>(ds.coupes),
    tissus: tableau<TissuSrc>(ds.tissus),
    qcInspections: tableau<QcSrc>(ds.qcInspections),
    qrqcs: tableau<QrqcSrc>(ds.qrqcs),
    users: tableau<UserSrc>(ds.users),
    deletedOfs: tableau<string>(ds.deletedOfs),
    gpao,
    grandLivre: sousJson<CompteGlSrc[]>(cles, "dbs_grandlivre_2026_v2", []),
    overrides: sousJson<Record<string, FactureOverrideSrc>>(cles, "dbs_overrides_2026", {}),
    couts: sousJson<Record<string, CoutArticleSrc>>(cles, "dbs_couts_articles_2026", {}),
    paiements: sousJson<Record<string, { reglements?: ReglementSrc[] }>>(cles, "dbs_paiements_2026", {}),
    comptesBancaires: sousJson<string[]>(cles, "dbs_comptes_bancaires", []),
    tauxEur: nombre(sousJson<unknown>(cles, "dbs_taux_eur", 3.34), 3.34),
  };
}
