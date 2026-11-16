import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, ne, or, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bl, blLigne, client, commande, commandeTds, portailPoint, qcInspection, tissuLot, tissuMouvement, tissuRouleau } from "@/lib/db/schema";
import * as pt from "@/lib/domain/portail";
import * as rl from "@/lib/domain/rouleau";
import { normaliserNom, todayISO } from "@/lib/domain/commande";
import { bilanMatiereCommande, reliquatsTissu, vueMatiereCommandes } from "@/lib/services/matiere-tissu";
import { couvertureTissuParCommande, listLots } from "@/lib/services/tissu";
import { filPortail } from "@/lib/services/messagerie";
import { avancementDeclare } from "@/lib/services/avancement-declare";

/* PORTAIL CLIENT — ce que le client voit, et RIEN d'autre.
 *
 * Toutes les données sortent d'ici, construites champ par champ (liste
 * fermée). Ce fichier ne lit aucune colonne qui nommerait un atelier
 * extérieur, une ligne de production, une personne de l'atelier, un prix ou
 * un résultat financier : un test automatique (lib/domain/portail.test.ts)
 * échoue si l'un de ces mots y apparaît.
 *
 * Même rythme pour toutes les commandes : des quantités cumulées et des
 * dates, jamais le détail heure par heure. */

export type EchantillonClient = {
  id: number;
  /** « Tête de série 2 », « Pièces pour l'OK livraison 1 » */
  libelle: string;
  nature: "tds" | "ok";
  envoi: string;
  transporteur: string;
  suivi: string;
  lien: string;
  verdict: "attente" | "ok" | "refus";
  retour: string;
  commentaire: string;
};

export type ExpeditionClient = { numero: string; date: string; transporteur: string; suivi: string; lien: string; pieces: number };

export type CommandeClient = {
  id: number;
  of: string;
  modele: string;
  reference: string;
  couleur: string;
  saison: string;
  qte: number;
  tailles: { taille: string; qte: number }[];
  exportPrevu: string;
  feu: pt.FeuClient;
  avancement: number;
  etapes: pt.Etape[];
  echantillons: EchantillonClient[];
  expeditions: ExpeditionClient[];
  /** Tissu encore à envoyer pour pouvoir lancer (m), 0 si rien. */
  tissuManquant: number;
};

export type LotClient = {
  identifiant: string;
  reference: string;
  couleur: string;
  bain: string;
  unite: string;
  recuLe: string;
  annonce: number | null;
  mesure: number;
  /** Manque constaté à la réception contre le BL (0 si conforme). */
  manque: number;
  motifs: string[];
  disponible: number;
  reserve: number;
  pour: string[];
};

export type ReliquatClient = { identifiant: string; reference: string; couleur: string; disponible: number; unite: string };

export type VueClient = {
  client: string;
  contact: string;
  aujourdhui: string;
  commandes: CommandeClient[];
  lots: LotClient[];
  reliquats: ReliquatClient[];
  questions: Awaited<ReturnType<typeof filPortail>>;
};

const iso = (d: string | Date | null | undefined) => (d == null ? "" : typeof d === "string" ? d : d.toISOString().slice(0, 10));
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const JOURS_APRES_EXPEDITION = 90;

/** Les commandes d'un client que le portail montre : en cours, ou expédiées
 * depuis moins de 90 jours. Regroupées par commande porteuse (une découpe
 * interne n'apparaît pas : le client voit SA commande). */
async function commandesDuClient(clientId: number) {
  const limite = new Date(Date.now() - JOURS_APRES_EXPEDITION * 86_400_000).toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: commande.id,
      of: commande.ofNumber,
      modele: commande.modele,
      reference: commande.refArticle,
      couleur: commande.couleur,
      saison: commande.saison,
      qte: commande.qte,
      tailles: commande.tailles,
      parentId: commande.parentId,
      lien: commande.lienParent,
      exportPrevu: commande.dateExport,
      exportReel: commande.dateExportReel,
      tissuPrevu: commande.receptTissu,
      tissuReel: commande.tissuDateReelle,
      coupe: commande.coupeQte,
      produit: commande.produit,
      magasin: commande.magasinQte,
      archived: commande.archived,
    })
    .from(commande)
    .where(and(eq(commande.clientId, clientId), or(eq(commande.archived, false), gte(commande.dateExportReel, limite))))
    .orderBy(asc(commande.dateExport), asc(commande.id));
  const parId = new Map(rows.map((r) => [r.id, r]));
  const groupes = new Map<number, typeof rows>();
  for (const r of rows) {
    const tete = r.parentId != null && parId.has(r.parentId) ? r.parentId : r.id;
    groupes.set(tete, [...(groupes.get(tete) ?? []), r]);
  }
  return { groupes, parId };
}

export async function vueClient(acces: { clientId: number | null; nom: string; conversationId: number | null }): Promise<VueClient | null> {
  if (acces.clientId == null) return null;
  const [c] = await db.select({ nom: client.nom }).from(client).where(eq(client.id, acces.clientId));
  if (!c) return null;
  const { groupes, parId } = await commandesDuClient(acces.clientId);
  const ids = [...parId.keys()];
  const aujourdhui = todayISO();

  const [couverture, qc, envois, expeditions, matiere, lots, questions, declare] = await Promise.all([
    couvertureTissuParCommande(),
    ids.length
      ? db
          .select({ commandeId: qcInspection.commandeId, date: qcInspection.date, type: qcInspection.typeControle, statut: qcInspection.statut })
          .from(qcInspection)
          .where(inArray(qcInspection.commandeId, ids))
      : Promise.resolve([]),
    ids.length
      ? db
          .select({
            id: commandeTds.id, commandeId: commandeTds.commandeId, nature: commandeTds.nature, n: commandeTds.n, envoi: commandeTds.envoi,
            retour: commandeTds.retour, verdict: commandeTds.verdict, commentaire: commandeTds.commentaire,
            transporteur: commandeTds.transporteur, suivi: commandeTds.suivi,
          })
          .from(commandeTds)
          .where(and(inArray(commandeTds.commandeId, ids), isNotNull(commandeTds.envoi)))
          .orderBy(desc(commandeTds.nature), asc(commandeTds.n)) // têtes de série d'abord
      : Promise.resolve([]),
    ids.length
      ? db
          .select({ commandeId: blLigne.commandeId, numero: bl.numero, date: bl.date, transporteur: bl.transporteur, suivi: bl.suivi, pieces: blLigne.qteLivree })
          .from(blLigne)
          .innerJoin(bl, eq(blLigne.blId, bl.id))
          .where(and(inArray(blLigne.commandeId, ids), ne(bl.statut, "draft")))
      : Promise.resolve([]),
    vueMatiereCommandes(),
    listLots(),
    acces.conversationId != null ? filPortail(acces.conversationId) : Promise.resolve([]),
    avancementDeclare(ids),
  ]);
  const manquant = new Map(matiere.commandes.map((m) => [m.id, m.etat.aDemander]));

  const commandes: CommandeClient[] = [];
  for (const [teteId, membres] of groupes) {
    const tete = parId.get(teteId)!;
    const mIds = membres.map((m) => m.id);
    const somme = (k: "coupe" | "produit" | "magasin") => membres.reduce((s, m) => s + (m[k] || 0), 0);
    /* Confection et emballage : le plus grand du réalisé et du déclaré
     * contrôlé (lib/services/avancement-declare.ts) — même forme pour toutes
     * les commandes, jamais en recul. */
    const vu = (k: "produit" | "emballe", officiel: (m: (typeof membres)[number]) => number) =>
      membres.reduce((s, m) => s + Math.max(officiel(m) || 0, declare.get(m.id)?.[k] ?? 0), 0);
    // Découpe : la tête porte la quantité promise ; regroupement : la somme.
    const qte = membres.some((m) => m.lien === "regroupement") ? membres.reduce((s, m) => s + m.qte, 0) : tete.qte;
    const tissuRecu =
      membres.map((m) => couverture.get(m.id)?.dateReception || iso(m.tissuReel)).filter(Boolean).sort().at(-1) ?? "";
    const qcs = qc.filter((x) => x.commandeId != null && mIds.includes(x.commandeId));
    const final = qcs.filter((x) => x.type === "final" && x.statut === "cloture").sort((a, b) => iso(a.date).localeCompare(iso(b.date))).at(-1);
    const exps = expeditions.filter((e) => e.commandeId != null && mIds.includes(e.commandeId));
    const expedieLe = iso(tete.exportReel) || exps.map((e) => iso(e.date)).sort().at(-1) || "";
    const faits: pt.FaitsCommandeClient = {
      qte,
      tissuPrevu: iso(tete.tissuPrevu),
      tissuRecu,
      coupe: Math.min(qte, somme("coupe")),
      confection: Math.min(qte, vu("produit", (m) => m.produit)),
      controle: final ? "fait" : qcs.length ? "en_cours" : "",
      controleLe: final ? iso(final.date) : "",
      emballe: Math.min(qte, vu("emballe", (m) => m.magasin)),
      expedieLe,
      exportPrevu: iso(tete.exportPrevu),
    };
    const avancement = qte > 0 ? Math.round((faits.confection / qte) * 100) : 0;
    const parExpedition = new Map<string, ExpeditionClient>();
    for (const e of exps) {
      const x = parExpedition.get(e.numero) ?? { numero: e.numero, date: iso(e.date), transporteur: e.transporteur, suivi: e.suivi, lien: pt.urlSuivi(e.transporteur, e.suivi), pieces: 0 };
      x.pieces += e.pieces || 0;
      parExpedition.set(e.numero, x);
    }
    commandes.push({
      id: tete.id,
      of: tete.of,
      modele: tete.modele,
      reference: tete.reference,
      couleur: tete.couleur,
      saison: tete.saison,
      qte,
      tailles: (tete.tailles ?? []).map((t) => ({ taille: String(t.taille), qte: t.qte })),
      exportPrevu: iso(tete.exportPrevu),
      feu: pt.feuClient({ exportPrevu: iso(tete.exportPrevu), expedieLe, avancement, aujourdhui }),
      avancement,
      etapes: pt.etapesCommande(faits),
      echantillons: envois
        .filter((e) => mIds.includes(e.commandeId))
        .map((e) => ({
          id: e.id,
          libelle: e.nature === "ok" ? `Pièces pour l'OK livraison ${e.n}` : `Tête de série ${e.n}`,
          nature: e.nature === "ok" ? ("ok" as const) : ("tds" as const),
          envoi: iso(e.envoi),
          transporteur: e.transporteur,
          suivi: e.suivi,
          lien: pt.urlSuivi(e.transporteur, e.suivi),
          verdict: e.verdict === "ok" || e.verdict === "refus" ? e.verdict : ("attente" as const),
          retour: iso(e.retour),
          commentaire: e.commentaire,
        })),
      expeditions: [...parExpedition.values()],
      tissuManquant: r2(manquant.get(tete.id) ?? 0),
    });
  }

  /* Son tissu : les lots reçus pour lui (même nom de client au bon de
   * réception), encore en rayon ou arrivés depuis moins de 120 jours. */
  const cleClient = normaliserNom(c.nom);
  const ilYa120 = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const siens = lots.filter((l) => normaliserNom(l.client) === cleClient && (l.bilan.disponible > 0.001 || l.receptionDate >= ilYa120));
  const lotsClient: LotClient[] = siens.map((l) => ({
    identifiant: l.identifiant,
    reference: l.reference,
    couleur: l.couleur,
    bain: l.lotFournisseur,
    unite: l.unite,
    recuLe: l.receptionDate,
    annonce: l.quantiteAnnoncee,
    mesure: r2(l.bilan.recu),
    manque: l.ecarts.manque,
    motifs: l.ecarts.motifs,
    disponible: r2(l.bilan.disponible),
    reserve: r2(l.bilan.reserveRestant),
    pour: [...new Set(l.affectations.filter((a) => a.commandeId != null && parId.has(a.commandeId)).map((a) => parId.get(a.commandeId!)!.of))],
  }));
  const { groupes: rel } = await reliquatsTissu(lots);
  const reliquats: ReliquatClient[] = rel
    .filter((g) => normaliserNom(g.client) === cleClient)
    .flatMap((g) => g.lots.map((l) => ({ identifiant: l.identifiant, reference: l.reference, couleur: l.couleur, disponible: r2(l.disponible), unite: l.unite })));

  /* UN POINT PAR JOUR : la frise (étapes, avancement, feu) est figée à la
   * première consultation du jour, pour toutes les commandes du client. Les
   * envois, expéditions et messages restent en direct : ce sont des
   * événements, pas un rythme de production. */
  const point = await pointDuJour(acces.clientId, aujourdhui, commandes);
  for (const cmd of commandes) {
    const p = point[String(cmd.id)];
    if (p) Object.assign(cmd, p);
  }

  return { client: c.nom, contact: acces.nom, aujourdhui, commandes, lots: lotsClient, reliquats, questions };
}

type Point = Pick<CommandeClient, "etapes" | "avancement" | "feu">;

async function pointDuJour(clientId: number, jour: string, commandes: CommandeClient[]): Promise<Record<string, Point>> {
  const [deja] = await db.select({ d: portailPoint.donnees }).from(portailPoint).where(and(eq(portailPoint.clientId, clientId), eq(portailPoint.jour, jour)));
  const figes = (deja?.d ?? {}) as Record<string, Point>;
  const neufs: Record<string, Point> = {};
  for (const c of commandes) if (!figes[String(c.id)]) neufs[String(c.id)] = { etapes: c.etapes, avancement: c.avancement, feu: c.feu };
  if (!deja) {
    await db.insert(portailPoint).values({ clientId, jour, donnees: neufs }).onConflictDoNothing();
  } else if (Object.keys(neufs).length) {
    // Une commande apparue dans la journée prend son point à ce moment-là.
    await db.update(portailPoint).set({ donnees: { ...figes, ...neufs } }).where(and(eq(portailPoint.clientId, clientId), eq(portailPoint.jour, jour)));
  }
  return { ...neufs, ...figes };
}

/* ═══════════ le passeport d'une commande ═══════════ */

export type PasseportClient = {
  of: string;
  pieces: number;
  recu: number;
  consomme: number;
  rendu: number;
  reste: number;
  theorique: number | null;
  consoReelle: number | null;
  consoClient: number | null;
  ecartConsoPct: number | null;
  lots: { identifiant: string; reference: string; couleur: string; unite: string; recu: number; consomme: number; rendu: number; reste: number }[];
  rouleaux: { code: string; lot: string; bain: string; couleur: string; metres: number; unite: string }[];
};

/** Rouleaux, bains, mètres coupés, consommation réelle face à la sienne,
 * reste et rendu. Vérifie que la commande est bien à CE client. */
export async function passeportCommande(clientId: number, commandeId: number): Promise<PasseportClient | null> {
  const [c] = await db
    .select({ id: commande.id, clientId: commande.clientId, parentId: commande.parentId, of: commande.ofNumber })
    .from(commande)
    .where(eq(commande.id, commandeId));
  if (!c || c.clientId !== clientId) return null;
  const teteId = c.parentId ?? c.id;
  const membres = await db.select({ id: commande.id }).from(commande).where(or(eq(commande.id, teteId), eq(commande.parentId, teteId)));
  const ids = membres.map((m) => m.id);
  const b = await bilanMatiereCommande(teteId);
  if (!b) return null;

  const mvts = await db
    .select({
      id: tissuMouvement.id, sens: tissuMouvement.sens, quantite: tissuMouvement.quantite, annuleId: tissuMouvement.annuleId,
      code: tissuRouleau.code, lot: tissuLot.identifiant, bain: tissuLot.lotFournisseur, couleur: tissuLot.couleur, unite: tissuLot.unite,
    })
    .from(tissuMouvement)
    .innerJoin(tissuLot, eq(tissuMouvement.lotId, tissuLot.id))
    .leftJoin(tissuRouleau, eq(tissuMouvement.rouleauId, tissuRouleau.id))
    .where(and(inArray(tissuMouvement.commandeId, ids), inArray(tissuMouvement.sens, ["sortie", "retour", "annulation"])));
  const parRouleau = new Map<string, PasseportClient["rouleaux"][number]>();
  for (const m of rl.mouvementsEffectifs(mvts)) {
    const cle = m.code ?? `lot ${m.lot}`;
    const x = parRouleau.get(cle) ?? { code: m.code ?? "(lot en bloc)", lot: m.lot, bain: m.bain, couleur: m.couleur, metres: 0, unite: m.unite };
    x.metres = r2(x.metres + (m.sens === "sortie" ? m.quantite : -m.quantite));
    parRouleau.set(cle, x);
  }

  return {
    of: b.commande.of,
    pieces: b.bilan.pieces,
    recu: b.bilan.recu,
    consomme: b.bilan.consomme,
    rendu: b.bilan.rendu,
    reste: b.bilan.reste,
    theorique: b.bilan.theorique,
    consoReelle: b.bilan.consoReelle,
    consoClient: b.bilan.consoClient,
    ecartConsoPct: b.bilan.ecartConsoPct,
    lots: b.lots.map((l) => ({
      identifiant: l.identifiant, reference: l.reference, couleur: l.couleur, unite: l.unite,
      recu: l.recu, consomme: l.consomme, rendu: l.rendu, reste: l.resteLot,
    })),
    rouleaux: [...parRouleau.values()].filter((x) => x.metres > 0.001).sort((a, b) => a.bain.localeCompare(b.bain) || a.code.localeCompare(b.code)),
  };
}

/** La commande (ou une de ses parts) appartient-elle à ce client ? */
export async function commandeDuClient(clientId: number, commandeId: number): Promise<{ id: number; of: string } | null> {
  const [c] = await db.select({ id: commande.id, clientId: commande.clientId, of: commande.ofNumber }).from(commande).where(eq(commande.id, commandeId));
  return c && c.clientId === clientId ? { id: c.id, of: c.of } : null;
}

/** Un envoi d'échantillon d'une commande de ce client, encore en attente. */
export async function envoiDuClient(clientId: number, envoiId: number) {
  const [e] = await db
    .select({ id: commandeTds.id, commandeId: commandeTds.commandeId, nature: commandeTds.nature, n: commandeTds.n, verdict: commandeTds.verdict })
    .from(commandeTds)
    .where(eq(commandeTds.id, envoiId));
  if (!e) return null;
  return (await commandeDuClient(clientId, e.commandeId)) ? e : null;
}
