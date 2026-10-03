import "server-only";
import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  bl,
  blLigne,
  br,
  chaine,
  client,
  commande,
  coupe,
  coupeFiche,
  faconnier,
  facture,
  factureLigne,
  magasinMouvement,
  qcInspection,
} from "@/lib/db/schema";
import * as av from "@/lib/domain/aval";
import * as biz from "@/lib/domain/commande";
import { conditionEntreeStock, productionGpaoParCommande, recalculerProduit } from "@/lib/services/avancement";

/* ─────────── recalcul des compteurs ───────────
 * Les compteurs de la commande sont la somme de ses mouvements. Toute écriture
 * dans ce module se termine par un recalcul, de sorte qu'une suppression défait
 * exactement ce qu'un ajout avait fait. */

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function recalculerCommande(tx: Tx, commandeId: number) {
  const [c] = await tx.select().from(commande).where(eq(commande.id, commandeId));
  if (!c) return;

  const [{ coupeQte }] = await tx
    .select({ coupeQte: sql<number>`coalesce(sum(${coupe.qte}), 0)::int` })
    .from(coupe)
    // Les lignes d'une fiche de coupe ANNULÉE restent en base (historique)
    // mais ne comptent plus dans le coupé.
    .leftJoin(coupeFiche, eq(coupe.ficheId, coupeFiche.id))
    .where(and(eq(coupe.commandeId, commandeId), or(isNull(coupe.ficheId), eq(coupeFiche.statut, "validee"))));
  // Le rebut n'entre pas au stock : seules les entrées réelles comptent.
  const [{ magasinQte }] = await tx
    .select({ magasinQte: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
    .from(magasinMouvement)
    .where(conditionEntreeStock(commandeId));

  const patch: Record<string, unknown> = { coupeQte, magasinQte, updatedAt: new Date() };
  // Un stock retombé à zéro annule la préparation : on ne prépare pas du vide.
  if (magasinQte <= 0) {
    patch.magasinPrepare = false;
    patch.magasinExpedie = false;
  }
  await tx.update(commande).set(patch).where(eq(commande.id, commandeId));
  /* `produit` n'est plus calculé ici sur les seuls BR (ce qui remettait à 0
   * toute production interne) : formule unique, partagée avec la GPAO. */
  await recalculerProduit(tx, commandeId);
}

/** Pièces parties sur des BL envoyés ou facturés, par commande. */
async function expeditionsParCommande(ex: Pick<typeof db, "select"> = db): Promise<Map<number, number>> {
  const rows = await ex
    .select({ commandeId: blLigne.commandeId, qte: sql<number>`coalesce(sum(${blLigne.qteLivree}), 0)::int` })
    .from(blLigne)
    .innerJoin(bl, eq(blLigne.blId, bl.id))
    .where(inArray(bl.statut, ["sent", "invoiced"]))
    .groupBy(blLigne.commandeId);
  const m = new Map<number, number>();
  for (const r of rows) if (r.commandeId != null) m.set(r.commandeId, r.qte);
  return m;
}

/** Refuse une suppression qui ferait passer le stock sous ce qui est déjà expédié. */
async function verifierStockApresRetrait(tx: Tx, commandeId: number, retrait: number) {
  const [c] = await tx.select({ magasinQte: commande.magasinQte }).from(commande).where(eq(commande.id, commandeId));
  const expedie = (await expeditionsParCommande(tx)).get(commandeId) ?? 0;
  if (c && c.magasinQte - retrait < expedie) {
    throw new Error(
      `Impossible : ${expedie} pièce(s) de cette commande sont déjà parties sur un bon de livraison envoyé. ` +
        `Le stock ne peut pas descendre en dessous.`,
    );
  }
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
  /** Pièces parties sur des BL envoyés / facturés. */
  expedieQte: number;
  /** Stock physique = entré − expédié. */
  stockQte: number;
  /** Production GPAO (interne) attribuée à la commande : ses modèles liés,
   * plafonnés à sa quantité, + le surplus des OF frères (même client, même modèle). */
  produitGpao: number;
  /** Production GPAO en trop, que ni la commande ni ses frères ne peuvent
   * recevoir : à vérifier, jamais comptée comme « à entrer ». */
  gpaoExcedent: number;
  /** Pièces entrées au stock depuis la production interne. */
  entreesInternes: number;
  /** Non conformes reçues des façonniers encore sans décision. */
  ncAttente: number;
  /** Dernier contrôle qualité FINAL clôturé : accepte | reserve | refuse | "" (aucun). */
  qcFinal: string;
  /** Livrée / facturée : rangée par défaut des écrans opérationnels. */
  cloture: biz.Cloture;
  /** active | terminee (livrée ET facturée) | archivee. */
  cycle: biz.EtatCycle;
};

/** Faits calculés à côté de la commande (mouvements, BL, GPAO, QC). */
type FaitsAval = { expedie: number; gpao: number; gpaoExcedent: number; internes: number; ncAttente: number; qc: string };
const FAITS_VIDES: FaitsAval = { expedie: 0, gpao: 0, gpaoExcedent: 0, internes: 0, ncAttente: 0, qc: "" };

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
  faits: FaitsAval = FAITS_VIDES,
): CommandeAval {
  const { c, clientNom, faconnierNom, chaineNom } = r;
  const flux = { ...c, expedieQte: faits.expedie };
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
    livrable: av.quantiteLivrable(flux),
    etatMagasin: av.etatMagasin(flux),
    expedieQte: faits.expedie,
    stockQte: av.stockPhysique(flux),
    produitGpao: faits.gpao,
    gpaoExcedent: faits.gpaoExcedent,
    entreesInternes: faits.internes,
    ncAttente: faits.ncAttente,
    qcFinal: faits.qc,
    cloture: biz.clotureCommande(c),
    cycle: biz.etatCycle(c),
  };
}

/** Tous les faits aval, en quelques requêtes pour toute la liste. */
async function faitsAval(): Promise<Map<number, FaitsAval>> {
  const [expedie, gpao, mouvements, brs, qcs] = await Promise.all([
    expeditionsParCommande(),
    productionGpaoParCommande(),
    db
      .select({ commandeId: magasinMouvement.commandeId, origine: magasinMouvement.origine, qte: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
      .from(magasinMouvement)
      .groupBy(magasinMouvement.commandeId, magasinMouvement.origine),
    db.select({ commandeId: br.commandeId, nc: sql<number>`coalesce(sum(${br.qteNc}), 0)::int` }).from(br).groupBy(br.commandeId),
    db
      .select({ commandeId: qcInspection.commandeId, verdict: qcInspection.verdictCloture, date: qcInspection.dateCloture, id: qcInspection.id })
      .from(qcInspection)
      .where(and(eq(qcInspection.typeControle, "final"), eq(qcInspection.statut, "cloture"))),
  ]);
  const out = new Map<number, FaitsAval>();
  const get = (id: number) => {
    let f = out.get(id);
    if (!f) out.set(id, (f = { ...FAITS_VIDES }));
    return f;
  };
  for (const [id, q] of expedie) get(id).expedie = q;
  for (const [id, p] of gpao) {
    if (p.gpao <= 0 && p.excedent <= 0) continue;
    get(id).gpao = p.gpao;
    get(id).gpaoExcedent = p.excedent;
  }
  for (const b of brs) get(b.commandeId).ncAttente += b.nc;
  for (const m of mouvements) {
    const f = get(m.commandeId);
    if (m.origine === "interne") f.internes += m.qte;
    if (m.origine === "retouche" || m.origine === "rebut") f.ncAttente -= m.qte;
  }
  for (const f of out.values()) f.ncAttente = Math.max(0, f.ncAttente);
  // Dernier contrôle final clôturé de chaque commande.
  const dernier = new Map<number, { verdict: string; cle: string }>();
  for (const q of qcs) {
    if (q.commandeId == null) continue;
    const cle = `${q.date ?? ""}#${String(q.id).padStart(8, "0")}`;
    const d = dernier.get(q.commandeId);
    if (!d || cle > d.cle) dernier.set(q.commandeId, { verdict: q.verdict, cle });
  }
  for (const [id, d] of dernier) get(id).qc = d.verdict;
  return out;
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
  const faits = await faitsAval();
  return rows
    .filter(({ c }) => (opts.archived === undefined ? true : c.archived === opts.archived))
    .map((r) => versAval(r, affectee.get(r.c.id) ?? 0, faits.get(r.c.id)));
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
  /** Non conformes déjà traitées (retouchées ou rebutées). */
  ncRetouchees: number;
  ncRebut: number;
  ncAttente: number;
};

export async function listBr(): Promise<BrRow[]> {
  const traitements = await db
    .select({ brId: magasinMouvement.brId, origine: magasinMouvement.origine, qte: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
    .from(magasinMouvement)
    .where(inArray(magasinMouvement.origine, ["retouche", "rebut"]))
    .groupBy(magasinMouvement.brId, magasinMouvement.origine);
  const parBr = new Map<number, { retouche: number; rebut: number }>();
  for (const t of traitements) {
    if (t.brId == null) continue;
    const e = parBr.get(t.brId) ?? { retouche: 0, rebut: 0 };
    if (t.origine === "retouche") e.retouche += t.qte;
    else e.rebut += t.qte;
    parBr.set(t.brId, e);
  }
  const rows = await db
    .select({ b: br, of: commande.ofNumber, modele: commande.modele, clientNom: client.nom })
    .from(br)
    .leftJoin(commande, eq(br.commandeId, commande.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .orderBy(desc(br.date), desc(br.id));
  return rows.map(({ b, of, modele, clientNom }) => {
    const t = parBr.get(b.id) ?? { retouche: 0, rebut: 0 };
    return {
      id: b.id, numero: b.numero, date: b.date, commandeId: b.commandeId,
      of: of ?? "", modele: modele ?? "", client: clientNom ?? "", faconnier: b.faconnier,
      qteRecue: b.qteRecue, qteOk: b.qteOk, qteNc: b.qteNc, controle: b.controle, note: b.note,
      ncRetouchees: t.retouche, ncRebut: t.rebut, ncAttente: av.ncEnAttente(b.qteNc, t.retouche + t.rebut),
    };
  });
}

/* ─────────── journal des mouvements (entrées, NC, sorties BL) ─────────── */

export type MouvementRow = {
  cle: string;
  date: string;
  sens: "entree" | "sortie" | "rebut";
  type: string;
  document: string;
  commandeId: number | null;
  of: string;
  modele: string;
  client: string;
  qte: number;
  note: string;
};

export async function listMouvements(): Promise<MouvementRow[]> {
  const [mvts, sorties] = await Promise.all([
    db
      .select({ m: magasinMouvement, of: commande.ofNumber, modele: commande.modele, clientNom: client.nom, brNumero: br.numero })
      .from(magasinMouvement)
      .leftJoin(commande, eq(magasinMouvement.commandeId, commande.id))
      .leftJoin(client, eq(commande.clientId, client.id))
      .leftJoin(br, eq(magasinMouvement.brId, br.id)),
    db
      .select({ l: blLigne, numero: bl.numero, date: bl.date, statut: bl.statut, clientNom: bl.clientNom })
      .from(blLigne)
      .innerJoin(bl, eq(blLigne.blId, bl.id))
      .where(inArray(bl.statut, ["sent", "invoiced"])),
  ]);
  const out: MouvementRow[] = [];
  for (const { m, of, modele, clientNom, brNumero } of mvts) {
    const o = av.ORIGINES_MOUVEMENT[m.origine as av.OrigineMouvement] ?? av.ORIGINES_MOUVEMENT.interne;
    out.push({
      cle: `m${m.id}`, date: m.date, sens: o.entreStock ? "entree" : "rebut", type: o.label,
      document: brNumero ?? "", commandeId: m.commandeId, of: of ?? "", modele: modele ?? "",
      client: clientNom ?? "", qte: m.qte, note: m.note,
    });
  }
  for (const { l, numero, date, clientNom } of sorties) {
    out.push({
      cle: `l${l.id}`, date, sens: "sortie", type: "Expédition (BL)", document: numero,
      commandeId: l.commandeId, of: l.of, modele: l.modele, client: clientNom, qte: l.qteLivree, note: "",
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || b.cle.localeCompare(a.cle));
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
  /** Fiche de coupe d'origine ("" = lâcher saisi à la main). */
  fiche: string;
  ficheAnnulee: boolean;
  qtePrevue: number | null;
};

/** Tous les lâchers de coupe, regroupés côté écran par commande. */
export async function listToutesCoupes(): Promise<CoupeRow[]> {
  const rows = await db
    .select({ c: coupe, numero: coupeFiche.numero, statut: coupeFiche.statut })
    .from(coupe)
    .leftJoin(coupeFiche, eq(coupe.ficheId, coupeFiche.id))
    .orderBy(asc(coupe.date), asc(coupe.id));
  return rows.map(({ c, numero, statut }) => ({
    id: c.id, commandeId: c.commandeId, date: c.date, qte: c.qte,
    taille: c.taille, type: c.type, note: c.note,
    fiche: numero ?? "", ficheAnnulee: statut === "annulee", qtePrevue: c.qtePrevue,
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
    // Retire l'entrée du BR et les NC réintégrées qui en dépendent.
    const [{ retire }] = await tx
      .select({ retire: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
      .from(magasinMouvement)
      .where(and(eq(magasinMouvement.brId, id), inArray(magasinMouvement.origine, ["br", "retouche"])));
    await verifierStockApresRetrait(tx, b.commandeId, retire);
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
    // Une ligne de fiche de coupe ne s'efface pas : c'est la fiche qui s'annule.
    if (c.ficheId != null) throw new Error("Cette ligne appartient à une fiche de coupe : annulez la fiche (avec un motif) au lieu de supprimer.");
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
    if (m.origine === "br") throw new Error("Cette entrée vient d'un bon de réception : supprimez le BR lui-même.");
    if (m.origine !== "rebut") await verifierStockApresRetrait(tx, m.commandeId, m.qte);
    await tx.delete(magasinMouvement).where(eq(magasinMouvement.id, id));
    await recalculerCommande(tx, m.commandeId);
  });
}

/** Décision sur des non conformes d'un BR : réintégrées au stock après
 * retouche (elles comptent alors comme produites), ou mises au rebut. */
export async function traiterNc(v: { brId: number; decision: "retouche" | "rebut"; qte: number; date: string; note: string }) {
  return db.transaction(async (tx) => {
    const [b] = await tx.select().from(br).where(eq(br.id, v.brId));
    if (!b) throw new Error("Bon de réception introuvable");
    const [{ deja }] = await tx
      .select({ deja: sql<number>`coalesce(sum(${magasinMouvement.qte}), 0)::int` })
      .from(magasinMouvement)
      .where(and(eq(magasinMouvement.brId, v.brId), inArray(magasinMouvement.origine, ["retouche", "rebut"])));
    const reste = av.ncEnAttente(b.qteNc, deja);
    if (v.qte <= 0) throw new Error("Quantité invalide");
    if (v.qte > reste) throw new Error(`Il ne reste que ${reste} pièce(s) non conforme(s) en attente sur ${b.numero}.`);
    await tx.insert(magasinMouvement).values({
      commandeId: b.commandeId, date: v.date, qte: v.qte, origine: v.decision, brId: b.id,
      note: v.note || (v.decision === "retouche" ? `NC ${b.numero} retouchées` : `NC ${b.numero} au rebut`),
    });
    await recalculerCommande(tx, b.commandeId);
    return { numero: b.numero, reste: reste - v.qte };
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
    /* On ne livre pas plus que le stock physique d'une commande qui passe par
     * le magasin (entré − déjà parti sur des BL envoyés). */
    const expedie = await expeditionsParCommande(tx);
    for (const l of lignes) {
      const c = parId.get(l.commandeId!)!;
      if (c.magasinQte <= 0) continue;
      const stock = av.stockPhysique({ magasinQte: c.magasinQte, expedieQte: expedie.get(c.id) ?? 0 });
      if (l.qteLivree > stock) {
        throw new Error(`${c.ofNumber} : ${l.qteLivree} pcs demandées mais seulement ${stock} en stock au magasin.`);
      }
    }
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
  /* Un BL envoyé fait partir ses pièces du stock. La commande n'est dite
   * « expédiée » que quand le cumul des BL envoyés couvre toute sa quantité :
   * on peut livrer en plusieurs fois (avant, le premier BL soldait tout). */
  const lignes = await db.select({ commandeId: blLigne.commandeId }).from(blLigne).where(eq(blLigne.blId, id));
  const ids = [...new Set(lignes.map((l) => l.commandeId).filter((x): x is number => x !== null))];
  if (!ids.length) return;
  const expedie = await expeditionsParCommande();
  const commandes = await db.select({ id: commande.id, qte: commande.qte, magasinExpedie: commande.magasinExpedie }).from(commande).where(inArray(commande.id, ids));
  for (const c of commandes) {
    const complete = av.livraisonComplete(c.qte, expedie.get(c.id) ?? 0);
    if (complete && !c.magasinExpedie) {
      await db
        .update(commande)
        .set({ magasinExpedie: true, magasinPrepare: true, statutLog: "expedie", dateLivraison: biz.todayISO(), updatedAt: new Date() })
        .where(eq(commande.id, c.id));
    } else if (!complete && c.magasinExpedie && statut === "draft") {
      // BL repassé en brouillon : la commande n'est plus entièrement partie.
      await db.update(commande).set({ magasinExpedie: false, statutLog: "pret", dateLivraison: null, updatedAt: new Date() }).where(eq(commande.id, c.id));
    }
  }
}

export async function supprimerBl(id: number) {
  const lignes = await db.select({ commandeId: blLigne.commandeId }).from(blLigne).where(eq(blLigne.blId, id));
  await db.delete(bl).where(eq(bl.id, id));
  // Les pièces de ce BL reviennent au stock : une commande qui n'est plus
  // entièrement livrée repasse « à expédier ».
  const ids = [...new Set(lignes.map((l) => l.commandeId).filter((x): x is number => x !== null))];
  if (!ids.length) return;
  const expedie = await expeditionsParCommande();
  const commandes = await db.select({ id: commande.id, qte: commande.qte, magasinExpedie: commande.magasinExpedie }).from(commande).where(inArray(commande.id, ids));
  for (const c of commandes) {
    if (c.magasinExpedie && !av.livraisonComplete(c.qte, expedie.get(c.id) ?? 0)) {
      await db.update(commande).set({ magasinExpedie: false, statutLog: "pret", dateLivraison: null, updatedAt: new Date() }).where(eq(commande.id, c.id));
    }
  }
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
    of: c.of,
    modele: c.modele,
    ref: c.refArticle,
    client: c.client,
  }));

  const plans = av.planFaconnier(lignes);
  const mois = [...new Set(lignes.map((l) => l.mois))].sort((a, b) => (a ? a : "9999").localeCompare(b ? b : "9999"));
  return { plans, mois };
}

export async function majStatutLogistique(commandeId: number, statut: string) {
  await db.update(commande).set({ statutLog: statut, updatedAt: new Date() }).where(eq(commande.id, commandeId));
}

/** Bon de réception complet, pour l'impression (document à signer). */
export async function getBrImpression(id: number) {
  const [row] = await db
    .select({ b: br, c: commande, clientNom: client.nom })
    .from(br)
    .leftJoin(commande, eq(br.commandeId, commande.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(eq(br.id, id));
  if (!row) return null;
  const tous = await db.select().from(br).where(eq(br.commandeId, row.b.commandeId)).orderBy(asc(br.date), asc(br.id));
  // Cumul jusqu'à ce bon inclus : où en est la commande après cette réception.
  const jusque = tous.slice(0, tous.findIndex((x) => x.id === id) + 1);
  return {
    br: row.b,
    commande: row.c,
    client: row.clientNom ?? "",
    cumulRecu: jusque.reduce((s, x) => s + x.qteRecue, 0),
    cumulOk: jusque.reduce((s, x) => s + x.qteOk, 0),
    cumulNc: jusque.reduce((s, x) => s + x.qteNc, 0),
    rang: jusque.length,
    total: tous.length,
  };
}
