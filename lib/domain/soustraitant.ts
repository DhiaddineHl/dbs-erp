/* PORTAIL SOUS-TRAITANT — règles pures (aucun accès base).
 *
 * Le sous-traitant DÉCLARE ; l'usine VALIDE. Rien de ce qui est calculé ici ne
 * touche `commande.produit` : la production reste écrite par
 * lib/services/avancement.ts, à partir des BR que VOUS validez. Les
 * déclarations servent à voir venir (avancement, date de fin, alertes) et à
 * mesurer la fiabilité de chaque atelier. */

export type Cumuls = { lance: number; produit: number; emballe: number };
export type Ligne = { taille: string; premier: number; second: number };

/* ═══════════ réglages ═══════════ */

/** Montrer le nom du client au sous-traitant (non par défaut). */
export const CLE_MONTRER_CLIENT = "soustraitant.montrerClient";
/** Jours entre « livré chez nous » et la date d'export (contrôle, emballage, transport). */
export const CLE_DELAI_RETOUR = "soustraitant.delaiRetourJours";
export const DELAI_RETOUR_DEFAUT = 7;
/** Au-delà, « sans nouvelle » (jours sans saisie du soir sur une commande en cours). */
export const JOURS_SANS_NOUVELLE = 2;

/* ═══════════ dates ═══════════ */

const jour = (iso: string) => new Date(`${iso.slice(0, 10)}T00:00:00Z`).getTime();
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
export const ajouterJours = (d: string, n: number) => iso(jour(d) + n * 86_400_000);
export const joursEntre = (du: string, au: string) => Math.round((jour(au) - jour(du)) / 86_400_000);

/** Date à laquelle la marchandise doit être chez nous : export − délai. */
export function dateALivrer(dateExport: string | null, delai: number): string | null {
  if (!dateExport) return null;
  return ajouterJours(dateExport, -Math.max(0, Math.round(delai || 0)));
}

/* ═══════════ saisie du soir ═══════════ */

const entierPositif = (x: unknown) => {
  const n = Number(x);
  return Number.isFinite(n) && n >= 0 && Math.round(n) === n;
};

/** Refus (bloquant) d'une saisie : des cumuls impossibles. Les cumuls
 * s'emboîtent — on n'emballe pas plus qu'on n'a produit, on ne produit pas
 * plus qu'on n'a lancé. */
export function refusDeclaration(s: Cumuls): string | null {
  if (![s.lance, s.produit, s.emballe].every(entierPositif)) return "Des nombres entiers, sans virgule (0 si rien).";
  if (s.produit > s.lance) return `Produit (${s.produit}) ne peut pas dépasser lancé (${s.lance}).`;
  if (s.emballe > s.produit) return `Emballé (${s.emballe}) ne peut pas dépasser produit (${s.produit}).`;
  return null;
}

/** Alertes (non bloquantes), gardées avec la saisie et montrées au bureau.
 *  · lancé au-delà de ce qui a été envoyé / coupé ;
 *  · un cumul qui BAISSE (correction ? erreur ?) ;
 *  · un bond invraisemblable en une journée. */
export function alertesDeclaration(v: { saisie: Cumuls; precedent: Cumuls | null; reference: number; joursDepuis?: number }): string[] {
  const a: string[] = [];
  const { saisie: s, precedent: p, reference } = v;
  if (reference > 0 && s.lance > reference) a.push(`Lancé ${s.lance} pour ${reference} pièces envoyées / coupées.`);
  if (p) {
    for (const [k, lib] of [["lance", "Lancé"], ["produit", "Produit"], ["emballe", "Emballé"]] as const) {
      if (s[k] < p[k]) a.push(`${lib} baisse : ${p[k]} → ${s[k]}.`);
    }
    const j = Math.max(1, v.joursDepuis ?? 1);
    const bond = s.produit - p.produit;
    if (reference > 0 && bond > Math.max(50, 0.5 * reference) * j) a.push(`+${bond} produites d'un coup : à vérifier.`);
  }
  return a;
}

/** « Sans nouvelle » : une commande en cours sans saisie depuis N jours. */
export function sansNouvelle(derniere: string | null, aujourdhui: string, jours = JOURS_SANS_NOUVELLE): boolean {
  if (!derniere) return true;
  return joursEntre(derniere, aujourdhui) >= jours;
}

/** Date de fin estimée au rythme des 7 derniers jours de saisie (produit).
 * null si pas assez d'historique ou si rien n'avance. */
export function dateFinEstimee(historique: { jour: string; produit: number }[], total: number, aujourdhui: string): string | null {
  const h = [...historique].sort((a, b) => a.jour.localeCompare(b.jour));
  if (h.length < 2 || total <= 0) return null;
  const dernier = h[h.length - 1];
  if (dernier.produit >= total) return dernier.jour;
  const depuis = ajouterJours(dernier.jour, -7);
  const premier = h.find((x) => x.jour >= depuis && x.jour < dernier.jour) ?? h[h.length - 2];
  const jours = joursEntre(premier.jour, dernier.jour);
  const rythme = jours > 0 ? (dernier.produit - premier.produit) / jours : 0;
  if (rythme <= 0) return null;
  const fin = ajouterJours(dernier.jour, Math.ceil((total - dernier.produit) / rythme));
  return fin < aujourdhui ? aujourdhui : fin;
}

/** Ce que le CLIENT voit d'une confection déclarée : jamais plus que lancé ni
 * que la quantité de l'OF, et jamais en recul (le maximum atteint reste). */
export function confectionDeclaree(declarations: Cumuls[], plafond: number): number {
  let m = 0;
  for (const d of declarations) m = Math.max(m, Math.min(d.produit, d.lance, plafond > 0 ? plafond : d.produit));
  return Math.max(0, Math.round(m));
}

/* ═══════════ livraison ═══════════ */

export const MOTIFS_LIVRAISON = [
  { value: "partielle", label: "Livraison partielle — le reste suit" },
  { value: "manquant", label: "Pièces manquantes" },
  { value: "defaut", label: "Pièces en défaut (2e choix)" },
  { value: "surplus", label: "Pièces en plus" },
  { value: "autre", label: "Autre (préciser)" },
] as const;
export const estMotifLivraison = (m: string) => MOTIFS_LIVRAISON.some((x) => x.value === m);

export const totalLignes = (l: Ligne[]) => l.reduce((s, x) => ({ premier: s.premier + x.premier, second: s.second + x.second }), { premier: 0, second: 0 });

export type ComparaisonTaille = { taille: string; attendu: number; dejaLivre: number; livre: number; premier: number; second: number; ecart: number };

/** Taille par taille : attendu (coupé, sinon plan), déjà livré, livré
 * maintenant (1er + 2e choix) et écart du cumul avec l'attendu. */
export function comparerAuPlan(lignes: Ligne[], attendu: Record<string, number>, dejaLivre: Record<string, number> = {}): ComparaisonTaille[] {
  const tailles = [...new Set([...Object.keys(attendu), ...lignes.map((l) => l.taille)])];
  return tailles.map((t) => {
    const l = lignes.find((x) => x.taille === t);
    const premier = l?.premier ?? 0;
    const second = l?.second ?? 0;
    const a = Math.round(attendu[t] ?? 0);
    const d = Math.round(dejaLivre[t] ?? 0);
    return { taille: t, attendu: a, dejaLivre: d, livre: premier + second, premier, second, ecart: d + premier + second - a };
  });
}

/** Lignes propres (entiers ≥ 0, tailles connues, sans ligne vide). */
export function lignesPropres(lignes: Ligne[], tailles: string[]): Ligne[] {
  const out: Ligne[] = [];
  for (const l of lignes ?? []) {
    if (!tailles.includes(l.taille)) throw new Error(`Taille inconnue : ${l.taille}.`);
    if (!entierPositif(l.premier) || !entierPositif(l.second)) throw new Error("Des nombres entiers, sans virgule (0 si rien).");
    if (l.premier + l.second > 0) out.push({ taille: l.taille, premier: l.premier, second: l.second });
  }
  return out;
}

/** Refus d'une livraison : rien à livrer, ou un écart sans motif. L'écart en
 * lui-même ne bloque pas (livraison partielle, manquant…) : il s'explique. */
export function refusLivraison(lignes: Ligne[], comparaison: ComparaisonTaille[], motif: string, note: string): string | null {
  const t = totalLignes(lignes);
  if (t.premier + t.second <= 0) return "Indiquez au moins une pièce livrée.";
  const ecart = comparaison.some((c) => c.ecart !== 0);
  if (ecart && !motif) return "Les quantités ne tombent pas juste avec la coupe : choisissez un motif.";
  if (motif && !estMotifLivraison(motif)) return "Motif inconnu.";
  if (motif === "autre" && !note.trim()) return "Précisez le motif en quelques mots.";
  return null;
}

/** Le BR qui naît de la livraison : 1er choix = conforme (stock, payé), 2e
 * choix = non conforme (ni compté, ni payé). */
export function versBr(recues: Ligne[]): { qteRecue: number; qteOk: number; qteNc: number; controle: "ok" | "ecart" } {
  const t = totalLignes(recues);
  return { qteRecue: t.premier + t.second, qteOk: t.premier, qteNc: t.second, controle: t.second > 0 ? "ecart" : "ok" };
}

/** Ce que l'atelier peut facturer pour cette livraison : 1er choix × prix de façon. */
export const montantDu = (premier: number, prixFacon: number | null) => Math.round(premier * (prixFacon ?? 0) * 100) / 100;

/** Écart annoncé / compté à l'arrivée, taille par taille (pour la fiabilité). */
export function ecartAnnonce(annonce: Ligne[], recu: Ligne[]): { taille: string; annonce: number; recu: number; ecart: number }[] {
  const tailles = [...new Set([...annonce.map((l) => l.taille), ...recu.map((l) => l.taille)])];
  const tot = (ls: Ligne[], t: string) => ls.filter((l) => l.taille === t).reduce((s, l) => s + l.premier + l.second, 0);
  return tailles.map((t) => ({ taille: t, annonce: tot(annonce, t), recu: tot(recu, t), ecart: tot(recu, t) - tot(annonce, t) }));
}

/** Fiabilité d'un atelier sur ses livraisons reçues : part des pièces
 * annoncées qui étaient vraiment là, et nombre de livraisons justes. */
export function fiabilite(livraisons: { annonce: Ligne[]; recu: Ligne[] }[]): { nb: number; justes: number; annonce: number; ecartPieces: number; pct: number | null } {
  let justes = 0;
  let annonce = 0;
  let ecartPieces = 0;
  for (const l of livraisons) {
    const e = ecartAnnonce(l.annonce, l.recu);
    const somme = e.reduce((s, x) => s + Math.abs(x.ecart), 0);
    if (somme === 0) justes++;
    ecartPieces += somme;
    annonce += e.reduce((s, x) => s + x.annonce, 0);
  }
  const pct = annonce > 0 ? Math.max(0, Math.round((1 - ecartPieces / annonce) * 100)) : null;
  return { nb: livraisons.length, justes, annonce, ecartPieces, pct };
}

/* ═══════════ tissu chez le sous-traitant ═══════════ */

export const ETATS_RECEPTION = ["recu", "ecart", "manquant"] as const;
export type EtatReception = (typeof ETATS_RECEPTION)[number];
export const estEtatReception = (e: string): e is EtatReception => (ETATS_RECEPTION as readonly string[]).includes(e);

/** Rapport de coupe : chaque rouleau déclaré doit tomber juste à 1 % près
 * (consommé + chute + reste ≈ mètres reçus). */
export function controleRouleauRapport(r: { consomme: number; chute: number; reste: number }, recu: number): string | null {
  if (![r.consomme, r.chute, r.reste].every((x) => Number.isFinite(x) && x >= 0)) return "Mètres positifs attendus.";
  const somme = r.consomme + r.chute + r.reste;
  if (recu > 0 && Math.abs(somme - recu) > Math.max(0.5, recu * 0.01)) {
    return `Consommé + chute + reste = ${Math.round(somme * 100) / 100} m pour ${Math.round(recu * 100) / 100} m reçus.`;
  }
  return null;
}
