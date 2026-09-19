import "server-only";
import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { client, commande, referenceIndustrielle } from "@/lib/db/schema";
import { cleReference, type IdentiteReference } from "@/lib/domain/reference";

/* Service de la RÉFÉRENCE INDUSTRIELLE.
 *
 * Résout (ou crée) la référence d'une commande et rattache la commande à celle-
 * ci. Best-effort par conception : une résolution de référence ne doit jamais
 * faire échouer un enregistrement de commande. */

/** Trouve ou crée la référence pour une identité donnée. Null si l'identité ne
 * porte ni référence ni modèle (rien à rattacher). */
export async function assurerReference(id: IdentiteReference): Promise<number | null> {
  const cle = cleReference(id);
  if (!cle) return null;

  const [existant] = await db
    .select({ id: referenceIndustrielle.id })
    .from(referenceIndustrielle)
    .where(eq(referenceIndustrielle.cle, cle))
    .limit(1);
  if (existant) return existant.id;

  const [row] = await db
    .insert(referenceIndustrielle)
    .values({
      cle,
      client: String(id.client ?? "").trim(),
      refArticle: String(id.refArticle ?? "").trim(),
      modele: String(id.modele ?? "").trim(),
    })
    .onConflictDoNothing({ target: referenceIndustrielle.cle })
    .returning({ id: referenceIndustrielle.id });
  if (row) return row.id;

  // Course : une autre écriture a créé la même clé entre-temps.
  const [r] = await db
    .select({ id: referenceIndustrielle.id })
    .from(referenceIndustrielle)
    .where(eq(referenceIndustrielle.cle, cle))
    .limit(1);
  return r?.id ?? null;
}

/** Rattache une commande à sa référence (résolue depuis ses champs), et écrit
 * `commande.referenceId`. Ne lève jamais : renvoie l'id de référence ou null. */
export async function rattacherReference(commandeId: number): Promise<number | null> {
  try {
    const [c] = await db
      .select({
        modele: commande.modele,
        refArticle: commande.refArticle,
        clientId: commande.clientId,
      })
      .from(commande)
      .where(eq(commande.id, commandeId))
      .limit(1);
    if (!c) return null;

    let clientNom = "";
    if (c.clientId != null) {
      const [cl] = await db.select({ nom: client.nom }).from(client).where(eq(client.id, c.clientId)).limit(1);
      clientNom = cl?.nom ?? "";
    }

    const refId = await assurerReference({ client: clientNom, refArticle: c.refArticle, modele: c.modele });
    if (refId != null) {
      await db.update(commande).set({ referenceId: refId }).where(eq(commande.id, commandeId));
    }
    return refId;
  } catch {
    return null;
  }
}

/** Rattache TOUTES les commandes non encore rattachées — utilitaire de reprise à
 * lancer une fois après la migration (via un script ou une action admin). */
export async function rattacherToutesReferences(): Promise<number> {
  const rows = await db.select({ id: commande.id }).from(commande).where(sql`${commande.referenceId} is null`);
  let n = 0;
  for (const r of rows) {
    const id = await rattacherReference(r.id);
    if (id != null) n++;
  }
  return n;
}

export type ReferenceRow = {
  id: number;
  cle: string;
  client: string;
  refArticle: string;
  modele: string;
  samDbs: number | null;
  /** Nombre de commandes/OF rattachés (toutes années confondues). */
  commandes: number;
  /** Total des pièces produites, tous OF de la référence. */
  piecesProduites: number;
};

/** La « garde-robe » des références : chaque référence avec ce qui s'y rattache,
 * dérivé des commandes. Base de la bibliothèque historique (§9). */
export async function listReferences(): Promise<ReferenceRow[]> {
  const refs = await db.select().from(referenceIndustrielle).orderBy(referenceIndustrielle.client);
  const agg = await db
    .select({
      referenceId: commande.referenceId,
      n: sql<number>`count(*)::int`,
      produit: sql<number>`coalesce(sum(${commande.produit}), 0)::int`,
    })
    .from(commande)
    .where(sql`${commande.referenceId} is not null`)
    .groupBy(commande.referenceId);
  const parRef = new Map(agg.map((a) => [a.referenceId!, a]));

  return refs.map((r) => ({
    id: r.id,
    cle: r.cle,
    client: r.client,
    refArticle: r.refArticle,
    modele: r.modele,
    samDbs: r.samDbs,
    commandes: parRef.get(r.id)?.n ?? 0,
    piecesProduites: parRef.get(r.id)?.produit ?? 0,
  }));
}
