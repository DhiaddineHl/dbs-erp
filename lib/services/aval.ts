import "server-only";
import { asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bl,
  blLigne,
  br,
  chaine,
  client,
  commande,
  coupe,
  faconnier,
  facture,
  factureLigne,
  magasinMouvement,
} from "@/lib/db/schema";
import * as av from "@/lib/domain/aval";
import * as biz from "@/lib/domain/commande";

/* ─────────── recalcul des compteurs ───────────
 * Les compteurs de la commande sont la somme de ses mouvements. Toute écriture
 * dans ce module se termine par un recalcul, de sorte qu'une suppression défait
 * exactement ce qu'un ajout avait fait. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

async function recalculerCommande(tx: Tx, commandeId: number) {
  const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
  if (!c) return;

  const [{ coupeQte }] = await tx
    .select({ coupeQte: sql<number>`coalesce(sum(${coupe.qte}), 0)::int` })
    .from(coupe)
    .where(eq(coupe.commandeId, commandeId));
  const [{ produit }] = await tx
    .select({ produit: sql<number>`coalesce(sum(${br.qteOk}), 0)::int` })
    .from(br)
    .where(eq(br.commandeId, commandeId));
  const [{ magasinQte }] = await tx
    .select({ magasinQte: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
    .from(magasinMouvement)
    .where(eq(magasinMouvement.commandeId, commandeId));

  const patch: Record<string, unknown> = {
    coupeQte,
    // La production est plafonnée à la quantité commandée : un surplus reçu ne
    // fait pas dépasser 100 % d'avancement.
    produit: Math.min(produit, c.qte),
    magasinQte,
    updatedAt: new Date(),
  };
  // Un stock retombé à zéro annule la préparation : on ne prépare pas du vide.
  if (magasinQte <= 0) {
    patch.magasinPrepare = false;
    patch.magasinExpedie = false;
  }
  await tx.update(commande).set(patch).where(eq(commande.id, commandeId));
}

/* ─────────── lectures ─────────── */

export type CommandeAval = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  clientId: number | null;
  faconnier: string;
  chaine: string;
  source: string;
  qte: number;
  /** Commande mère quand la ligne est une sous-commande, null sinon. */
  parentId: number | null;
  /** Part de `qte` que la ligne produit elle-même : le reste est parti en
   * sous-commandes, qui figurent dans la même liste avec la leur. Toute somme
   * de pièces ou d'euros passe par là, sinon le travail réparti est planifié
   * deux fois — une fois sur la mère, une fois sur chaque part. */
  qtePropre: number;
  produit: number;
  coupeQte: number;
  magasinQte: number;
  factureQte: number;
  prixVente: number | null;
  dateExport: string;
  exportPrev: string;
  statutLog: string;
  magasinPrepare: boolean;
  magasinExpedie: boolean;
  archived: boolean;
  livrable: number;
  etatMagasin: av.EtatMagasin;
};

const iso = (d: string | null) => d ?? "";
/** CA d'une ligne. `biz.chiffreAffaires` réclame une commande complète ;
 * ici on n'a que le prix et la quantité, et l'arrondi doit être le même. */
const caLigne = (qte: number, prixVente: number | null) => Math.round((prixVente ?? 0) * qte * 100) / 100;

async function commandesBrutes() {
  return db
    .select({ c: commande, clientNom: client.nom, faconnierNom: faconnier.nom, chaineNom: chaine.nom })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .leftJoin(chaine, eq(commande.chaineId, chaine.id))
    .orderBy(commande.id);
}

function versAval(
  r: Awaited<ReturnType<typeof commandesBrutes>>[number],
  qteAffectee = 0,
): CommandeAval {
  const { c, clientNom, faconnierNom, chaineNom } = r;
  return {
    id: c.id,
    of: c.ofNumber,
    modele: c.modele,
    refArticle: c.refArticle,
    couleur: c.couleur,
    client: clientNom ?? "",
    clientId: c.clientId,
    faconnier: faconnierNom ?? "",
    chaine: chaineNom ?? "",
    source: faconnierNom ?? (chaineNom ? `${chaineNom} (interne)` : "—"),
    qte: c.qte,
    parentId: c.parentId,
    qtePropre: Math.max(0, c.qte - qteAffectee),
    produit: c.produit,
    coupeQte: c.coupeQte,
    magasinQte: c.magasinQte,
    factureQte: c.factureQte,
    prixVente: c.prixVente,
    dateExport: iso(c.dateExport),
    exportPrev: iso(c.exportPrev),
    statutLog: c.statutLog,
    magasinPrepare: c.magasinPrepare,
    magasinExpedie: c.magasinExpedie,
    archived: c.archived,
    livrable: av.quantiteLivrable(c),
    etatMagasin: av.etatMagasin(c),
  };
}

export async function listCommandesAval(opts: { archived?: boolean } = {}): Promise<CommandeAval[]> {
  const rows = await commandesBrutes();
  /* Les parts sont comptées avant le filtre d'archivage : la quantité propre
   * d'une mère ne dépend pas de l'écran qui la lit. */
  const affectee = new Map<number, number>();
  for (const { c } of rows) {
    if (c.parentId == null) continue;
    affectee.set(c.parentId, (affectee.get(c.parentId) ?? 0) + c.qte);
  }
  return rows
    .filter(({ c }) => (opts.archived === undefined ? true : c.archived === opts.archived))
    .map((r) => versAval(r, affectee.get(r.c.id) ?? 0));
}

export type BrRow = {
  id: number;
  numero: string;
  date: string;
  commandeId: number;
  of: string;
  modele: string;
  client: string;
  faconnier: string;
  qteRecue: number;
  qteOk: number;
  qteNc: number;
  controle: string;
  note: string;
};

export async function listBr(): Promise<BrRow[]> {
  const rows = await db
    .select({ b: br, of: commande.ofNumber, modele: commande.modele, clientNom: client.nom })
    .from(br)
    .leftJoin(commande, eq(br.commandeId, commande.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .orderBy(desc(br.date), desc(br.id));
  return rows.map(({ b, of, modele, clientNom }) => ({
    id: b.id, numero: b.numero, date: b.date, commandeId: b.commandeId,
    of: of ?? "", modele: modele ?? "", client: clientNom ?? "", faconnier: b.faconnier,
    qteRecue: b.qteRecue, qteOk: b.qteOk, qteNc: b.qteNc, controle: b.controle, note: b.note,
  }));
}

export type BlLigneRow = {
  id: number;
  commandeId: number | null;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  qteLivree: number;
  prixUnitaire: number;
  montant: number;
};

export type BlRow = {
  id: number;
  numero: string;
  date: string;
  clientNom: string;
  transporteur: string;
  adresseLivraison: string;
  statut: string;
  note: string;
  lignes: BlLigneRow[];
  totalQte: number;
  totalHt: number;
};

export async function listBl(): Promise<BlRow[]> {
  const [entetes, lignes] = await Promise.all([
    db.select().from(bl).orderBy(desc(bl.date), desc(bl.id)),
    db.select().from(blLigne).orderBy(asc(blLigne.id)),
  ]);
  const parBl = new Map<number, typeof lignes>();
  for (const l of lignes) {
    const g = parBl.get(l.blId);
    if (g) g.push(l);
    else parBl.set(l.blId, [l]);
  }
  return entetes.map((b) => {
    const ls = (parBl.get(b.id) ?? []).map((l) => ({
      id: l.id, commandeId: l.commandeId, of: l.of, modele: l.modele, refArticle: l.refArticle,
      couleur: l.couleur, qteLivree: l.qteLivree, prixUnitaire: l.prixUnitaire,
      montant: Math.round(l.qteLivree * l.prixUnitaire * 100) / 100,
    }));
    return {
      id: b.id, numero: b.numero, date: b.date, clientNom: b.clientNom,
      transporteur: b.transporteur, adresseLivraison: b.adresseLivraison,
      statut: b.statut, note: b.note, lignes: ls,
      totalQte: ls.reduce((s, l) => s + l.qteLivree, 0),
      totalHt: Math.round(ls.reduce((s, l) => s + l.montant, 0) * 100) / 100,
    };
  });
}

export const getBl = async (id: number) => (await listBl()).find((b) => b.id === id) ?? null;

export const listCoupes = (commandeId: number) =>
  db.select().from(coupe).where(eq(coupe.commandeId, commandeId)).orderBy(asc(coupe.date));

export type CoupeRow = {
  id: number;
  commandeId: number;
  date: string;
  qte: number;
  taille: string;
  type: string;
  note: string;
};

/** Tous les lâchers de coupe, regroupés côté écran par commande. */
export async function listToutesCoupes(): Promise<CoupeRow[]> {
  const rows = await db.select().from(coupe).orderBy(asc(coupe.date), asc(coupe.id));
  return rows.map((c) => ({
    id: c.id, commandeId: c.commandeId, date: c.date, qte: c.qte,
    taille: c.taille, type: c.type, note: c.note,
  }));
}

export const listMouvementsMagasin = (commandeId: number) =>
  db
    .select()
    .from(magasinMouvement)
    .where(eq(magasinMouvement.commandeId, commandeId))
    .orderBy(asc(magasinMouvement.date));

/* ─────────── réception sous-traitance ─────────── */

export type Auteur = { id: string; name: string; role: string };

async function prochainNumero(prefixe: "BR" | "BL", annee = new Date().getFullYear()) {
  const table = prefixe === "BR" ? br : bl;
  const rows = await db.select({ n: table.numero }).from(table);
  const seq = av.derniereSequence(rows.map((r) => r.n), prefixe, annee) + 1;
  return prefixe === "BR" ? av.numeroBr(seq, annee) : av.numeroBl(seq, annee);
}

export async function contexteReception(commandeId: number) {
  const [c] = await db.select().from(commande).where(eq(commande.id, commandeId));
  if (!c) return null;
  const [{ totalCoupe }] = await db
    .select({ totalCoupe: sql<number>`coalesce(sum(${coupe.qte}), 0)::int` })
    .from(coupe)
    .where(eq(coupe.commandeId, commandeId));
  return { qteCommandee: c.qte, dejaProduit: c.produit, totalCoupe };
}

export async function creerBr(v: {
  commandeId: number;
  date: string;
  qteRecue: number;
  qteOk: number;
  qteNc: number;
  controle: string;
  note: string;
}) {
  const numero = await prochainNumero("BR");
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(commande).where(eq(commande.id, v.commandeId));
    if (!c) throw new Error("Commande introuvable");
    const [f] = c.faconnierId
      ? await tx.select({ nom: faconnier.nom }).from(faconnier).where(eq(faconnier.id, c.faconnierId))
      : [{ nom: "" }];

    const [row] = await tx
      .insert(br)
      .values({ ...v, numero, faconnier: f?.nom ?? "" })
      .returning({ id: br.id });

    // Les pièces conformes entrent au stock produits finis dans la foulée.
    if (v.qteOk > 0) {
      await tx.insert(magasinMouvement).values({
        commandeId: v.commandeId, date: v.date, qte: v.qteOk, origine: "br", brId: row.id,
        note: `Réception ${numero}`,
      });
    }
    await recalculerCommande(tx, v.commandeId);
    return { id: row.id, numero };
  });
}

export async function supprimerBr(id: number) {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(br).where(eq(br.id, id));
    if (!b) return;
    // Le mouvement de stock part en cascade ; le recalcul rétablit les compteurs.
    await tx.delete(br).where(eq(br.id, id));
    await recalculerCommande(tx, b.commandeId);
  });
}

/* ─────────── coupe ─────────── */

export async function ajouterCoupe(v: {
  commandeId: number;
  date: string;
  qte: number;
  taille: string;
  type: string;
  note: string;
}) {
  return db.transaction(async (tx) => {
    await tx.insert(coupe).values(v);
    await recalculerCommande(tx, v.commandeId);
  });
}

export async function supprimerCoupe(id: number) {
  return db.transaction(async (tx) => {
    const [c] = await tx.select().from(coupe).where(eq(coupe.id, id));
    if (!c) return;
    await tx.delete(coupe).where(eq(coupe.id, id));
    await recalculerCommande(tx, c.commandeId);
  });
}

/* ─────────── magasin ─────────── */

export async function receptionMagasin(v: { commandeId: number; date: string; qte: number; note: string }) {
  return db.transaction(async (tx) => {
    await tx.insert(magasinMouvement).values({ ...v, origine: "interne" });
    await recalculerCommande(tx, v.commandeId);
  });
}

export async function supprimerMouvementMagasin(id: number) {
  return db.transaction(async (tx) => {
    const [m] = await tx.select().from(magasinMouvement).where(eq(magasinMouvement.id, id));
    if (!m) return;
    await tx.delete(magasinMouvement).where(eq(magasinMouvement.id, id));
    await recalculerCommande(tx, m.commandeId);
  });
}

export async function marquerPrepare(commandeId: number, prepare: boolean) {
  await db
    .update(commande)
    .set({ magasinPrepare: prepare, ...(prepare ? {} : { magasinExpedie: false }), updatedAt: new Date() })
    .where(eq(commande.id, commandeId));
}

export async function marquerExpedie(commandeId: number, expedie: boolean) {
  await db
    .update(commande)
    .set({
      magasinExpedie: expedie,
      ...(expedie
        ? { magasinPrepare: true, dateLivraison: biz.todayISO(), statutLog: "expedie" }
        : { dateLivraison: null }),
      updatedAt: new Date(),
    })
    .where(eq(commande.id, commandeId));
}

/* ─────────── bons de livraison ─────────── */

export async function creerBl(v: {
  date: string;
  clientId: number | null;
  clientNom: string;
  transporteur: string;
  adresseLivraison: string;
  note: string;
  lignes: { commandeId: number; qteLivree: number }[];
}) {
  const numero = await prochainNumero("BL");
  return db.transaction(async (tx) => {
    const [entete] = await tx
      .insert(bl)
      .values({
        numero, date: v.date, clientId: v.clientId, clientNom: v.clientNom,
        transporteur: v.transporteur, adresseLivraison: v.adresseLivraison, note: v.note, statut: "draft",
      })
      .returning({ id: bl.id });

    const ids = v.lignes.map((l) => l.commandeId);
    const commandes = ids.length
      ? await tx.select().from(commande).where(inArray(commande.id, ids))
      : [];
    const parId = new Map(commandes.map((c) => [c.id, c]));

    const lignes = v.lignes
      .filter((l) => l.qteLivree > 0 && parId.has(l.commandeId))
      .map((l) => {
        const c = parId.get(l.commandeId)!;
        return {
          blId: entete.id, commandeId: c.id, of: c.ofNumber, modele: c.modele,
          refArticle: c.refArticle, couleur: c.couleur,
          qteLivree: l.qteLivree, prixUnitaire: c.prixVente ?? 0,
        };
      });
    if (!lignes.length) throw new Error("Sélectionnez au moins une commande");
    await tx.insert(blLigne).values(lignes);

    // Émettre un BL marque les commandes concernées comme préparées.
    await tx
      .update(commande)
      .set({ magasinPrepare: true, updatedAt: new Date() })
      .where(inArray(commande.id, lignes.map((l) => l.commandeId!)));

    return { id: entete.id, numero };
  });
}

export async function majStatutBl(id: number, statut: string) {
  await db.update(bl).set({ statut }).where(eq(bl.id, id));
  // Un BL envoyé vaut expédition des commandes qu'il porte.
  if (statut === "sent" || statut === "invoiced") {
    const lignes = await db.select({ commandeId: blLigne.commandeId }).from(blLigne).where(eq(blLigne.blId, id));
    const ids = lignes.map((l) => l.commandeId).filter((x): x is number => x !== null);
    if (ids.length) {
      await db
        .update(commande)
        .set({ magasinExpedie: true, magasinPrepare: true, statutLog: "expedie", dateLivraison: biz.todayISO(), updatedAt: new Date() })
        .where(inArray(commande.id, ids));
    }
  }
}

export async function supprimerBl(id: number) {
  await db.delete(bl).where(eq(bl.id, id));
}

/* ─────────── rapprochement facturation ─────────── */

export type ResultatRapprochement = { affectations: av.Affectation[]; archivees: number };

/** Calcule le rapprochement, puis l'applique si `appliquer` est vrai. En simple
 * calcul, il sert d'aperçu : l'opérateur voit ce qui va changer avant de valider. */
export async function rapprocherFacturation(appliquer: boolean): Promise<ResultatRapprochement> {
  const [lignesFact, commandes] = await Promise.all([
    db
      .select({
        marque: facture.marque, clientKey: facture.clientKey, num: facture.num,
        modele: factureLigne.modele, ref: factureLigne.ref, qte: factureLigne.qte,
      })
      .from(factureLigne)
      .innerJoin(facture, eq(factureLigne.factureId, facture.id))
      .where(isNull(facture.deletedAt)),
    listCommandesAval(),
  ]);

  const lignes: av.LigneFacturee[] = lignesFact.map((l) => ({
    client: l.marque || l.clientKey || "",
    modele: l.modele,
    ref: l.ref,
    qte: l.qte,
    numero: l.num,
  }));

  const affectations = av.calculerRapprochement(
    lignes,
    commandes.map((c) => ({
      id: c.id, of: c.of, client: c.client, modele: c.modele, refArticle: c.refArticle,
      qte: c.qte, factureQte: c.factureQte, archived: c.archived, facNums: [],
    })),
  );

  if (!appliquer || !affectations.length) return { affectations, archivees: 0 };

  let archivees = 0;
  await db.transaction(async (tx) => {
    for (const a of affectations) {
      const [c] = await tx.select().from(commande).where(eq(commande.id, a.commandeId));
      if (!c) continue;
      const nums = [...new Set([...c.facNums, ...a.numeros])];
      const patch: Record<string, unknown> = { factureQte: a.apres, facNums: nums, updatedAt: new Date() };
      // Une commande intégralement facturée est livrée, donc archivée.
      if (a.complete) {
        patch.archived = true;
        patch.dateLivraison = c.dateLivraison ?? biz.todayISO();
        archivees++;
      }
      await tx.update(commande).set(patch).where(eq(commande.id, a.commandeId));
    }
  });

  return { affectations, archivees };
}

/* ─────────── archives ─────────── */

export type ArchiveRow = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  client: string;
  faconnier: string;
  qte: number;
  produit: number;
  factureQte: number;
  prixVente: number | null;
  prixFacon: number | null;
  ca: number;
  marge: number;
  margePct: number;
  receptTissu: string;
  dateExport: string;
  dateExportReel: string;
  dateLivraison: string;
  facNums: string[];
  /** Retard d'export constaté, en jours. Positif = livré après la date promise. */
  retardExport: number | null;
  /** Délai réel du cycle, de la réception tissu à la livraison. */
  delaiCycle: number | null;
  facturee: boolean;
};

/** Les archives sont des commandes ordinaires marquées `archived` : le module
 * ne duplique rien, il ne fait que les relire avec les chiffres réalisés. */
export async function listArchives(): Promise<ArchiveRow[]> {
  const rows = await commandesBrutes();
  return rows
    .filter(({ c }) => c.archived)
    .map(({ c, clientNom, faconnierNom }) => {
      const livraison = iso(c.dateLivraison) || iso(c.dateExportReel);
      return {
        id: c.id,
        of: c.ofNumber,
        modele: c.modele,
        refArticle: c.refArticle,
        couleur: c.couleur,
        client: clientNom ?? "",
        faconnier: faconnierNom ?? "",
        qte: c.qte,
        produit: c.produit,
        factureQte: c.factureQte,
        prixVente: c.prixVente,
        prixFacon: c.prixFacon,
        ca: biz.chiffreAffaires(c),
        marge: biz.margeTotale(c),
        margePct: biz.margePct(c),
        receptTissu: iso(c.receptTissu),
        dateExport: iso(c.dateExport),
        dateExportReel: iso(c.dateExportReel),
        dateLivraison: iso(c.dateLivraison),
        facNums: c.facNums,
        retardExport: biz.joursEntre(iso(c.dateExport) || null, livraison || null),
        delaiCycle: biz.joursEntre(iso(c.receptTissu) || null, livraison || null),
        facturee: c.qte > 0 && c.factureQte >= c.qte,
      };
    })
    .sort((a, b) => (b.dateLivraison || "").localeCompare(a.dateLivraison || "") || b.id - a.id);
}

export async function desarchiver(ids: number[]) {
  if (ids.length) {
    await db.update(commande).set({ archived: false, updatedAt: new Date() }).where(inArray(commande.id, ids));
  }
}

/* ─────────── prévision export ─────────── */

export async function majPrevisionExport(commandeId: number, dateExportPrev: string | null) {
  await db
    .update(commande)
    .set({ exportPrev: dateExportPrev, updatedAt: new Date() })
    .where(eq(commande.id, commandeId));
}

export type LignePrevision = CommandeAval & {
  /** Date retenue pour la planification (prévision, sinon contractuelle). */
  datePlan: string;
  joursRestants: number | null;
  urgence: av.UrgenceExport;
  ca: number;
};

export async function listPrevisionExport(): Promise<LignePrevision[]> {
  const commandes = await listCommandesAval({ archived: false });
  return commandes
    .map((c) => {
      const datePlan = av.dateExportPlanifiee(c);
      const joursRestants = biz.joursJusqua(datePlan || null);
      return {
        ...c,
        datePlan,
        joursRestants,
        urgence: av.urgenceExport(joursRestants, c.magasinExpedie),
        ca: caLigne(c.qte, c.prixVente),
      };
    })
    .sort((a, b) => {
      // Les commandes sans date passent en fin de liste : on planifie d'abord ce qui est daté.
      if (!a.datePlan && b.datePlan) return 1;
      if (a.datePlan && !b.datePlan) return -1;
      return a.datePlan.localeCompare(b.datePlan) || a.of.localeCompare(b.of);
    });
}

/* ─────────── plan façonnier ─────────── */

export type PlanFaconnierData = {
  plans: av.PlanFaconnier[];
  /** Mois présents, triés ; "" regroupe les commandes sans date d'export. */
  mois: string[];
};

export async function getPlanFaconnier(): Promise<PlanFaconnierData> {
  const commandes = await listCommandesAval({ archived: false });
  /* La charge d'un façonnier se compte en quantité propre : une commande
   * découpée occupe chaque atelier de sa part, et la mère seulement de ce
   * qu'elle garde. Additionner le total de la mère et celui de ses parts
   * ferait planifier deux fois le même travail. */
  const lignes: av.LigneCharge[] = commandes.map((c) => ({
    faconnier: c.faconnier || (c.chaine ? `${c.chaine} (interne)` : "Non assigné"),
    mois: av.dateExportPlanifiee(c).slice(0, 7),
    qte: c.qtePropre,
    produit: c.produit,
    ca: caLigne(c.qtePropre, c.prixVente),
  }));

  const plans = av.planFaconnier(lignes);
  const mois = [...new Set(lignes.map((l) => l.mois))].sort((a, b) => (a ? a : "9999").localeCompare(b ? b : "9999"));
  return { plans, mois };
}

export async function majStatutLogistique(commandeId: number, statut: string) {
  await db.update(commande).set({ statutLog: statut, updatedAt: new Date() }).where(eq(commande.id, commandeId));
}
