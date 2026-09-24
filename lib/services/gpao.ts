import "server-only";
import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, client, commande, faconnier, journee, modele, ouvriere } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";
import * as biz from "@/lib/domain/commande";

/* Reads return shapes aligned with app/(app)/gpao_prod/store.ts so the future
 * UI wiring is a near drop-in for the localStorage store. */

/** Commandes attribuées à DBS (production INTERNE) — pour proposer nom/référence
 * à la création d'un modèle GPAO. « Interne » = pas de vrai façonnier
 * sous-traitant (chaîne interne, façonnier vide ou nommé DBS/interne), voir
 * estSousTraitee. On ne remonte que les commandes actives, mères (pas les parts
 * découpées), triées récentes d'abord, dédupliquées par modèle+référence. */
export type CommandeInterne = { id: number; of: string; modele: string; ref: string; couleur: string; client: string; qte: number; archived?: boolean };

export async function listCommandesInternes(inclureArchivees = false): Promise<CommandeInterne[]> {
  const rows = await db
    .select({
      id: commande.id,
      of: commande.ofNumber,
      modele: commande.modele,
      ref: commande.refArticle,
      couleur: commande.couleur,
      qte: commande.qte,
      archived: commande.archived,
      faconnierNom: faconnier.nom,
      chaineId: commande.chaineId,
      clientNom: client.nom,
    })
    .from(commande)
    .leftJoin(faconnier, eq(commande.faconnierId, faconnier.id))
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(inclureArchivees ? isNull(commande.parentId) : and(eq(commande.archived, false), isNull(commande.parentId)))
    .orderBy(sql`${commande.id} desc`);

  const internes = rows.filter((r) => !biz.estSousTraitee({ faconnier: r.faconnierNom, chaineId: r.chaineId }));

  // Dédup par modèle + référence normalisés (une même réf peut avoir plusieurs OF).
  const vu = new Set<string>();
  const out: CommandeInterne[] = [];
  for (const r of internes) {
    const cle = `${biz.normaliserNom(r.modele)}|${biz.normaliserNom(r.ref)}`;
    if (vu.has(cle)) continue;
    vu.add(cle);
    out.push({
      id: r.id,
      of: r.of,
      modele: r.modele,
      ref: r.ref,
      couleur: r.couleur,
      client: r.clientNom ?? "",
      qte: r.qte,
      archived: r.archived,
    });
  }
  return out;
}

/** Lie manuellement un modèle GPAO à une commande (archivée acceptée), ou
 * détache (commandeId null), puis resynchronise l'avancement. */
export async function lierModeleCommande(modeleId: number, commandeId: number | null): Promise<void> {
  await db.update(modele).set({ commandeId }).where(eq(modele.id, modeleId));
  await synchroniserAvancementModele(modeleId);
}

/** Fixe (ou efface) le prix de vente manuel d'un modèle (€/pièce). */
export async function majPrixManuelModele(modeleId: number, prix: number | null): Promise<void> {
  await db.update(modele).set({ prixManuel: prix != null && prix > 0 ? prix : null }).where(eq(modele.id, modeleId));
}

export async function getModeles() {
  return db.select().from(modele).orderBy(modele.id);
}

export async function getChaines() {
  return db.query.chaine.findMany({ with: { ouvrieres: true }, orderBy: (c, { asc }) => asc(c.id) });
}

export async function getJournees() {
  return db.select().from(journee).orderBy(journee.date);
}

/* ─────────── Simulation : pièces produites & CA depuis les journées GPAO ───
 *
 * Pour chaque journée (filtrée sur une période), on lit les pièces sorties de
 * chaîne et, via le lien modèle→commande, le prix de vente de la commande. Le
 * CA produit = pièces × prix de vente. Un modèle non relié à une commande (ou
 * une commande sans prix) compte les pièces mais pas de CA — signalé à part. */
export type LigneSimulation = {
  date: string;
  modeleId: number;
  modele: string;
  ref: string;
  client: string;
  pieces: number;
  prixVente: number | null;
  ca: number;
  lie: boolean;
};

export type SimulationData = {
  from: string;
  to: string;
  lignes: LigneSimulation[];
  totalPieces: number;
  totalCa: number;
  piecesSansPrix: number;
  /** Heures réellement travaillées sur la période (cellules horaires saisies,
   * hors RI/ABS), pour le bilan coût. */
  heuresTravaillees: number;
};

const sommeSortie = (sortie: Record<string, number> | null | undefined): number => {
  let t = 0;
  for (const v of Object.values(sortie ?? {})) if (typeof v === "number") t += v;
  return t;
};

/** Heures travaillées d'une journée = nombre de cellules horaires réellement
 * saisies (une valeur numérique = 1 heure ; RI/ABS ne comptent pas), sommées
 * sur toutes les ouvrières. Reflète le temps de main d'œuvre engagé. */
const heuresJournee = (j: typeof journee.$inferSelect): number => {
  let h = 0;
  const ops = (j.ops ?? {}) as Record<number, Record<string, unknown>>;
  const detail = (j.opsDetail ?? {}) as Record<number, Record<string, unknown[]>>;
  for (const parHeure of Object.values(ops)) {
    for (const v of Object.values(parHeure)) if (typeof v === "number") h += 1;
  }
  // Heures multi-postes (détail) : comptées si non déjà comptées comme numérique.
  for (const [oid, parHeure] of Object.entries(detail)) {
    for (const [col, liste] of Object.entries(parHeure)) {
      const dejaNum = typeof ops[Number(oid)]?.[col] === "number";
      if (!dejaNum && Array.isArray(liste) && liste.length) h += 1;
    }
  }
  return h;
};

export async function simulationGpao(from: string, to: string): Promise<SimulationData> {
  const [journees, modeles] = await Promise.all([
    db.select().from(journee).orderBy(journee.date),
    db.select().from(modele),
  ]);
  const parModele = new Map(modeles.map((m) => [m.id, m]));

  // Prix de vente des commandes liées, en une requête.
  const commandeIds = [...new Set(modeles.map((m) => m.commandeId).filter((x): x is number => x != null))];
  const prixParCommande = new Map<number, number | null>();
  const clientParCommande = new Map<number, string>();
  if (commandeIds.length) {
    const cmds = await db
      .select({ id: commande.id, prixVente: commande.prixVente, clientNom: client.nom })
      .from(commande)
      .leftJoin(client, eq(commande.clientId, client.id))
      .where(inArray(commande.id, commandeIds));
    for (const c of cmds) {
      prixParCommande.set(c.id, c.prixVente ?? null);
      clientParCommande.set(c.id, c.clientNom ?? "");
    }
  }

  const lignes: LigneSimulation[] = [];
  let totalPieces = 0;
  let totalCa = 0;
  let piecesSansPrix = 0;
  let heuresTravaillees = 0;

  for (const j of journees) {
    const d = j.date;
    if ((from && d < from) || (to && d > to)) continue;
    const pieces = sommeSortie(j.sortie);
    heuresTravaillees += heuresJournee(j);
    if (pieces <= 0) continue;
    const m = parModele.get(j.modeleId);
    const prixCommande = m?.commandeId != null ? (prixParCommande.get(m.commandeId) ?? null) : null;
    // Repli sur le prix saisi à la main du modèle si pas de prix de commande.
    const prix = prixCommande ?? m?.prixManuel ?? null;
    const clientNom = m?.commandeId != null ? (clientParCommande.get(m.commandeId) ?? m?.client ?? "") : (m?.client ?? "");
    const ca = prix != null ? Math.round(pieces * prix * 100) / 100 : 0;
    lignes.push({
      date: d,
      modeleId: j.modeleId,
      modele: m?.nom ?? "—",
      ref: m?.ref ?? "",
      client: clientNom,
      pieces,
      prixVente: prix,
      ca,
      lie: m?.commandeId != null,
    });
    totalPieces += pieces;
    totalCa += ca;
    if (prix == null) piecesSansPrix += pieces;
  }

  lignes.sort((a, b) => a.date.localeCompare(b.date) || a.modele.localeCompare(b.modele));
  return {
    from,
    to,
    lignes,
    totalPieces,
    totalCa: Math.round(totalCa * 100) / 100,
    piecesSansPrix,
    heuresTravaillees: Math.round(heuresTravaillees * 10) / 10,
  };
}

/* ─────────── modèle writes ─────────── */
export async function insertModele(input: typeof modele.$inferInsert) {
  const [row] = await db.insert(modele).values(input).returning();
  return row;
}
export async function updateModele(id: number, patch: Partial<typeof modele.$inferInsert>) {
  await db.update(modele).set(patch).where(eq(modele.id, id));
}

/** Pont GPAO → avancement commande.
 *
 * Additionne la production GPAO cumulée du modèle (somme des sorties de chaîne
 * de toutes ses journées) et l'écrit dans `commande.produit` de la commande
 * liée, plafonnée à la quantité commandée (pas de dépassement de 100 %).
 * Ne fait rien si le modèle n'est relié à aucune commande. La production
 * sous-traitance (BR) reste inchangée : on ne prend le MAX que si l'on veut les
 * combiner — ici la commande étant produite en interne (DBS), la prod GPAO EST
 * sa production, donc on écrit directement. */
export async function synchroniserAvancementModele(modeleId: number): Promise<void> {
  const [m] = await db.select().from(modele).where(eq(modele.id, modeleId));
  if (!m || m.commandeId == null) return;

  const journees = await db.select({ sortie: journee.sortie }).from(journee).where(eq(journee.modeleId, modeleId));
  let prodGpao = 0;
  for (const j of journees) {
    for (const v of Object.values(j.sortie ?? {})) if (typeof v === "number") prodGpao += v;
  }

  const [c] = await db.select().from(commande).where(eq(commande.id, m.commandeId));
  if (!c) return;
  const produit = Math.min(prodGpao, c.qte);
  if (produit === c.produit) return; // rien à écrire
  await db.update(commande).set({ produit, updatedAt: new Date() }).where(eq(commande.id, m.commandeId));
}

/** Comme synchroniserAvancementModele, mais à partir d'une journée : retrouve
 * son modèle et resynchronise. Appelé après chaque saisie de production. */
export async function synchroniserAvancementJournee(journeeId: number): Promise<void> {
  const [j] = await db.select({ modeleId: journee.modeleId }).from(journee).where(eq(journee.id, journeeId));
  if (j) await synchroniserAvancementModele(j.modeleId);
}

/** Rapprochement automatique modèle GPAO ↔ commande, pour valoriser d'un coup
 * l'historique : pour chaque modèle NON encore lié, on cherche la commande
 * interne (DBS) correspondante — par RÉFÉRENCE d'abord (la plus fiable), puis
 * par NOM de modèle. On ne lie que si la correspondance est UNIQUE (pas
 * d'ambiguïté), puis on resynchronise l'avancement. Ne touche pas les modèles
 * déjà liés. Renvoie le bilan pour l'écran. */
export async function rapprocherModelesCommandes(): Promise<{ lies: number; ambigus: number; sansMatch: number }> {
  const internes = await listCommandesInternes(); // {id, of, modele, ref, ...} dédupliquées
  const modeles = await db.select().from(modele);

  // Index par référence et par nom normalisés → liste d'ids de commande.
  const parRef = new Map<string, number[]>();
  const parNom = new Map<string, number[]>();
  const pousser = (map: Map<string, number[]>, cle: string, id: number) => {
    if (!cle) return;
    const g = map.get(cle);
    if (g) {
      if (!g.includes(id)) g.push(id);
    } else map.set(cle, [id]);
  };
  for (const c of internes) {
    pousser(parRef, biz.normaliserNom(c.ref), c.id);
    pousser(parNom, biz.normaliserNom(c.modele), c.id);
  }

  let lies = 0;
  let ambigus = 0;
  let sansMatch = 0;
  for (const m of modeles) {
    if (m.commandeId != null) continue; // déjà lié
    const parRefIds = parRef.get(biz.normaliserNom(m.ref)) ?? [];
    const parNomIds = parNom.get(biz.normaliserNom(m.nom)) ?? [];
    // La référence prime ; le nom ne sert que si la réf ne donne rien.
    const candidats = parRefIds.length ? parRefIds : parNomIds;
    if (candidats.length === 0) {
      sansMatch += 1;
      continue;
    }
    if (candidats.length > 1) {
      ambigus += 1; // plusieurs commandes possibles → on laisse trancher à la main
      continue;
    }
    await db.update(modele).set({ commandeId: candidats[0] }).where(eq(modele.id, m.id));
    await synchroniserAvancementModele(m.id);
    lies += 1;
  }
  return { lies, ambigus, sansMatch };
}

export async function deleteModele(id: number) {
  await db.delete(modele).where(eq(modele.id, id));
}

/** Passerelle Commandes → GPAO (B22).
 *
 * Enregistrer une commande fait exister son modèle côté production, avec la
 * quantité de TOUTES les commandes actives qui le portent : c'est cette
 * quantité que la chaîne doit sortir, pas celle d'une commande isolée.
 *
 * Le SAM n'est jamais écrasé. Il est tenu dans GPAO, à partir des opérations
 * réellement chronométrées ; le remplacer depuis les commandes effacerait un
 * relevé d'atelier par une donnée commerciale. Un modèle créé ici part donc
 * sur le SAM par défaut de la colonne, que les écrans GPAO signalent déjà
 * comme à régler.
 *
 * Ne crée rien pour un modèle sans nom, et ne réveille pas un modèle archivé :
 * l'archivage est une décision de l'atelier. */
export async function synchroniserModele(nom: string): Promise<"cree" | "maj" | "aucun"> {
  const propre = nom.trim();
  if (!propre) return "aucun";

  const [agg] = await db
    .select({
      qte: sql<number>`coalesce(sum(${commande.qte}), 0)::int`,
      n: sql<number>`count(*)::int`,
      ref: sql<string>`coalesce(max(${commande.refArticle}), '')`,
      client: sql<string>`coalesce(max(${client.nom}), '')`,
    })
    .from(commande)
    .leftJoin(client, eq(commande.clientId, client.id))
    .where(and(eq(commande.modele, propre), eq(commande.archived, false)));

  // Plus aucune commande active : rien à pousser, et surtout rien à effacer.
  if (!agg || agg.n === 0) return "aucun";

  const [existant] = await db.select().from(modele).where(eq(modele.nom, propre)).limit(1);

  if (existant) {
    await db
      .update(modele)
      .set({
        // Les champs vides ne remplacent pas une valeur déjà saisie en GPAO.
        ref: agg.ref || existant.ref,
        client: agg.client || existant.client,
        qte: agg.qte,
      })
      .where(eq(modele.id, existant.id));
    return "maj";
  }

  await db.insert(modele).values({ nom: propre, ref: agg.ref, client: agg.client, qte: agg.qte });
  return "cree";
}

/* ─────────── chaîne writes ─────────── */
export async function upsertChaineWithOuvrieres(
  c: { nom: string; chef?: string; effectif?: number },
  ouvrieres: { nom: string; poste: string; sam: number }[],
) {
  return db.transaction(async (tx) => {
    const [row] = await tx
      .insert(chaine)
      .values({ nom: c.nom, chef: c.chef ?? "", effectif: c.effectif ?? 0 })
      .returning();
    if (ouvrieres.length)
      await tx.insert(ouvriere).values(ouvrieres.map((o) => ({ chaineId: row.id, ...o })));
    return row;
  });
}
export async function insertChaine(input: { nom: string; chef?: string; effectif?: number }) {
  const [row] = await db
    .insert(chaine)
    .values({ nom: input.nom, chef: input.chef ?? "", effectif: input.effectif ?? 0 })
    .returning();
  return row;
}
export async function updateChaine(id: number, patch: { nom?: string; chef?: string; effectif?: number }) {
  await db.update(chaine).set(patch).where(eq(chaine.id, id));
}
export async function deleteChaine(id: number) {
  await db.delete(chaine).where(eq(chaine.id, id));
}

/* ─────────── ouvrière writes ─────────── */
export async function insertOuvriere(input: typeof ouvriere.$inferInsert) {
  const [row] = await db.insert(ouvriere).values(input).returning();
  return row;
}
export async function updateOuvriere(id: number, patch: Partial<typeof ouvriere.$inferInsert>) {
  await db.update(ouvriere).set(patch).where(eq(ouvriere.id, id));
}
export async function deleteOuvriere(id: number) {
  await db.delete(ouvriere).where(eq(ouvriere.id, id));
}

/** Effectif courant d'une chaîne, dans la forme figée par une journée.
 *
 * Lu côté serveur au moment de créer la journée plutôt que repris du client :
 * l'effectif figé est une photo de la base, pas de l'écran de celui qui clique. */
export async function ouvrieresDeChaine(chaineId: number): Promise<JourneeOuvriere[]> {
  const rows = await db
    .select({
      id: ouvriere.id,
      nom: ouvriere.nom,
      poste: ouvriere.poste,
      sam: ouvriere.sam,
      personnelId: ouvriere.personnelId,
    })
    .from(ouvriere)
    .where(eq(ouvriere.chaineId, chaineId))
    .orderBy(asc(ouvriere.id));
  return rows;
}

/* ─────────── journée writes ─────────── */
export async function insertJournee(input: typeof journee.$inferInsert) {
  const [row] = await db.insert(journee).values(input).returning();
  return row;
}

export async function updateJournee(id: number, patch: Partial<typeof journee.$inferInsert>) {
  await db.update(journee).set(patch).where(eq(journee.id, id));
}

export async function deleteJournee(id: number) {
  await db.delete(journee).where(eq(journee.id, id));
}

export async function countModeles() {
  return (await db.select().from(modele)).length;
}
