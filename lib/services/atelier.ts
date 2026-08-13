import "server-only";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { chaine, operation, ouvriere, personnel } from "@/lib/db/schema";
import { cleAleatoire } from "@/lib/atelier/cle";
import * as at from "@/lib/domain/atelier";

/* ─────────── personnel ─────────── */

export type PersonneRow = {
  id: number;
  matricule: string;
  nom: string;
  fonction: string;
  atelier: string;
  statut: string;
  dateEntree: string;
  portailCle: string;
  /** Chaînes où elle est affectée, pour repérer les personnes non rattachées. */
  chaines: string[];
};

export async function listPersonnel(): Promise<PersonneRow[]> {
  const [rows, affectations] = await Promise.all([
    db.select().from(personnel).orderBy(asc(personnel.nom)),
    db
      .select({ personnelId: ouvriere.personnelId, chaineNom: chaine.nom })
      .from(ouvriere)
      .innerJoin(chaine, eq(ouvriere.chaineId, chaine.id)),
  ]);

  const parPersonne = new Map<number, string[]>();
  for (const a of affectations) {
    if (a.personnelId === null) continue;
    const g = parPersonne.get(a.personnelId);
    if (g) {
      if (!g.includes(a.chaineNom)) g.push(a.chaineNom);
    } else parPersonne.set(a.personnelId, [a.chaineNom]);
  }

  return rows.map((p) => ({
    id: p.id, matricule: p.matricule, nom: p.nom, fonction: p.fonction,
    atelier: p.atelier, statut: p.statut, dateEntree: p.dateEntree ?? "",
    portailCle: p.portailCle, chaines: parPersonne.get(p.id) ?? [],
  }));
}

export async function creerPersonne(v: {
  matricule: string;
  nom: string;
  fonction: string;
  atelier: string;
  statut: string;
  dateEntree: string | null;
}) {
  const [row] = await db
    .insert(personnel)
    .values({ ...v, portailCle: cleAleatoire() })
    .returning({ id: personnel.id });
  return row;
}

export async function majPersonne(id: number, patch: Partial<typeof personnel.$inferInsert>) {
  await db.update(personnel).set(patch).where(eq(personnel.id, id));
}

export async function supprimerPersonne(id: number) {
  await db.delete(personnel).where(eq(personnel.id, id));
}

/** Regénère la clé du portail : à faire quand un QR imprimé a fuité. */
export async function regenererCle(id: number) {
  const cle = cleAleatoire();
  await db.update(personnel).set({ portailCle: cle }).where(eq(personnel.id, id));
  return cle;
}

/* ─────────── rattachement ouvrière ↔ personne ─────────── */

export type OuvriereRow = {
  id: number;
  nom: string;
  poste: string;
  sam: number;
  chaineId: number;
  chaineNom: string;
  personnelId: number | null;
  matricule: string;
  portailCle: string;
};

export async function listOuvrieres(): Promise<OuvriereRow[]> {
  const rows = await db
    .select({ o: ouvriere, chaineNom: chaine.nom, p: personnel })
    .from(ouvriere)
    .innerJoin(chaine, eq(ouvriere.chaineId, chaine.id))
    .leftJoin(personnel, eq(ouvriere.personnelId, personnel.id))
    .orderBy(asc(chaine.nom), asc(ouvriere.nom));

  return rows.map(({ o, chaineNom, p }) => ({
    id: o.id, nom: o.nom, poste: o.poste, sam: o.sam, chaineId: o.chaineId, chaineNom,
    personnelId: o.personnelId, matricule: p?.matricule ?? "", portailCle: p?.portailCle ?? "",
  }));
}

export async function rattacher(ouvriereId: number, personnelId: number | null) {
  await db.update(ouvriere).set({ personnelId }).where(eq(ouvriere.id, ouvriereId));
}

/** Rapproche automatiquement ce qui peut l'être, et ne touche à rien d'autre.
 * Retourne le nombre de liens créés — le reste reste à faire à la main. */
export async function rattacherAuto(): Promise<{ lies: number; restants: number }> {
  const [ouvrieres, personnes] = await Promise.all([
    db.select({ id: ouvriere.id, nom: ouvriere.nom, personnelId: ouvriere.personnelId }).from(ouvriere),
    db.select({ id: personnel.id, nom: personnel.nom }).from(personnel),
  ]);

  const props = at.rapprocherParNom(ouvrieres, personnes).filter((r) => r.personnelId !== null);
  for (const r of props) {
    await db.update(ouvriere).set({ personnelId: r.personnelId }).where(eq(ouvriere.id, r.ouvriereId));
  }
  const restants = ouvrieres.filter((o) => o.personnelId === null).length - props.length;
  return { lies: props.length, restants };
}

/* ─────────── catalogue d'opérations ─────────── */

export type OperationRow = { id: number; nom: string; sam: number; archive: boolean };

export async function listOperations(): Promise<OperationRow[]> {
  return db.select().from(operation).orderBy(asc(operation.nom));
}

export async function creerOperation(v: { nom: string; sam: number }) {
  const [row] = await db.insert(operation).values(v).returning({ id: operation.id });
  return row;
}

export async function majOperation(id: number, patch: Partial<typeof operation.$inferInsert>) {
  await db.update(operation).set(patch).where(eq(operation.id, id));
}

export async function supprimerOperations(ids: number[]) {
  if (ids.length) await db.delete(operation).where(inArray(operation.id, ids));
}

/** Fusionne des doublons dans une opération de référence : on archive les
 * autres plutôt que de les supprimer, car des journées les citent peut-être
 * encore par leur libellé. */
export async function fusionnerOperations(gardeeId: number, autresIds: number[]) {
  const ids = autresIds.filter((i) => i !== gardeeId);
  if (!ids.length) return 0;
  await db.update(operation).set({ archive: true }).where(inArray(operation.id, ids));
  return ids.length;
}

export async function statsAtelier() {
  const [[p], [o], [op]] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        actifs: sql<number>`count(*) filter (where ${personnel.statut} = 'active')::int`,
      })
      .from(personnel),
    db
      .select({
        total: sql<number>`count(*)::int`,
        liees: sql<number>`count(*) filter (where ${ouvriere.personnelId} is not null)::int`,
      })
      .from(ouvriere),
    db
      .select({
        total: sql<number>`count(*)::int`,
        actives: sql<number>`count(*) filter (where not ${operation.archive})::int`,
      })
      .from(operation),
  ]);
  return {
    personnel: { total: Number(p.total), actifs: Number(p.actifs) },
    ouvrieres: { total: Number(o.total), liees: Number(o.liees) },
    operations: { total: Number(op.total), actives: Number(op.actives) },
  };
}
