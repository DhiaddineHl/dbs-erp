import "server-only";
import { and, eq, inArray, isNotNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, client, commande, commandePrixJournal, faconnier, modele, ofSupprime } from "@/lib/db/schema";
import type { Taille } from "@/lib/db/schema";
import type { Tone } from "@/components/shared/status-badge";
import * as biz from "@/lib/domain/commande";
import { getSetting } from "@/lib/services/permissions";
import { couvertureTissuParCommande } from "@/lib/services/tissu";

/* Read models. Amounts and dates come out of the DB typed; every status-like
 * field is computed here from lib/domain/commande.ts rather than stored. */

export type CommandeRow = {
  id: number;
  of: string;
  modele: string;
  refArticle: string;
  couleur: string;
  saison: string;
  note: string;

  /** Commande porteuse quand la ligne est une sous-commande, null sinon. */
  parentId: number | null;
  /** N° OF du porteur, "" au premier niveau. */
  parentOf: string;
  /** Nature du rattachement : "" | "decoupe" | "regroupement". */
  lienParent: string;
  /** Nombre de sous-commandes rattachées (0 sur une sous-commande). */
  nbSousCommandes: number;
  /** Vrai sur une ligne qui en porte d'autres. */
  estPorteur: boolean;
  /** Quantité prise sur la ligne par ses parts DÉCOUPÉES (voir `qtePropre`).
   * Les membres d'un regroupement gardent la leur et n'y entrent pas. */
  qteAffectee: number;
  /** Pièces du groupe entier : ce dont le porteur répond, plus ses membres.
   * Sur une découpe c'est la quantité du porteur, sur un regroupement la somme
   * des OF réunis. C'est cette quantité que la matière doit couvrir. */
  qteGroupe: number;
  /** Quantité dont la ligne répond elle-même : `qte` moins ce qu'elle a
   * délégué. C'est elle qui entre dans les totaux, sans quoi une commande
   * découpée en trois verrait son CA compté quatre fois. */
  qtePropre: number;
  /** CA et marge de la seule part non déléguée. Égaux à `ca` / `margeTotale`
   * tant qu'il n'y a pas de sous-commande. */
  caPropre: number;
  margePropre: number;
  /* Totaux du groupe — la ligne et ses sous-commandes, chaque pièce à son
   * propre prix. Égaux aux valeurs de la ligne quand elle n'en a aucune.
   *
   * `ca` et `margeTotale`, eux, restent ceux de la ligne seule : le contrat
   * tel que la mère le porte, à son prix. Les trois lectures coexistent parce
   * qu'elles répondent à trois questions différentes — ce que la ligne vaut,
   * ce dont elle répond, ce que l'ensemble rapporte. */
  caGroupe: number;
  margeGroupe: number;

  clientId: number | null;
  client: string;
  faconnierId: number | null;
  faconnier: string;
  chaineId: number | null;
  chaine: string;
  /** Whichever of façonnier / chaîne the commande is assigned to. */
  assigne: string;

  qte: number;
  tailles: Taille[];
  prixVente: number | null;
  prixFacon: number | null;

  /* derived money */
  ca: number;
  margeUnitaire: number;
  margeTotale: number;
  margePct: number;

  /* Compteurs bruts : ceux de la ligne, saisis sur elle. */
  produit: number;
  coupeQte: number;
  magasinQte: number;
  factureQte: number;
  /** Avancement du groupe sur une mère découpée, de la ligne sinon. */
  av: number;

  consoTheo: number | null;
  consoReel: number | null;
  chutePct: number | null;
  tissuRecu: number;
  besoinTissu: number;
  ecartTissu: number | null;
  /* Couverture depuis le magasin tissu par lots. */
  tissuAffecte: number;
  tissuConsomme: number;
  tissuLots: string[];

  receptTissu: string;
  dateExport: string;
  dateExportReel: string;
  dateLivraison: string;
  exportPrev: string;

  tissuLibere: boolean;
  magasinPrepare: boolean;
  magasinExpedie: boolean;
  archived: boolean;
  statutLog: string;
  facNums: string[];
  /** Hash de la photo du modèle, null quand il n'y en a pas. */
  photoHash: string | null;

  /* derived status — [tone, label] tuples for the shared badge components */
  statutKey: biz.Statut;
  statut: [Tone, string];
  statutManuel: string;
  retard: [Tone, string];
  retardJours: number | null;
};

export type ClientRow = {
  id: number;
  key: string;
  code: string;
  nom: string;
  marque: string;
  contact: string;
  email: string;
  tel: string;
  ville: string;
  pays: string;
  tva: string;
  adresse: string;
  /** Derived: active commandes and their CA. */
  cmd: number;
  ca: number;
};

export type FaconnierRow = {
  id: number;
  nom: string;
  specialite: string;
  contact: string;
  tel: string;
  prixFacon: number | null;
  /** Derived: active commandes and the pieces still to produce. */
  cmd: number;
  charge: number;
};

const iso = (d: string | null) => d ?? "";

/** Waste rate used when a commande does not carry its own. */
export const getChuteDefaut = () => getSetting<number>("chutePct", 5);

/* ─────────── commandes ─────────── */

type ListOptions = {
  /** Default false — archived commandes belong to /archives. */
  includeArchived?: boolean;
  onlyArchived?: boolean;
};

export async function listCommandes(opts: ListOptions = {}): Promise<CommandeRow[]> {
  const [rows, chuteDefaut, modeles, couvertureTissu] = await Promise.all([
    db
      .select({
        c: commande,
        clientNom: client.nom,
        faconnierNom: faconnier.nom,
        chaineNom: chaine.nom,
      })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
      .leftJoin(chaine, eq(commande.chaineId, chaine.id))
      .orderBy(commande.id),
    getChuteDefaut(),
    db.select({ nom: modele.nom }).from(modele),
    couvertureTissuParCommande(),
  ]);

  // A modèle already declared in GPAO counts as "in production" even before the
  // first piece is booked against the commande (PilotPro's _gpaoHasModel).
  const gpaoModeles = new Set(modeles.map((m) => biz.normaliserNom(m.nom)));
  const now = new Date();

  /* Les sous-commandes sont indexées AVANT le filtre d'archivage : les totaux
   * d'une commande mère doivent tenir compte de tout ce qui lui est rattaché,
   * y compris une sous-commande que l'écran courant ne montre pas. Sinon la
   * même commande vaudrait deux CA différents selon l'écran qui la lit. */
  const enfantsDe = new Map<number, (typeof rows)[number]["c"][]>();
  const parId = new Map<number, (typeof rows)[number]["c"]>();
  for (const { c } of rows) parId.set(c.id, c);
  for (const { c } of rows) {
    if (c.parentId == null || !parId.has(c.parentId)) continue;
    const liste = enfantsDe.get(c.parentId);
    if (liste) liste.push(c);
    else enfantsDe.set(c.parentId, [c]);
  }

  return rows
    .filter(({ c }) =>
      opts.onlyArchived ? c.archived : opts.includeArchived ? true : !c.archived,
    )
    .map(({ c, clientNom, faconnierNom, chaineNom }) => {
      const ctx = { enProductionGpao: gpaoModeles.has(biz.normaliserNom(c.modele)), now };
      const assigne = faconnierNom ?? chaineNom ?? "";

      const enfants = enfantsDe.get(c.id) ?? [];
      const qtePropre = biz.qtePropre(c, enfants);
      const groupe = biz.totauxGroupe(c, enfants);

      /* Statut et avancement : ce sont les DEUX natures de lien qui décident,
       * et elles ne répondent pas pareil.
       *
       * Une commande DÉCOUPÉE parle du contrat : ce qui intéresse le
       * commercial, c'est si les 1 200 pièces promises sont prêtes, pas si les
       * 400 gardées par la mère le sont. Les parts sont donc agrégées.
       *
       * Un REGROUPEMENT, non : ses membres sont des OF entiers, qui se
       * produisent, se livrent et se facturent chacun pour soi — seule la
       * matière est commune. Agréger ferait dire « terminée » à un porteur de
       * 330 pièces dès que le groupe en a produit 330, quand bien même les 34
       * des autres OF n'auraient pas commencé.
       *
       * Les compteurs bruts (produit, facturé) restent ceux de la ligne dans
       * les deux cas : ce sont des faits saisis, chacun sur le sien. */
      const parts = enfants.filter((e) => e.lienParent === "decoupe");
      const contrat = parts.length ? biz.totauxGroupe(c, parts) : null;
      const pourAffichage = contrat
        ? { ...c, produit: contrat.produit, factureQte: contrat.factureQte }
        : c;
      const statutKey = biz.statutEffectif(pourAffichage, ctx);
      const r = biz.retard(pourAffichage, now);

      return {
        id: c.id,
        of: c.ofNumber,
        modele: c.modele,
        refArticle: c.refArticle,
        couleur: c.couleur,
        saison: c.saison,
        note: c.note,

        parentId: c.parentId,
        parentOf: (c.parentId != null && parId.get(c.parentId)?.ofNumber) || "",
        lienParent: c.lienParent,
        nbSousCommandes: enfants.length,
        estPorteur: enfants.length > 0,
        qteAffectee: biz.qteAffectee(enfants),
        qteGroupe: groupe.qte,
        qtePropre,
        caPropre: Math.round((c.prixVente ?? 0) * qtePropre * 100) / 100,
        margePropre: Math.round(biz.margeUnitaire(c) * qtePropre * 100) / 100,
        caGroupe: groupe.ca,
        margeGroupe: groupe.margeTotale,

        clientId: c.clientId,
        client: clientNom ?? "",
        faconnierId: c.faconnierId,
        faconnier: faconnierNom ?? "",
        chaineId: c.chaineId,
        chaine: chaineNom ?? "",
        assigne,

        qte: c.qte,
        tailles: c.tailles,
        prixVente: c.prixVente,
        prixFacon: c.prixFacon,

        ca: biz.chiffreAffaires(c),
        margeUnitaire: biz.margeUnitaire(c),
        margeTotale: biz.margeTotale(c),
        margePct: biz.margePct(c),

        produit: c.produit,
        coupeQte: c.coupeQte,
        magasinQte: c.magasinQte,
        factureQte: c.factureQte,
        av: contrat ? contrat.av : biz.avancementPct(c),

        consoTheo: c.consoTheo,
        consoReel: c.consoReel,
        chutePct: c.chutePct,
        tissuRecu: c.tissuRecu,
        /* Le besoin d'un porteur couvre tout son groupe : le tissu s'achète
         * une fois pour la référence, pas une fois par OF. Sur une ligne sans
         * sous-commande, la quantité du groupe est la sienne. */
        besoinTissu: biz.besoinTissu(c, chuteDefaut, groupe.qte),
        ecartTissu: biz.ecartTissu(c, chuteDefaut, groupe.qte),
        tissuAffecte: couvertureTissu.get(c.id)?.affecte ?? 0,
        tissuConsomme: couvertureTissu.get(c.id)?.consomme ?? 0,
        tissuLots: couvertureTissu.get(c.id)?.lots ?? [],

        receptTissu: iso(c.receptTissu),
        dateExport: iso(c.dateExport),
        dateExportReel: iso(c.dateExportReel),
        dateLivraison: iso(c.dateLivraison),
        exportPrev: iso(c.exportPrev),

        tissuLibere: c.tissuLibere,
        magasinPrepare: c.magasinPrepare,
        magasinExpedie: c.magasinExpedie,
        archived: c.archived,
        statutLog: c.statutLog,
        facNums: c.facNums,
        photoHash: c.photoHash,

        statutKey,
        statut: biz.statutBadge(statutKey),
        statutManuel: c.statutManuel ?? "",
        retard: [r.tone, r.label] as [Tone, string],
        retardJours: r.jours,
      };
    });
}

export const listArchives = () => listCommandes({ onlyArchived: true });

/* ─────────── reference data with derived counters ─────────── */

/* Quantité dont la ligne répond elle-même, en SQL : la quantité totale moins
 * ce qui est parti en sous-commandes. Chaque pièce n'est ainsi comptée qu'une
 * fois — sur la mère tant qu'elle n'a rien délégué, sur l'enfant ensuite.
 * C'est la traduction de `biz.qtePropre` côté base. */
const QTE_PROPRE = sql`greatest(${commande.qte} - coalesce((select sum(sc.qte) from commande sc where sc.parent_id = ${commande.id}), 0), 0)`;

/** Active (non-archived) commandes per client: count + CA.
 *
 * Une sous-commande n'est pas une commande de plus pour le client : c'est une
 * part de la sienne, confiée ailleurs. Elle ne compte donc pas dans `cmd`,
 * mais son CA propre compte, puisqu'elle peut être vendue à son propre prix. */
async function commandeAggregatsClient() {
  const rows = await db
    .select({
      clientId: commande.clientId,
      cmd: sql<number>`count(*) filter (where ${commande.parentId} is null)::int`,
      ca: sql<number>`coalesce(sum(coalesce(${commande.prixVente}, 0) * ${QTE_PROPRE}), 0)::float8`,
    })
    .from(commande)
    .where(eq(commande.archived, false))
    .groupBy(commande.clientId);
  return new Map(rows.filter((r) => r.clientId != null).map((r) => [r.clientId!, r]));
}

/** Active commandes per façonnier: count + pieces left to produce.
 *
 * Ici les sous-commandes comptent une par une : c'est précisément à quoi elles
 * servent — confier une part du travail à un atelier donné, qui la voit comme
 * une commande entière. */
async function commandeAggregatsFaconnier() {
  const rows = await db
    .select({
      faconnierId: commande.faconnierId,
      cmd: sql<number>`count(*)::int`,
      charge: sql<number>`coalesce(sum(greatest(${QTE_PROPRE} - ${commande.produit}, 0)), 0)::int`,
    })
    .from(commande)
    .where(eq(commande.archived, false))
    .groupBy(commande.faconnierId);
  return new Map(rows.filter((r) => r.faconnierId != null).map((r) => [r.faconnierId!, r]));
}

export async function listClients(): Promise<ClientRow[]> {
  const [rows, agg] = await Promise.all([
    db.select().from(client).orderBy(client.nom),
    commandeAggregatsClient(),
  ]);
  return rows.map((c) => ({
    id: c.id,
    key: c.key,
    code: c.code,
    nom: c.nom,
    marque: c.marque,
    contact: c.contact,
    email: c.email,
    tel: c.tel,
    ville: c.ville,
    pays: c.pays,
    tva: c.tva,
    adresse: c.adresse,
    cmd: agg.get(c.id)?.cmd ?? 0,
    ca: agg.get(c.id)?.ca ?? 0,
  }));
}

export async function listFaconniers(): Promise<FaconnierRow[]> {
  const [rows, agg] = await Promise.all([
    db.select().from(faconnier).orderBy(faconnier.nom),
    commandeAggregatsFaconnier(),
  ]);
  return rows.map((f) => ({
    id: f.id,
    nom: f.nom,
    specialite: f.specialite,
    contact: f.contact,
    tel: f.tel,
    prixFacon: f.prixFacon,
    cmd: agg.get(f.id)?.cmd ?? 0,
    charge: agg.get(f.id)?.charge ?? 0,
  }));
}

/* ─────────── name → id resolution ───────────
 * Commandes arrive from forms and spreadsheets carrying names, not ids. Rather
 * than reject them, resolve loosely and create the missing reference row —
 * which is what an operator typing a new façonnier into the grid expects. */

export async function resolveClientId(nom: string | undefined | null): Promise<number | null> {
  const wanted = biz.normaliserNom(nom);
  if (!wanted) return null;
  const rows = await db.select({ id: client.id, nom: client.nom }).from(client);
  const hit = rows.find((c) => biz.normaliserNom(c.nom) === wanted);
  if (hit) return hit.id;

  const base = biz.slugClient(nom!);
  const taken = new Set(
    (await db.select({ key: client.key }).from(client)).map((c) => c.key),
  );
  let key = base;
  for (let i = 2; taken.has(key); i++) key = `${base}_${i}`;

  const code = `CLI-${String((await db.$count(client)) + 1).padStart(3, "0")}`;
  const [row] = await db
    .insert(client)
    .values({ key, code, nom: nom!.trim() })
    .returning({ id: client.id });
  return row.id;
}

export async function resolveFaconnierId(nom: string | undefined | null): Promise<number | null> {
  const wanted = biz.normaliserNom(nom);
  if (!wanted) return null;
  const rows = await db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier);
  const hit = rows.find((f) => biz.normaliserNom(f.nom) === wanted);
  if (hit) return hit.id;
  const [row] = await db
    .insert(faconnier)
    .values({ nom: nom!.trim() })
    .returning({ id: faconnier.id });
  return row.id;
}

/* ─────────── OF numbering ─────────── */

/** Next free OF number for the year, skipping numbers already used or tombstoned. */
export async function prochainNumeroOF(annee = new Date().getFullYear()): Promise<string> {
  const [used, deleted] = await Promise.all([
    db.select({ n: commande.ofNumber }).from(commande),
    db.select({ n: ofSupprime.ofNumber }).from(ofSupprime),
  ]);
  const all = [...used.map((r) => r.n), ...deleted.map((r) => r.n)];
  return biz.numeroOF(biz.dernierSequenceOF(all, annee) + 1, annee);
}

/** `n` numéros libres pour les sous-commandes de `parentOf`.
 *
 * Les rangs déjà pris — y compris ceux d'une sous-commande supprimée, dont le
 * n° est enterré dans `of_supprime` — sont sautés : un numéro réutilisé
 * ferait pointer deux BL différents sur la même ligne d'historique. */
export async function numerosSousCommandes(parentOf: string, n: number): Promise<string[]> {
  if (n <= 0) return [];
  const [used, deleted] = await Promise.all([
    db.select({ x: commande.ofNumber }).from(commande),
    db.select({ x: ofSupprime.ofNumber }).from(ofSupprime),
  ]);
  const pris = new Set([...used, ...deleted].map((r) => r.x));
  const out: string[] = [];
  for (let rang = 1; out.length < n; rang++) {
    const num = biz.numeroSousCommande(parentOf, rang);
    if (pris.has(num)) continue;
    pris.add(num);
    out.push(num);
  }
  return out;
}

/* ─────────── writes ─────────── */

export type CommandeInput = Omit<typeof commande.$inferInsert, "id" | "createdAt" | "updatedAt">;

export async function insertCommande(values: CommandeInput) {
  const [row] = await db.insert(commande).values(values).returning({ id: commande.id });
  return row.id;
}

export async function insertManyCommandes(values: CommandeInput[]) {
  if (!values.length) return [];
  return db.insert(commande).values(values).returning({ id: commande.id });
}

export const getCommande = async (id: number) => {
  const [row] = await db.select().from(commande).where(eq(commande.id, id));
  return row ?? null;
};

/* ─────────── sous-commandes ─────────── */

/** Les sous-commandes d'une mère, dans l'ordre de création. */
export const getSousCommandes = (parentId: number) =>
  db.select().from(commande).where(eq(commande.parentId, parentId)).orderBy(commande.id);

/** Ids des sous-commandes d'une sélection, la sélection non comprise.
 *
 * `lien` restreint à une nature de rattachement — les parts d'une découpe
 * suivent leur porteur là où les membres d'un regroupement ne le suivent pas.
 *
 * Un seul niveau, donc une seule requête : une sous-commande ne se redécoupe
 * pas, la règle est tenue par `insertSousCommandes` et `regrouperSous`. */
export async function idsSousCommandes(ids: number[], lien?: biz.LienSousCommande): Promise<number[]> {
  if (!ids.length) return [];
  const rows = await db
    .select({ id: commande.id })
    .from(commande)
    .where(
      lien
        ? and(inArray(commande.parentId, ids), eq(commande.lienParent, lien))
        : inArray(commande.parentId, ids),
    );
  return rows.map((r) => r.id);
}

/** Rattache des sous-commandes à une mère.
 *
 * Trois invariants tenus ici plutôt que dans l'écran, parce qu'une action
 * serveur s'appelle directement :
 *   · le modèle est celui de la mère — c'est le même article ;
 *   · le client aussi : une part de commande ne change pas de destinataire ;
 *   · la mère visée doit être une commande de premier niveau. */
export async function insertSousCommandes(
  parentId: number,
  valeurs: Omit<CommandeInput, "parentId" | "lienParent" | "modele" | "clientId">[],
) {
  if (!valeurs.length) return [];
  const parent = await getCommande(parentId);
  if (!parent) throw new Error("Commande mère introuvable");
  if (parent.parentId != null)
    throw new Error("Une sous-commande ne peut pas être découpée à son tour");

  return db
    .insert(commande)
    .values(
      valeurs.map((v) => ({
        ...v,
        parentId,
        // Créées avec le porteur : ce sont des parts, pas des OF réunis.
        lienParent: "decoupe" as const,
        modele: parent.modele,
        clientId: parent.clientId,
      })),
    )
    .returning({ id: commande.id });
}

/** Réunit des OF existants sous un porteur.
 *
 * Contrairement à la découpe, rien n'est créé ni recopié : les OF gardent leur
 * quantité, leur prix, leur production et leur facture. Seul le rattachement
 * est écrit, et il ne change qu'une chose — qui gère la matière et le contrôle
 * qualité pour tout le groupe.
 *
 * Les refus sont ici et non dans l'écran, parce qu'une action serveur
 * s'appelle directement :
 *   · un OF déjà rattaché ailleurs n'est pas volé à son porteur ;
 *   · un porteur qui porte déjà une découpe ne peut pas recevoir de membres :
 *     les deux natures ne se mélangent pas sous une même ligne, leurs
 *     quantités ne s'additionnent pas de la même façon ;
 *   · on ne rattache pas un OF à lui-même, ni à l'une de ses propres parts —
 *     le découpage s'arrête à un niveau.
 *
 * Renvoie le nombre d'OF effectivement rattachés. */
export async function regrouperSous(porteurId: number, ids: number[]): Promise<number> {
  const membres = ids.filter((id) => id !== porteurId);
  if (!membres.length) throw new Error("Aucun OF à rattacher");

  const porteur = await getCommande(porteurId);
  if (!porteur) throw new Error("OF porteur introuvable");
  if (porteur.parentId != null)
    throw new Error(`${porteur.ofNumber} est déjà rattaché à un autre OF — déliez-le d'abord`);

  const dejaPortees = await getSousCommandes(porteurId);
  if (dejaPortees.some((e) => e.lienParent === "decoupe"))
    throw new Error(
      `${porteur.ofNumber} est déjà découpé en sous-commandes : un OF ne peut pas être à la fois découpé et porteur d'un regroupement`,
    );

  const lignes = await db.select().from(commande).where(inArray(commande.id, membres));
  for (const l of lignes) {
    if (l.parentId != null && l.parentId !== porteurId)
      throw new Error(`${l.ofNumber} est déjà rattaché à un autre OF — déliez-le d'abord`);
    if (dejaPortees.length === 0 && (await db.$count(commande, eq(commande.parentId, l.id))) > 0)
      throw new Error(`${l.ofNumber} porte lui-même des sous-commandes — déliez-les d'abord`);
  }

  const r = await db
    .update(commande)
    .set({ parentId: porteurId, lienParent: "regroupement", updatedAt: new Date() })
    .where(inArray(commande.id, membres))
    .returning({ id: commande.id });
  return r.length;
}

/** Détache des sous-commandes de leur porteur.
 *
 * Elles redeviennent des OF autonomes — c'est vrai pour un regroupement, dont
 * les membres n'ont jamais cessé d'être des commandes entières. Une part issue
 * d'une DÉCOUPE déliée devient, elle, une commande de plein droit qui s'ajoute
 * au total du client : sa quantité ne se retranche plus de celle du porteur.
 * C'est la lecture correcte — les pièces existent — mais elle change le CA, et
 * l'écran doit le dire avant. */
export async function delierSous(ids: number[]): Promise<number> {
  if (!ids.length) return 0;
  const r = await db
    .update(commande)
    .set({ parentId: null, lienParent: "", updatedAt: new Date() })
    .where(inArray(commande.id, ids))
    .returning({ id: commande.id });
  return r.length;
}

/** Aligne le modèle des parts DÉCOUPÉES sur celui de leur mère.
 *
 * Une part découpée ne possède pas son modèle en propre : elle produit le même
 * article, et renommer la mère sans suivre laisserait des lignes orphelines
 * dans GPAO et dans le rapprochement de facturation, qui travaillent tous deux
 * par nom de modèle.
 *
 * Les membres d'un REGROUPEMENT gardent le leur : ce sont des OF distincts,
 * réunis pour la matière, et rien ne dit que le commercial les a libellés à
 * l'identique — c'est même pour cela que la détection se fait sur la référence
 * et non sur le modèle. */
export async function propagerModele(parentId: number, modeleNom: string) {
  await db
    .update(commande)
    .set({ modele: modeleNom, updatedAt: new Date() })
    .where(
      and(
        eq(commande.parentId, parentId),
        eq(commande.lienParent, "decoupe"),
        sql`${commande.modele} <> ${modeleNom}`,
      ),
    );
}

/** Update a commande and journal any price movement in the same transaction. */
export async function updateCommande(
  id: number,
  patch: Partial<CommandeInput>,
  auteur: { id?: string; name: string },
) {
  await db.transaction(async (tx) => {
    const [before] = await tx.select().from(commande).where(eq(commande.id, id));
    if (!before) throw new Error("Commande introuvable");

    await tx
      .update(commande)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(commande.id, id));

    const mouvements = (["prixVente", "prixFacon"] as const)
      .filter((champ) => champ in patch && (patch[champ] ?? null) !== (before[champ] ?? null))
      .map((champ) => ({
        commandeId: id,
        ofNumber: before.ofNumber,
        champ,
        ancien: before[champ],
        nouveau: patch[champ] ?? null,
        userId: auteur.id ?? null,
        userName: auteur.name,
      }));
    if (mouvements.length) await tx.insert(commandePrixJournal).values(mouvements);
  });
}

/** Delete commandes and tombstone their OF numbers so a re-import can't
 * resurrect them (PilotPro keeps the same list as `ds.deletedOfs`). */
export async function deleteCommandes(ids: number[], parUserId?: string) {
  if (!ids.length) return;
  await db.transaction(async (tx) => {
    /* Supprimer un porteur emporte ses parts DÉCOUPÉES. La clé étrangère est
     * en `set null` : sans ce ramassage, les parts détachées resteraient en
     * base comme des commandes de plein droit, et la quantité totale du client
     * serait comptée deux fois. Leurs n° OF sont enterrés avec les autres.
     *
     * Les membres d'un REGROUPEMENT survivent, déliés : ce sont des commandes
     * entières, qui existaient avant le lien et que le client attend toujours.
     * Les emporter effacerait des OF que personne n'a demandé de supprimer. */
    const enfants = await tx
      .select({ id: commande.id, lien: commande.lienParent })
      .from(commande)
      .where(inArray(commande.parentId, ids));

    const regroupes = enfants.filter((e) => e.lien === "regroupement").map((e) => e.id);
    if (regroupes.length)
      await tx
        .update(commande)
        .set({ parentId: null, lienParent: "", updatedAt: new Date() })
        .where(inArray(commande.id, regroupes));

    const tous = [
      ...new Set([...ids, ...enfants.filter((e) => e.lien === "decoupe").map((e) => e.id)]),
    ];

    const rows = await tx
      .select({ n: commande.ofNumber })
      .from(commande)
      .where(inArray(commande.id, tous));
    await tx.delete(commande).where(inArray(commande.id, tous));
    if (rows.length) {
      await tx
        .insert(ofSupprime)
        .values(rows.map((r) => ({ ofNumber: r.n, parUserId: parUserId ?? null })))
        .onConflictDoNothing({ target: ofSupprime.ofNumber });
    }
  });
}

/** Nom du modèle porté par une commande. Sert à rafraîchir la fiche GPAO du
 * bon modèle après un renommage — l'ancien nom comme le nouveau. */
export async function nomModele(id: number): Promise<string> {
  const [row] = await db.select({ modele: commande.modele }).from(commande).where(eq(commande.id, id));
  return row?.modele ?? "";
}

/** Archive (ou désarchive) une sélection et ses parts découpées.
 *
 * Une part ne survit pas au tout : laisser une part active sous un porteur
 * archivé la ferait apparaître seule dans le carnet, sans le contrat qu'elle
 * sert.
 *
 * Les membres d'un REGROUPEMENT restent actifs — ce sont des commandes
 * entières — mais ils sont DÉLIÉS au passage. Sans cela ils resteraient
 * rattachés à un porteur sorti des écrans matière, où le lien les empêche
 * justement d'apparaître : ils disparaîtraient des deux côtés à la fois. Rendus
 * autonomes, ils redeviennent visibles et gèrent leur propre tissu. */
export async function setArchived(ids: number[], archived: boolean) {
  if (!ids.length) return;
  if (archived) {
    const membres = await idsSousCommandes(ids, "regroupement");
    if (membres.length) await delierSous(membres);
  }
  const tous = [...new Set([...ids, ...(await idsSousCommandes(ids, "decoupe"))])];
  await db
    .update(commande)
    .set({ archived, updatedAt: new Date() })
    .where(inArray(commande.id, tous));
}

/** Commandes sharing a (client, modèle, référence) key — PilotPro's
 * detectDoublons, which catches the same order entered twice. */
export async function detecterDoublons() {
  const rows = await listCommandes({ includeArchived: true });
  const groups = new Map<string, CommandeRow[]>();
  for (const r of rows) {
    /* Une sous-commande partage forcément client et modèle avec sa mère :
     * signalée comme doublon, elle noierait les vrais sous un bruit garanti.
     * Seules les commandes de premier niveau sont rapprochées. */
    if (r.parentId != null) continue;
    const k = biz.cleRapprochement(r.client, r.modele, r.refArticle);
    const group = groups.get(k);
    if (group) group.push(r);
    else groups.set(k, [r]);
  }
  return [...groups.values()].filter((g) => g.length > 1);
}

/** Inscrit une sélection au planning d'export.
 *
 * `exportPrev` est la date *prévue*, distincte de `dateExport` qui est la date
 * contractuelle : Prévision Export affiche la première quand elle existe. On
 * ne touche donc jamais à l'engagement pris envers le client — on note ce que
 * l'atelier pense pouvoir tenir. Une date vide remet la ligne sur sa date
 * contractuelle. */
export async function planifierExport(ids: number[], date: string | null) {
  if (!ids.length) return 0;
  const r = await db
    .update(commande)
    .set({ exportPrev: date, updatedAt: new Date() })
    .where(inArray(commande.id, ids))
    .returning({ id: commande.id });
  return r.length;
}

/* ─────────── reference writes ─────────── */

export const insertClient = (v: typeof client.$inferInsert) => db.insert(client).values(v);
export const insertFaconnier = (v: typeof faconnier.$inferInsert) => db.insert(faconnier).values(v);
export const countClients = () => db.$count(client);
export const countCommandes = () => db.$count(commande);

export async function updateClient(id: number, patch: Partial<typeof client.$inferInsert>) {
  await db.update(client).set(patch).where(eq(client.id, id));
}
export async function updateFaconnier(id: number, patch: Partial<typeof faconnier.$inferInsert>) {
  await db.update(faconnier).set(patch).where(eq(faconnier.id, id));
}
export async function deleteClients(ids: number[]) {
  if (ids.length) await db.delete(client).where(inArray(client.id, ids));
}
export async function deleteFaconniers(ids: number[]) {
  if (ids.length) await db.delete(faconnier).where(inArray(faconnier.id, ids));
}

/* ─────────── photo du modèle (B7) ─────────── */

export async function attacherPhoto(id: number, hash: string) {
  await db.update(commande).set({ photoHash: hash, updatedAt: new Date() }).where(eq(commande.id, id));
}

export async function retirerPhoto(id: number) {
  await db.update(commande).set({ photoHash: null, updatedAt: new Date() }).where(eq(commande.id, id));
}

/** Retire la photo des commandes livrées ou archivées.
 *
 * Une photo sert à reconnaître l'article pendant la production ; la
 * marchandise partie, elle n'est plus qu'un poids en base. Seule la référence
 * est retirée : les octets sont adressés par leur contenu et peuvent être
 * partagés avec une inspection qualité, qui, elle, doit les garder. */
export async function purgerPhotosLivrees(): Promise<number> {
  /* `statut_manuel` est NULL sur la plupart des lignes, et `NULL = 'livree'`
   * vaut NULL, pas faux : sans le coalesce, tout le OR retomberait sur NULL
   * dès que le statut n'est pas forcé. Le WHERE traiterait ce NULL comme faux
   * — donc au bon endroit ici, mais par accident. On l'écrit explicitement. */
  const candidates = await db
    .select({ id: commande.id })
    .from(commande)
    .where(
      and(
        isNotNull(commande.photoHash),
        or(
          eq(commande.archived, true),
          sql`coalesce(${commande.statutManuel}, '') = 'livree'`,
          sql`${commande.qte} > 0 and ${commande.factureQte} >= ${commande.qte}`,
        ),
      ),
    );
  if (!candidates.length) return 0;
  await db
    .update(commande)
    .set({ photoHash: null, updatedAt: new Date() })
    .where(inArray(commande.id, candidates.map((c) => c.id)));
  return candidates.length;
}

/* ─────────── price journal ─────────── */

export async function historiquePrix(commandeId: number) {
  return db
    .select()
    .from(commandePrixJournal)
    .where(eq(commandePrixJournal.commandeId, commandeId))
    .orderBy(commandePrixJournal.ts);
}
