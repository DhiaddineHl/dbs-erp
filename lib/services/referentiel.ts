import "server-only";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { bl, client, commande, facture } from "@/lib/db/schema";
import * as ref from "@/lib/domain/referentiel";
import { listClients } from "./commandes";

/* Nettoyage du référentiel : ventilation des factures sans société (B12) et
 * fusion des fiches clients en double (B17).
 *
 * Les deux réécrivent des liens portés par plusieurs tables, donc les deux
 * passent par une transaction : une fusion à moitié faite laisserait des
 * commandes rattachées à une fiche qui n'existe plus. */

/* ═══════════ B12 · ventilation des factures « AUTRE » ═══════════ */

export type FactureAVentiler = {
  id: number;
  num: string;
  type: string;
  date: string;
  pieces: number;
  total: number;
  /** Nom libre saisi à l'époque, quand il y en a un. */
  clientRaw: string;
  lignes: { modele: string; ref: string }[];
  /** Société déduite des lignes, "" si rien ne se dégage. */
  propose: string;
  suffrages: ref.Suffrage[];
  indecis: boolean;
};

/** Factures et avoirs sans société rattachée, avec la société déduite.
 *
 * Elles existent parce que l'original permettait d'émettre une facture sans
 * choisir de client : elles comptent alors dans le CA global mais dans le
 * chiffre d'aucun client, ce qui fait que la somme des clients ne retombe
 * jamais sur le total. */
export type Ventilation = {
  factures: FactureAVentiler[];
  /** Sociétés proposables : celles du répertoire, en clair. */
  clients: string[];
};

export async function facturesAVentiler(): Promise<Ventilation> {
  const [rows, commandes, fiches] = await Promise.all([
    db.query.facture.findMany({
      where: and(
        isNull(facture.deletedAt),
        inArray(facture.type, ["facture", "avoir"]),
        or(isNull(facture.clientKey), eq(facture.clientKey, "")),
      ),
      with: { lignes: true },
    }),
    db
      .select({ client: client.nom, modele: commande.modele, refArticle: commande.refArticle })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id)),
    db.select({ nom: client.nom }).from(client).orderBy(client.nom),
  ]);

  const reperes: ref.CommandeRepere[] = commandes.map((c) => ({
    client: c.client ?? "",
    modele: c.modele,
    refArticle: c.refArticle,
  }));

  const factures = rows
    .map((f) => {
      const lignes = [...f.lignes]
        .sort((a, b) => a.idx - b.idx)
        .map((l) => ({ modele: l.modele, ref: l.ref }));
      const d = ref.detecterSociete(lignes, reperes);
      return {
        id: f.id,
        num: f.num,
        type: f.type,
        date: f.date,
        pieces: f.pieces,
        total: f.total,
        clientRaw: f.clientRaw,
        lignes,
        propose: d.propose,
        suffrages: d.suffrages,
        indecis: d.indecis,
      };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.num.localeCompare(b.num));

  return { factures, clients: [...new Set(fiches.map((f) => f.nom).filter(Boolean))] };
}

/** Rattache des factures à une société. Les couples non résolus sont ignorés
 * plutôt que refusés : l'écran en propose beaucoup, l'utilisateur n'en tranche
 * qu'une partie et doit pouvoir enregistrer ce qu'il a fait. */
export async function ventiler(choix: { factureId: number; clientNom: string }[]) {
  const retenus = choix.filter((c) => c.clientNom.trim());
  if (!retenus.length) return 0;

  const noms = [...new Set(retenus.map((c) => c.clientNom.trim()))];
  const fiches = await db
    .select({ key: client.key, nom: client.nom })
    .from(client)
    .where(inArray(client.nom, noms));
  const parNom = new Map(fiches.map((f) => [f.nom, f]));

  let n = 0;
  await db.transaction(async (tx) => {
    for (const c of retenus) {
      const fiche = parNom.get(c.clientNom.trim());
      if (!fiche) continue;
      /* `marque` porte le nom affiché sur la facture ; `clientKey` le lien.
       * Écrire les deux évite qu'une facture affiche encore « AUTRE » alors
       * qu'elle est rattachée. */
      await tx
        .update(facture)
        .set({ clientKey: fiche.key, marque: fiche.nom })
        .where(eq(facture.id, c.factureId));
      n++;
    }
  });
  return n;
}

/* ═══════════ B17 · fusion des clients en double ═══════════ */

export type GroupeFusion = ref.PaireClients;

export async function propositionsFusionClients(): Promise<GroupeFusion[]> {
  const clients = await listClients();
  return ref.propositionsFusionClients(
    clients.map((c) => ({ id: c.id, nom: c.nom, code: c.code, cmd: c.cmd, ca: c.ca })),
  );
}

export type BilanFusion = { commandes: number; bls: number; factures: number; fiches: number };

/** Rapatrie tout ce qui pend aux fiches absorbées sur la fiche gardée, puis
 * supprime les absorbées.
 *
 * Trois liens à reprendre, et pas deux : les commandes et les BL pointent la
 * fiche par son identifiant, les factures par sa clé métier. En oublier un
 * laisserait des lignes orphelines — la contrainte les mettrait à NULL au
 * moment du DELETE, c'est-à-dire un CA qui disparaît sans bruit. */
export async function fusionnerClients(gardeId: number, absorbesIds: number[]): Promise<BilanFusion> {
  const ids = absorbesIds.filter((id) => id !== gardeId);
  if (!ids.length) return { commandes: 0, bls: 0, factures: 0, fiches: 0 };

  return db.transaction(async (tx) => {
    const [garde] = await tx.select().from(client).where(eq(client.id, gardeId));
    if (!garde) throw new Error("Fiche à conserver introuvable");

    const absorbes = await tx.select().from(client).where(inArray(client.id, ids));
    if (!absorbes.length) return { commandes: 0, bls: 0, factures: 0, fiches: 0 };
    const clesAbsorbees = absorbes.map((c) => c.key);

    const cmds = await tx
      .update(commande)
      .set({ clientId: gardeId, updatedAt: new Date() })
      .where(inArray(commande.clientId, ids))
      .returning({ id: commande.id });

    const bls = await tx
      .update(bl)
      .set({ clientId: gardeId })
      .where(inArray(bl.clientId, ids))
      .returning({ id: bl.id });

    const facs = await tx
      .update(facture)
      .set({ clientKey: garde.key, marque: garde.nom })
      .where(inArray(facture.clientKey, clesAbsorbees))
      .returning({ id: facture.id });

    /* Les coordonnées manquantes de la fiche gardée sont complétées par celles
     * des fiches absorbées : c'est souvent le doublon qui portait l'adresse. */
    const complement: Record<string, string> = {};
    for (const champ of ["code", "marque", "contact", "email", "tel", "ville", "pays", "tva", "adresse", "livraison"] as const) {
      if (garde[champ]) continue;
      const trouve = absorbes.find((a) => a[champ]);
      if (trouve) complement[champ] = trouve[champ];
    }
    if (Object.keys(complement).length) await tx.update(client).set(complement).where(eq(client.id, gardeId));

    await tx.delete(client).where(inArray(client.id, ids));

    return { commandes: cmds.length, bls: bls.length, factures: facs.length, fiches: absorbes.length };
  });
}

/** Compte ce qu'une fusion déplacerait, sans rien écrire. */
export async function apercuFusion(absorbesIds: number[]): Promise<BilanFusion> {
  if (!absorbesIds.length) return { commandes: 0, bls: 0, factures: 0, fiches: 0 };
  const cles = await db
    .select({ key: client.key })
    .from(client)
    .where(inArray(client.id, absorbesIds));
  const [cmds, blz, facs] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(commande).where(inArray(commande.clientId, absorbesIds)),
    db.select({ n: sql<number>`count(*)::int` }).from(bl).where(inArray(bl.clientId, absorbesIds)),
    cles.length
      ? db
          .select({ n: sql<number>`count(*)::int` })
          .from(facture)
          .where(inArray(facture.clientKey, cles.map((c) => c.key)))
      : Promise.resolve([{ n: 0 }]),
  ]);
  return {
    commandes: Number(cmds[0]?.n ?? 0),
    bls: Number(blz[0]?.n ?? 0),
    factures: Number(facs[0]?.n ?? 0),
    fiches: absorbesIds.length,
  };
}
