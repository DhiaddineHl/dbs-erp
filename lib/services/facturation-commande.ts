import "server-only";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, facture, factureCostLine, factureLigne } from "@/lib/db/schema";
import { client as clientTable } from "@/lib/db/schema/referentiel";
import * as biz from "@/lib/domain/commande";
import * as fc from "@/lib/domain/facturation-commande";
import { listCommandes } from "./commandes";

/* Écritures de la passerelle commande ↔ facture.
 *
 * Le calcul est dans lib/domain/facturation-commande.ts ; ici on ne fait que
 * lire, écrire et tenir la transaction. */

/* ─────────── B1 · facturer une commande ─────────── */

export type CibleFacture = { num: string; type: string; pieces: number; total: number; date: string };

/** Factures ouvertes du même client, pour proposer un regroupement.
 *
 * Regrouper est le cas courant : on facture six commandes du même client sur
 * une seule facture mensuelle. Sans cette liste, chaque commande créerait sa
 * propre facture et le client en recevrait six. */
export async function facturesDuClient(clientNom: string): Promise<CibleFacture[]> {
  if (!clientNom.trim()) return [];
  const rows = await db
    .select({
      num: facture.num,
      type: facture.type,
      pieces: facture.pieces,
      total: facture.total,
      date: facture.date,
      marque: facture.marque,
      clientKey: facture.clientKey,
    })
    .from(facture)
    .where(and(eq(facture.type, "facture"), isNull(facture.deletedAt)));

  const cle = biz.normaliserNom(clientNom);
  const slug = biz.slugClient(clientNom);
  return rows
    .filter((f) => biz.normaliserNom(f.marque) === cle || f.clientKey === slug)
    .map(({ num, type, pieces, total, date }) => ({ num, type, pieces, total, date }))
    .sort((a, b) => b.num.localeCompare(a.num, "fr", { numeric: true }));
}

/** Prochain numéro de la série créée depuis les commandes ("PP-007/2026"). */
export async function prochainNumeroPasserelle(annee = new Date().getFullYear()): Promise<string> {
  const rows = await db.select({ num: facture.num }).from(facture);
  const motif = new RegExp(`^PP-(\\d+)/${annee}$`);
  let max = 0;
  for (const r of rows) {
    const m = motif.exec(r.num);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `PP-${String(max + 1).padStart(3, "0")}/${annee}`;
}

export type ResultatFacturation = {
  numero: string;
  qte: number;
  complete: boolean;
  /** La facture existait déjà : la commande y a été ajoutée. */
  regroupee: boolean;
  reste: number;
};

/** Facture une quantité d'une commande, sur une facture neuve ou existante.
 *
 * Tout se joue dans une seule transaction : la ligne de facture, sa ligne de
 * coût, les totaux d'en-tête et la quantité facturée de la commande. Un
 * enregistrement à moitié fait laisserait une facture qui ne correspond plus
 * à ce que la commande déclare — et c'est la marge qui s'en trouve fausse. */
export async function facturerCommande(
  commandeId: number,
  saisie: fc.SaisieFacturation & { cible?: string; numero?: string; date?: string },
): Promise<ResultatFacturation> {
  const ligneCmd = (await listCommandes({ includeArchived: true })).find((c) => c.id === commandeId);
  if (!ligneCmd) throw new Error("Commande introuvable");

  const brouillon = fc.preparerFacturation(ligneCmd, saisie);
  if (!brouillon) throw new Error("Commande déjà entièrement facturée");

  const numero = (saisie.cible || saisie.numero || "").trim();
  if (!numero) throw new Error("Numéro de facture manquant");
  const dateFacture = saisie.date || ligneCmd.dateLivraison || biz.todayISO();

  return db.transaction(async (tx) => {
    const [existante] = await tx
      .select({ id: facture.id, pieces: facture.pieces, total: facture.total })
      .from(facture)
      .where(and(eq(facture.num, numero), eq(facture.type, "facture")));

    let factureId: number;
    let regroupee = false;

    if (existante) {
      regroupee = true;
      factureId = existante.id;
      await tx
        .update(facture)
        .set({
          pieces: existante.pieces + brouillon.qte,
          total: Math.round((existante.total + brouillon.ligne.mt) * 100) / 100,
          deletedAt: null,
        })
        .where(eq(facture.id, factureId));
    } else {
      /* Le client de la facture est rattaché par sa clé quand elle existe :
       * sans ça la facture tombe dans « AUTRE » et fausse le CA par société.
       * La commande porte parfois un nom de client sans fiche liée (clientId
       * vide, saisie libre) — on retente alors par le nom avant d'abandonner,
       * pour ne pas perdre le rattachement alors que le nom est correct. */
      let fiche: { key: string } | undefined;
      if (ligneCmd.clientId != null) {
        [fiche] = await tx.select({ key: clientTable.key }).from(clientTable).where(eq(clientTable.id, ligneCmd.clientId));
      }
      if (!fiche && ligneCmd.client) {
        const cle = biz.normaliserNom(ligneCmd.client);
        const candidats = await tx.select({ key: clientTable.key, nom: clientTable.nom }).from(clientTable);
        fiche = candidats.find((c) => biz.normaliserNom(c.nom) === cle);
      }
      const [cree] = await tx
        .insert(facture)
        .values({
          num: numero,
          type: "facture",
          date: dateFacture,
          clientKey: fiche?.key ?? null,
          marque: ligneCmd.client,
          pieces: brouillon.qte,
          total: brouillon.ligne.mt,
        })
        .returning({ id: facture.id });
      factureId = cree.id;
    }

    // L'index de ligne suit celles déjà posées : la ligne de coût s'y accroche.
    const dejaPosees = await tx.select({ idx: factureLigne.idx }).from(factureLigne).where(eq(factureLigne.factureId, factureId));
    const idx = dejaPosees.reduce((m, l) => Math.max(m, l.idx + 1), 0);

    await tx.insert(factureLigne).values({ factureId, idx, ...brouillon.ligne });
    await tx
      .insert(factureCostLine)
      .values({
        factureId,
        lineIdx: idx,
        lieu: brouillon.cout.lieu,
        faconnier: brouillon.cout.faconnier,
        cout: brouillon.cout.cout,
      })
      .onConflictDoUpdate({
        target: [factureCostLine.factureId, factureCostLine.lineIdx],
        set: { lieu: brouillon.cout.lieu, faconnier: brouillon.cout.faconnier, cout: brouillon.cout.cout },
      });

    const [avant] = await tx.select().from(commande).where(eq(commande.id, commandeId));
    const numeros = [...new Set([...(avant?.facNums ?? []), numero])];
    const patch: Record<string, unknown> = {
      factureQte: brouillon.factureQteApres,
      facNums: numeros,
      updatedAt: new Date(),
    };
    /* Intégralement facturée = livrée : elle part aux archives d'elle-même,
     * comme le faisait autoArchiveLF. Une facturation partielle ne touche à
     * rien d'autre : le reste est encore à produire. */
    if (brouillon.complete) {
      patch.archived = true;
      patch.produit = Math.max(avant?.produit ?? 0, ligneCmd.qte);
      patch.dateLivraison = avant?.dateLivraison ?? dateFacture;
    }
    await tx.update(commande).set(patch).where(eq(commande.id, commandeId));

    return {
      numero,
      qte: brouillon.qte,
      complete: brouillon.complete,
      regroupee,
      reste: Math.max(0, ligneCmd.qte - brouillon.factureQteApres),
    };
  });
}

/* ─────────── B3 · cohérence du prix façon ─────────── */

/** Lignes de coût enrichies de leur ligne de facture, prêtes à comparer. */
async function lignesCoutRapprochables(): Promise<fc.LigneCoutFacture[]> {
  const rows = await db
    .select({
      numero: facture.num,
      type: facture.type,
      lineIdx: factureCostLine.lineIdx,
      lieu: factureCostLine.lieu,
      faconnier: factureCostLine.faconnier,
      cout: factureCostLine.cout,
      marque: facture.marque,
      clientKey: facture.clientKey,
      modele: factureLigne.modele,
      ref: factureLigne.ref,
    })
    .from(factureCostLine)
    .innerJoin(facture, eq(factureCostLine.factureId, facture.id))
    .innerJoin(
      factureLigne,
      and(eq(factureLigne.factureId, factureCostLine.factureId), eq(factureLigne.idx, factureCostLine.lineIdx)),
    )
    .where(isNull(facture.deletedAt));

  return rows.map((r) => ({
    numero: r.numero,
    type: r.type,
    lineIdx: r.lineIdx,
    client: r.marque || r.clientKey || "",
    modele: r.modele,
    ref: r.ref,
    lieu: r.lieu,
    faconnier: r.faconnier,
    cout: r.cout,
  }));
}

export async function controlerPrixFacon(): Promise<fc.Divergence[]> {
  const [lignes, commandes] = await Promise.all([
    lignesCoutRapprochables(),
    listCommandes({ includeArchived: true }),
  ]);
  return fc.comparerPrixFacon(lignes, commandes);
}

/** Aligne les commandes sur le prix façon de leur facture. La facture fait foi. */
export async function alignerPrixFacon(divergences: fc.Divergence[]): Promise<number> {
  if (!divergences.length) return 0;
  return db.transaction(async (tx) => {
    let n = 0;
    for (const d of divergences) {
      if (d.prixFacture == null) continue;
      await tx
        .update(commande)
        .set({ prixFacon: d.prixFacture, updatedAt: new Date() })
        .where(eq(commande.id, d.commandeId));
      n++;
    }
    return n;
  });
}

/** Sens retour : le prix façon corrigé sur une commande redescend sur les
 * lignes de facture qui la citent. Sans lui, corriger une commande laisse la
 * marge réalisée sur l'ancien chiffre. */
export async function propagerPrixFacon(commandeId: number): Promise<number> {
  const cmd = (await listCommandes({ includeArchived: true })).find((c) => c.id === commandeId);
  if (!cmd || cmd.prixFacon == null || !biz.estSousTraitee(cmd)) return 0;

  const lignes = await lignesCoutRapprochables();
  const cle = biz.cleRapprochement(cmd.client, cmd.modele, cmd.refArticle);
  const cibles = lignes.filter(
    (l) => l.lieu === "faconnier" && biz.cleRapprochement(l.client, l.modele, l.ref) === cle,
  );
  if (!cibles.length) return 0;

  return db.transaction(async (tx) => {
    let n = 0;
    for (const l of cibles) {
      const [f] = await tx
        .select({ id: facture.id })
        .from(facture)
        .where(and(eq(facture.num, l.numero), eq(facture.type, l.type)));
      if (!f) continue;
      await tx
        .update(factureCostLine)
        .set({ cout: cmd.prixFacon })
        .where(and(eq(factureCostLine.factureId, f.id), eq(factureCostLine.lineIdx, l.lineIdx)));
      n++;
    }
    return n;
  });
}

/* ─────────── B10 · purge des soldées ─────────── */

export type Soldee = { id: number; of: string; modele: string; client: string; qte: number; ca: number };

export async function listerSoldees(): Promise<Soldee[]> {
  const rows = await listCommandes();
  return rows
    .filter((c) => fc.estSoldee(c))
    .map((c) => ({ id: c.id, of: c.of, modele: c.modele, client: c.client, qte: c.qte, ca: c.ca }));
}
