import "server-only";
import type { Cloture } from "@/lib/domain/commande";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, tissuMouvement } from "@/lib/db/schema";
import * as tx from "@/lib/domain/tissu";
import * as rl from "@/lib/domain/rouleau";
import { listPreparation } from "@/lib/services/preparation";
import { listLots, type LotRow } from "@/lib/services/tissu";

/* Magasin tissu — vues « commande » et « fin de commande ».
 *
 * Le magasin par lots dit ce qu'il y a en rayon ; ces vues répondent aux
 * questions du point de vue de la COMMANDE et du CLIENT :
 *   - a-t-on assez de tissu pour lancer ? sinon, qu'y a-t-il en stock chez ce
 *     client, et que faut-il lui demander ?
 *   - en fin de commande : reçu, consommé, chute, reste, conso réelle contre
 *     la conso qu'il nous a donnée ;
 *   - ce qui dort encore en magasin et doit lui être rendu. */

const aujourdhui = () => new Date().toISOString().slice(0, 10);

export type PropositionLot = {
  lotId: number;
  identifiant: string;
  couleur: string;
  reference: string;
  libre: number;
  unite: string;
  controle: string;
  raison: string;
  /** Quantité proposée : min(libre, manque). */
  proposee: number;
};

export type MatiereCommandeRow = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  qte: number;
  dateExport: string;
  joursExport: number | null;
  lancee: boolean;
  consoTheo: number | null;
  lots: string[];
  etat: tx.EtatMatiereCommande;
  propositions: PropositionLot[];
  /** Livrée / facturée : rangée par défaut dans l'onglet. */
  cloture: Cloture;
};

/** Toutes les commandes qui portent leur matière (les OF rattachés sont
 * portés par leur porteur), non encore coupées entièrement. */
export async function vueMatiereCommandes(): Promise<{ commandes: MatiereCommandeRow[]; lots: LotRow[] }> {
  const [prepa, lots, mvts] = await Promise.all([
    listPreparation(),
    listLots(),
    db
      .select({ id: tissuMouvement.id, commandeId: tissuMouvement.commandeId, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId })
      .from(tissuMouvement)
      .then(rl.mouvementsEffectifs),
  ]);
  const consoParCommande = new Map<number, number>();
  for (const m of mvts) {
    if (m.commandeId == null) continue;
    const signe = m.sens === "sortie" ? 1 : m.sens === "retour" ? -1 : 0;
    if (signe) consoParCommande.set(m.commandeId, (consoParCommande.get(m.commandeId) ?? 0) + signe * m.quantite);
  }
  const affecteParCommande = new Map<number, { q: number; lots: string[] }>();
  for (const l of lots) {
    for (const a of l.affectations) {
      if (a.commandeId == null) continue;
      const e = affecteParCommande.get(a.commandeId) ?? { q: 0, lots: [] };
      e.q += a.quantite;
      if (!e.lots.includes(l.identifiant)) e.lots.push(l.identifiant);
      affecteParCommande.set(a.commandeId, e);
    }
  }
  // Un lot archivé ou épuisé ne se propose plus.
  const candidats = lots.filter((l) => !l.rangement).map((l) => ({
    id: l.id, identifiant: l.identifiant, client: l.client, reference: l.reference, couleur: l.couleur,
    libre: l.bilan.libre, controle: l.controle, unite: l.unite,
  }));

  const commandes: MatiereCommandeRow[] = [];
  for (const r of prepa) {
    if (r.porteurOf) continue; // matière gérée par le porteur
    const aff = affecteParCommande.get(r.id) ?? { q: 0, lots: [] };
    const conso = consoParCommande.get(r.id) ?? 0;
    const props = tx.proposerLots({ client: r.client, reference: r.refArticle, couleur: r.couleur }, candidats);
    const libreCandidats = props.reduce((s, p) => s + p.libre, 0);
    // Sans lot affecté, on garde la saisie historique de la commande (mode mono).
    const recu = aff.lots.length ? aff.q : r.tissuRecu;
    const etat = tx.etatMatiereCommande(r.besoinTissu, recu, conso, libreCandidats);
    // Une commande déjà entièrement consommée ne demande plus rien.
    if (r.lancee && conso > 0 && etat.manque <= 0.001) continue;
    commandes.push({
      id: r.id,
      of: r.of,
      modele: r.modele,
      refArticle: r.refArticle,
      couleur: r.couleur,
      client: r.client,
      qte: r.qteGroupe,
      dateExport: r.dateExport,
      joursExport: r.joursExport,
      lancee: r.lancee,
      consoTheo: r.consoTheo,
      lots: aff.lots,
      cloture: r.cloture,
      etat,
      propositions: etat.manque > 0
        ? props.slice(0, 4).map((p) => ({
            lotId: p.id, identifiant: p.identifiant, couleur: p.couleur, reference: p.reference, libre: p.libre,
            unite: p.unite, controle: p.controle, raison: p.raison,
            proposee: Math.round(Math.min(p.libre, etat.manque) * 100) / 100,
          }))
        : [],
    });
  }
  // Ce qui bloque d'abord : manque à demander, puis couvrable en stock, par date d'export.
  const rang = { manque: 0, stock: 1, sans_besoin: 2, couvert: 3 };
  commandes.sort((a, b) => rang[a.etat.niveau] - rang[b.etat.niveau] || (a.dateExport || "9999").localeCompare(b.dateExport || "9999"));
  return { commandes, lots };
}

/* ─────────── bilan matière d'une commande ─────────── */

export type BilanMatiereCommande = {
  commande: { id: number; of: string; modele: string; refArticle: string; couleur: string; client: string; saison: string; qte: number; coupeQte: number; produit: number; consoTheo: number | null; chutePct: number | null };
  lots: { identifiant: string; couleur: string; reference: string; unite: string; affecte: number; recu: number; consomme: number; rendu: number; resteLot: number; controle: string; exclusif: boolean; consoDeclaree: number; chuteDeclaree: number }[];
  bilan: tx.BilanMatiere;
};

export async function bilanMatiereCommande(commandeId: number): Promise<BilanMatiereCommande | null> {
  const [row] = await db
    .select({ c: commande, clientNom: client.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(commande.id, commandeId));
  if (!row) return null;
  const c = row.c;
  const lots = (await listLots()).filter((l) => l.affectations.some((a) => a.commandeId === commandeId));

  const lignes = lots.map((l) => {
    const affecte = l.affectations.filter((a) => a.commandeId === commandeId).reduce((s, a) => s + a.quantite, 0);
    /* Un lot réservé à cette SEULE commande lui appartient en entier : ce que
     * le client a livré, c'est tout le lot (pas seulement la part réservée),
     * et tout ce qui en reste ou en a été rendu la concerne. Un lot partagé
     * entre plusieurs commandes ne compte que pour sa part réservée. */
    const exclusif = l.affectations.every((a) => a.commandeId === commandeId);
    let consomme = 0;
    let rendu = 0;
    let consoDeclaree = 0;
    let chuteDeclaree = 0;
    for (const m of l.mouvements) {
      if (m.annule || m.sens === "annulation") continue;
      if (!exclusif && m.commandeId !== commandeId) continue;
      if (m.sens === "sortie") consomme += m.quantite;
      else if (m.sens === "retour") consomme -= m.quantite;
      else if (m.sens === "rendu" || m.sens === "retour_fournisseur") rendu += m.quantite;
      else if (m.sens === "consommation") consoDeclaree += m.quantite;
      else if (m.sens === "chute") chuteDeclaree += m.quantite;
    }
    return {
      identifiant: l.identifiant, couleur: l.couleur, reference: l.reference, unite: l.unite,
      affecte: Math.round(affecte * 100) / 100,
      recu: Math.round((exclusif ? l.bilan.recu : affecte) * 100) / 100,
      consomme: Math.round(Math.max(0, consomme) * 100) / 100,
      rendu: Math.round(rendu * 100) / 100, resteLot: l.bilan.disponible, controle: l.controle, exclusif,
      consoDeclaree: Math.round(consoDeclaree * 100) / 100,
      chuteDeclaree: Math.round(chuteDeclaree * 100) / 100,
    };
  });
  const pieces = c.coupeQte > 0 ? c.coupeQte : c.produit;
  const bilan = tx.bilanMatiere({
    recu: lignes.reduce((s, l) => s + l.recu, 0),
    consomme: lignes.reduce((s, l) => s + l.consomme, 0),
    rendu: lignes.reduce((s, l) => s + l.rendu, 0),
    pieces,
    consoClient: c.consoTheo,
  });
  return {
    commande: {
      id: c.id, of: c.ofNumber, modele: c.modele, refArticle: c.refArticle, couleur: c.couleur, client: row.clientNom ?? "",
      saison: c.saison, qte: c.qte, coupeQte: c.coupeQte, produit: c.produit, consoTheo: c.consoTheo, chutePct: c.chutePct,
    },
    lots: lignes,
    bilan,
  };
}

/* ─────────── reliquats non rendus ─────────── */

/** Un lot est encore « en cours » s'il est réservé pour une commande dont la
 * coupe n'est pas finie, ou s'il est arrivé il y a moins de 60 jours sans
 * affectation (tissu reçu pour une commande à venir). */
const JOURS_LOT_NEUF = 60;

export async function reliquatsTissu(lotsCharges?: LotRow[]): Promise<{ groupes: tx.GroupeReliquats[]; lots: LotRow[] }> {
  const lots = lotsCharges ?? (await listLots());
  const ids = [...new Set(lots.flatMap((l) => l.affectations.map((a) => a.commandeId)).filter((x): x is number => x != null))];
  const cmds = ids.length
    ? await db
        .select({ id: commande.id, qte: commande.qte, coupeQte: commande.coupeQte, factureQte: commande.factureQte, archived: commande.archived, magasinExpedie: commande.magasinExpedie })
        .from(commande)
        .where(inArray(commande.id, ids))
    : [];
  const matiereFinie = new Map(
    cmds.map((c) => [c.id, c.archived || c.magasinExpedie || (c.qte > 0 && (c.coupeQte >= c.qte || c.factureQte >= c.qte))]),
  );
  const jour = Date.parse(`${aujourdhui()}T00:00:00Z`);
  const groupes = tx.reliquats(
    lots.map((l) => {
      const actives = l.affectations.filter((a) => a.commandeId != null && matiereFinie.get(a.commandeId) === false);
      const neuf = !l.affectations.length && l.receptionDate && (jour - Date.parse(`${l.receptionDate}T00:00:00Z`)) / 86_400_000 < JOURS_LOT_NEUF;
      return {
        id: l.id, identifiant: l.identifiant, client: l.client, saison: l.saison, reference: l.reference,
        couleur: l.couleur, unite: l.unite, disponible: l.bilan.disponible, enCours: actives.length > 0 || !!neuf,
      };
    }),
  );
  return { groupes, lots };
}

/* ─────────── bon de retour ─────────── */

export type BonRetourTissu = {
  numero: string;
  date: string;
  par: string;
  client: string;
  /** rendu = reliquat rendu au client · retour_fournisseur = renvoi au fournisseur */
  genre: "rendu" | "retour_fournisseur";
  fournisseur: string;
  motif: string;
  lignes: { identifiant: string; rouleau: string; reference: string; couleur: string; saison: string; quantite: number; unite: string; of: string }[];
};

export async function bonRetourTissu(numero: string): Promise<BonRetourTissu | null> {
  const mvts = await db
    .select()
    .from(tissuMouvement)
    .where(and(inArray(tissuMouvement.sens, ["rendu", "retour_fournisseur"]), eq(tissuMouvement.motif, numero)))
    .orderBy(asc(tissuMouvement.id));
  if (!mvts.length) return null;
  const lots = new Map((await listLots()).map((l) => [l.id, l]));
  const codeRouleau = new Map([...lots.values()].flatMap((l) => l.rouleaux.map((r) => [r.id, r.code] as const)));
  const lignes = mvts.map((m) => {
    const l = lots.get(m.lotId);
    return {
      identifiant: l?.identifiant ?? "?", rouleau: m.rouleauId != null ? (codeRouleau.get(m.rouleauId) ?? "") : "",
      reference: l?.reference ?? "", couleur: l?.couleur ?? "", saison: l?.saison ?? "",
      quantite: m.quantite, unite: l?.unite ?? "m", of: m.commandeLabel,
    };
  });
  const premier = lots.get(mvts[0].lotId);
  return {
    numero,
    date: mvts[0].createdAt.toISOString().slice(0, 10),
    par: mvts[0].createdBy,
    client: premier?.client ?? "",
    genre: mvts[0].sens === "retour_fournisseur" ? "retour_fournisseur" : "rendu",
    fournisseur: premier?.fournisseur ?? "",
    motif: mvts[0].valeurApres,
    lignes,
  };
}

/** Numéros des bons de retour déjà émis (les plus récents d'abord). */
export async function bonsRetourTissu(): Promise<{ numero: string; date: string; lignes: number }[]> {
  const mvts = await db
    .select({ motif: tissuMouvement.motif, createdAt: tissuMouvement.createdAt })
    .from(tissuMouvement)
    .where(inArray(tissuMouvement.sens, ["rendu", "retour_fournisseur"]));
  const m = new Map<string, { numero: string; date: string; lignes: number }>();
  for (const x of mvts) {
    const e = m.get(x.motif) ?? { numero: x.motif, date: x.createdAt.toISOString().slice(0, 10), lignes: 0 };
    e.lignes += 1;
    m.set(x.motif, e);
  }
  return [...m.values()].sort((a, b) => b.numero.localeCompare(a.numero));
}

/** Pour la demande de complément : besoin non couvert des commandes d'un client. */
export async function demandeComplementTissu(clientNom: string) {
  const { commandes } = await vueMatiereCommandes();
  const cle = (s: string) => s.trim().toLowerCase();
  return commandes.filter((c) => cle(c.client) === cle(clientNom) && c.etat.aDemander > 0.001);
}

