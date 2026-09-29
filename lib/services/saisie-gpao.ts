import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, journee, modele, ouvriere } from "@/lib/db/schema";
import type { JourneeOuvriere } from "@/lib/db/schema/gpao";
import * as sg from "@/lib/domain/saisie-gpao";
import { assurerOperations } from "@/lib/services/atelier";
import { synchroniserAvancementJournee } from "@/lib/services/gpao";

/* Saisie GPAO case par case (voir lib/domain/saisie-gpao) : la journée est
 * relue et VERROUILLÉE (FOR UPDATE), la saisie appliquée sur sa version à jour,
 * et seuls les champs touchés sont réécrits. La tablette de l'agent de méthode
 * et l'écran du bureau peuvent travailler sur la même journée en même temps. */

export type JourneeRow = typeof journee.$inferSelect;

async function rosterDe(ex: Pick<typeof db, "select">, j: JourneeRow): Promise<JourneeOuvriere[]> {
  if (j.ouvrieres?.length) return j.ouvrieres;
  // Journée d'avant l'effectif figé : même repli que l'écran GPAO.
  return ex
    .select({ id: ouvriere.id, nom: ouvriere.nom, poste: ouvriere.poste, sam: ouvriere.sam, personnelId: ouvriere.personnelId })
    .from(ouvriere)
    .where(eq(ouvriere.chaineId, j.chaineId))
    .orderBy(asc(ouvriere.id));
}

const matrices = (j: JourneeRow): sg.Matrices => ({
  cols: j.cols ?? [],
  cloture: j.cloture,
  sortie: j.sortie ?? {},
  ops: j.ops ?? {},
  ret: j.ret ?? {},
  opsSam: j.opsSam ?? {},
  opsPoste: j.opsPoste ?? {},
  opsDetail: j.opsDetail ?? {},
  arrets: j.arrets ?? {},
});

/** Applique une ou plusieurs saisies à une journée, atomiquement. */
export async function saisirJournee(journeeId: number, saisies: sg.Saisie[]): Promise<JourneeRow> {
  if (!saisies.length) throw new Error("Rien à enregistrer.");
  const { row, champs } = await db.transaction(async (t) => {
    const [j] = await t.select().from(journee).where(eq(journee.id, journeeId)).for("update");
    if (!j) throw new Error("Journée introuvable (supprimée au bureau ?).");
    const roster = await rosterDe(t, j);
    let m = matrices(j);
    const touches = new Set<sg.ChampMatrice>();
    for (const s of saisies) {
      const r = sg.appliquerSaisie(m, roster, s);
      if (!r.ok) throw new Error(r.error);
      m = r.matrices;
      r.champs.forEach((c) => touches.add(c));
    }
    const patch: Partial<typeof journee.$inferInsert> = {};
    for (const c of touches) (patch as Record<string, unknown>)[c] = m[c];
    // Retirer une ouvrière retire aussi sa ligne de l'effectif figé.
    const retraits = saisies.filter((s): s is Extract<sg.Saisie, { type: "retirerOuvriere" }> => s.type === "retirerOuvriere");
    if (retraits.length) patch.ouvrieres = roster.filter((o) => !retraits.some((x) => x.ouvId === o.id));
    const [row] = await t.update(journee).set(patch).where(eq(journee.id, journeeId)).returning();
    return { row, champs: touches };
  });

  // La sortie de chaîne alimente l'avancement de la commande liée au modèle.
  if (champs.has("sortie")) await synchroniserAvancementJournee(journeeId);
  // Les postes tapés entrent au catalogue d'opérations (comme au bureau).
  const postes = saisies.flatMap((s) =>
    s.type === "posteHeure" ? s.lignes : s.type === "postesJour" ? Object.values(s.heures).flat() : [],
  );
  if (postes.length) await assurerOperations(postes.map((p) => ({ nom: p.poste, sam: p.sam })), "saisie");
  return row;
}

export async function lireJournee(id: number): Promise<JourneeRow | null> {
  const [j] = await db.select().from(journee).where(eq(journee.id, id));
  return j ?? null;
}

/* ─────────── lecture pour la tablette ─────────── */

export type JourneeTablette = {
  journee: JourneeRow;
  roster: JourneeOuvriere[];
  chaine: { id: number; nom: string; chef: string };
  modele: { id: number; nom: string; ref: string; client: string; sam: number };
};

export async function journeeTablette(id: number): Promise<JourneeTablette | null> {
  const j = await lireJournee(id);
  if (!j) return null;
  const [[c], [m], roster] = await Promise.all([
    db.select({ id: chaine.id, nom: chaine.nom, chef: chaine.chef }).from(chaine).where(eq(chaine.id, j.chaineId)),
    db.select({ id: modele.id, nom: modele.nom, ref: modele.ref, client: modele.client, sam: modele.sam }).from(modele).where(eq(modele.id, j.modeleId)),
    rosterDe(db, j),
  ]);
  return {
    journee: j,
    roster,
    chaine: c ?? { id: j.chaineId, nom: "?", chef: "" },
    modele: m ?? { id: j.modeleId, nom: "?", ref: "", client: "", sam: 0 },
  };
}

/** Chaînes et leurs journées d'une date — écran d'accueil de la tablette. */
export async function accueilTablette(date: string) {
  const [chaines, journees, modeles] = await Promise.all([
    db.select().from(chaine).orderBy(asc(chaine.nom)),
    db.select().from(journee).where(eq(journee.date, date)).orderBy(asc(journee.id)),
    db.select({ id: modele.id, nom: modele.nom, ref: modele.ref, client: modele.client, sam: modele.sam, archive: modele.archive }).from(modele).orderBy(asc(modele.nom)),
  ]);
  const effectifs = await db.select({ chaineId: ouvriere.chaineId, id: ouvriere.id }).from(ouvriere);
  const nbOuv = new Map<number, number>();
  for (const o of effectifs) nbOuv.set(o.chaineId, (nbOuv.get(o.chaineId) ?? 0) + 1);
  // Dernier modèle travaillé par chaîne : proposé en premier à la création.
  const derniers = await db
    .select({ chaineId: journee.chaineId, modeleId: journee.modeleId, nbHeures: journee.nbHeures, date: journee.date })
    .from(journee)
    .orderBy(asc(journee.date), asc(journee.id));
  const dernier = new Map<number, { modeleId: number; nbHeures: number }>();
  for (const d of derniers) if (d.date <= date) dernier.set(d.chaineId, { modeleId: d.modeleId, nbHeures: d.nbHeures });
  return {
    chaines: chaines.map((c) => ({
      id: c.id,
      nom: c.nom,
      chef: c.chef,
      effectif: c.effectif || nbOuv.get(c.id) || 0,
      nbOuvrieres: nbOuv.get(c.id) ?? 0,
      dernier: dernier.get(c.id) ?? null,
      journees: journees.filter((j) => j.chaineId === c.id),
    })),
    modeles: modeles.filter((m) => !m.archive),
    modelesTous: modeles,
  };
}

/** Une journée existe-t-elle déjà pour cette chaîne, ce modèle et cette date ? */
export async function journeeExistante(date: string, chaineId: number, modeleId: number) {
  const [j] = await db
    .select({ id: journee.id })
    .from(journee)
    .where(and(eq(journee.date, date), eq(journee.chaineId, chaineId), eq(journee.modeleId, modeleId)));
  return j?.id ?? null;
}
