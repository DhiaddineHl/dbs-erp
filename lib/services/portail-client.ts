import "server-only";
import { and, asc, desc, eq, inArray, isNotNull, ne, or, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { bl, blLigne, client, commande, commandeTds, exportPrevision, exportPrevisionLigne, magasinMouvement, qcInspection, tissuLot, tissuMouvement, tissuRouleau } from "@/lib/db/schema";
import * as pt from "@/lib/domain/portail";
import * as rl from "@/lib/domain/rouleau";
import { normaliserNom, todayISO } from "@/lib/domain/commande";
import { bilanMatiereCommande, reliquatsTissu, vueMatiereCommandes } from "@/lib/services/matiere-tissu";
import { couvertureTissuParCommande, listLots } from "@/lib/services/tissu";
import { filPortail } from "@/lib/services/messagerie";
import { avancementDeclare } from "@/lib/services/avancement-declare";
import { lignesCoupeValides } from "@/lib/services/coupe";
import * as pf from "@/lib/domain/performance-client";

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
  /** Partie, livrée ou rangée chez nous : va dans « Archives ». */
  archivee: boolean;
  /** Dates réelles des grandes étapes (cycle de vie, respect des délais). */
  jalons: pf.Jalons;
  cycle: pf.Cycle;
  /** Traçabilité : chaque fait daté, du plus ancien au plus récent. */
  evenements: pf.Evenement[];
  premiereTdsOk: boolean | null;
  controleOk: boolean | null;
  piecesLivrees: number;
};

/** La prévision d'export publiée (photo du week-end), pour CE client. */
export type PrevisionClient = {
  debut: string;
  fin: string;
  publieLe: string;
  commentaire: string;
  lignes: {
    of: string;
    modele: string;
    reference: string;
    couleur: string;
    date: string;
    qte: number;
    qteCommande: number;
    etat: string;
    changement: string;
    dateAvant: string;
    qteAvant: number | null;
  }[];
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
  /** Heure exacte du calcul (l'avancement est en direct). */
  misAJour: string;
  commandes: CommandeClient[];
  lots: LotClient[];
  reliquats: ReliquatClient[];
  questions: Awaited<ReturnType<typeof filPortail>>;
  prevision: PrevisionClient | null;
  /** Statistiques sur ses commandes parties (12 derniers mois). */
  performance: pf.StatsPerformance;
};

const iso = (d: string | Date | null | undefined) => (d == null ? "" : typeof d === "string" ? d : d.toISOString().slice(0, 10));
const r2 = (n: number) => Math.round(n * 100) / 100 + 0;
const nb = (n: number) => n.toLocaleString("fr-FR");
const JOURS_ARCHIVES = 365;

/** Les commandes d'un client que le portail montre : en cours, et ses
 * archives (parties, livrées ou rangées) des 12 derniers mois. Regroupées par commande porteuse (une découpe
 * interne n'apparaît pas : le client voit SA commande). */
async function commandesDuClient(clientId: number) {
  const depuis = new Date(Date.now() - JOURS_ARCHIVES * 86_400_000);
  const limite = depuis.toISOString().slice(0, 10);
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
      creeLe: commande.createdAt,
    })
    .from(commande)
    .where(and(eq(commande.clientId, clientId), or(eq(commande.archived, false), gte(commande.dateExportReel, limite), gte(commande.updatedAt, depuis))))
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

  const [couverture, qc, envois, expeditions, matiere, lots, questions, declare, coupes, entrees] = await Promise.all([
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
    lignesCoupeValides(ids),
    ids.length
      ? db
          .select({ commandeId: magasinMouvement.commandeId, date: magasinMouvement.date, qte: magasinMouvement.qte })
          .from(magasinMouvement)
          .where(and(inArray(magasinMouvement.commandeId, ids), ne(magasinMouvement.origine, "rebut")))
      : Promise.resolve([]),
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
    /* Jalons et traçabilité : uniquement des faits datés, lus sur ses
     * commandes (coupe, entrées des pièces finies, contrôles, envois, BL). */
    const cps = coupes.filter((x) => mIds.includes(x.commandeId)).map((x) => iso(x.date)).sort();
    const ents = entrees.filter((x) => mIds.includes(x.commandeId)).map((x) => iso(x.date)).sort();
    const lotsCmd = lots.filter((l) => l.affectations.some((a) => a.commandeId != null && mIds.includes(a.commandeId)));
    /* Début du cycle : la commande enregistrée — ou, si elle a été saisie
     * après coup (reprise d'historique), le premier fait daté connu. Jamais
     * une date postérieure au départ. */
    const debutCycle = (() => {
      const premiers = [
        ...membres.map((m) => iso(m.creeLe).slice(0, 10)),
        tissuRecu,
        ...envois.filter((e) => mIds.includes(e.commandeId)).map((e) => iso(e.envoi)),
        ...coupes.filter((x) => mIds.includes(x.commandeId)).map((x) => iso(x.date)),
      ].filter((d) => /^\d{4}-\d{2}-\d{2}/.test(d)).sort();
      const d = premiers[0] ?? "";
      return expedieLe && d > expedieLe ? "" : d;
    })();
    const jalons: pf.Jalons = {
      commande: debutCycle,
      tissu: tissuRecu,
      coupeDebut: cps[0] ?? "",
      coupeFin: cps.at(-1) ?? "",
      finitionDebut: ents[0] ?? "",
      finitionFin: ents.at(-1) ?? "",
      controleFinal: final ? iso(final.date) : "",
      exportContractuel: iso(tete.exportPrevu),
      exportReel: expedieLe,
    };
    const tdsCmd = envois.filter((e) => mIds.includes(e.commandeId) && e.nature !== "ok").sort((a, b) => a.n - b.n);
    const premiere = tdsCmd[0];
    const piecesCoupees = (d: string) => coupes.filter((x) => mIds.includes(x.commandeId) && iso(x.date) === d).reduce((s2, x) => s2 + x.qte, 0);
    const piecesEntrees = (d: string) => entrees.filter((x) => mIds.includes(x.commandeId) && iso(x.date) === d).reduce((s2, x) => s2 + x.qte, 0);
    const evenements = pf.trierEvenements([
      ...membres
        .map((m) => iso(m.creeLe).slice(0, 10))
        .sort()
        .slice(0, 1)
        .filter((d) => !expedieLe || d <= expedieLe)
        .map((d) => ({ date: d, quoi: "Commande enregistrée", detail: `${nb(qte)} pièces` })),
      ...lotsCmd.map((l) => ({ date: l.receptionDate, quoi: "Tissu reçu", detail: [l.reference, l.couleur, l.lotFournisseur && `bain ${l.lotFournisseur}`, `lot ${l.identifiant}`].filter(Boolean).join(" · ") })),
      ...envois
        .filter((e) => mIds.includes(e.commandeId))
        .flatMap((e) => {
          const quoi = e.nature === "ok" ? `Pièces pour l'OK livraison ${e.n}` : `Tête de série ${e.n}`;
          return [
            { date: iso(e.envoi), quoi: `${quoi} envoyée`, detail: [e.transporteur, e.suivi].filter(Boolean).join(" ") },
            ...(e.verdict !== "attente" ? [{ date: iso(e.retour) || iso(e.envoi), quoi: `${quoi} : ${e.verdict === "ok" ? "OK" : "refusée"}`, detail: e.commentaire }] : []),
          ];
        }),
      ...[...new Set(cps)].map((d) => ({ date: d, quoi: "Coupe", detail: `${nb(piecesCoupees(d))} pièces coupées` })),
      ...qcs.map((x) => ({ date: iso(x.date), quoi: x.type === "final" ? "Contrôle qualité final" : "Contrôle qualité en cours de fabrication", detail: x.statut === "cloture" ? "clôturé" : "en cours" })),
      ...[...new Set(ents)].map((d) => ({ date: d, quoi: "Pièces finies et emballées", detail: `${nb(piecesEntrees(d))} pièces` })),
      ...[...parExpedition.values()].map((e) => ({ date: e.date, quoi: `Expédition ${e.numero}`, detail: [`${nb(e.pieces)} pièces`, e.transporteur, e.suivi].filter(Boolean).join(" · ") })),
    ]);
    commandes.push({
      jalons,
      cycle: pf.cycleCommande(jalons, aujourdhui),
      evenements,
      premiereTdsOk: premiere && premiere.verdict !== "attente" ? premiere.verdict === "ok" : null,
      controleOk: final ? true : null,
      piecesLivrees: [...parExpedition.values()].reduce((s2, e) => s2 + e.pieces, 0),
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
      archivee: !!expedieLe || membres.every((m) => m.archived),
    });
  }

  /* Son tissu : les lots reçus pour lui (réception rattachée à SA fiche
   * client ; une ancienne réception pas encore rattachée compte si le nom
   * saisi est le même), encore en rayon ou arrivés depuis moins de 120 jours. */
  const cleClient = normaliserNom(c.nom);
  const ilYa120 = new Date(Date.now() - 120 * 86_400_000).toISOString().slice(0, 10);
  const aLui = (l: { clientId: number | null; client: string }) => (l.clientId != null ? l.clientId === acces.clientId : normaliserNom(l.client) === cleClient);
  const siens = lots.filter((l) => aLui(l) && (l.bilan.disponible > 0.001 || l.receptionDate >= ilYa120));
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

  /* EN DIRECT (demande du 16/11) : la frise reflète l'avancement réel au
   * moment où le client ouvre la page — coupe, production, entrées au
   * magasin, contrôles, expéditions. L'ancien « point par jour » (frise figée
   * à la première visite) est abandonné : le client voulait voir les pièces
   * avancer tout de suite. La table portail_point reste en base (historique
   * des points déjà pris) mais n'est plus écrite. */
  const performance = pf.statsPerformance(
    commandes.map((x) => ({ jalons: x.jalons, pieces: x.piecesLivrees || (x.archivee ? x.qte : 0), premiereTdsOk: x.premiereTdsOk, controleOk: x.controleOk })),
    aujourdhui,
  );
  return { client: c.nom, contact: acces.nom, aujourdhui, misAJour: new Date().toISOString(), performance, commandes, lots: lotsClient, reliquats, questions, prevision: await previsionDuClient(acces.clientId, aujourdhui) };
}

/** La dernière prévision d'export publiée qui couvre encore aujourd'hui (ou
 * à venir), réduite aux lignes de CE client. Photo figée : rien ne bouge
 * jusqu'à la publication suivante. */
async function previsionDuClient(clientId: number, aujourdhui: string): Promise<PrevisionClient | null> {
  const [p] = await db
    .select()
    .from(exportPrevision)
    .where(gte(exportPrevision.fin, aujourdhui))
    .orderBy(desc(exportPrevision.debut), desc(exportPrevision.version))
    .limit(1);
  if (!p) return null;
  const lignes = await db
    .select()
    .from(exportPrevisionLigne)
    .where(and(eq(exportPrevisionLigne.previsionId, p.id), eq(exportPrevisionLigne.clientId, clientId)))
    .orderBy(asc(exportPrevisionLigne.date), asc(exportPrevisionLigne.of));
  return {
    debut: iso(p.debut),
    fin: iso(p.fin),
    publieLe: p.publieLe.toISOString(),
    commentaire: p.commentaires?.[String(clientId)] ?? "",
    lignes: lignes.map((l) => ({
      of: l.of, modele: l.modele, reference: l.reference, couleur: l.couleur, date: iso(l.date), qte: l.qte, qteCommande: l.qteCommande,
      etat: l.etat, changement: l.changement, dateAvant: iso(l.dateAvant), qteAvant: l.qteAvant,
    })),
  };
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
