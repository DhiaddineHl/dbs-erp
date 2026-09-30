import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { tauxChange } from "@/lib/db/schema";
import { DEVISE_PIVOT, type TauxChange, estDevise } from "@/lib/domain/montants";

/* Historique des taux de change (pivot TND). Un taux ajouté vaut à partir de
 * sa date : les périodes passées gardent leurs chiffres. */

export type TauxChangeRow = TauxChange & { id: number };

export async function listTauxChange(): Promise<TauxChangeRow[]> {
  const rows = await db.select().from(tauxChange).orderBy(asc(tauxChange.devise), asc(tauxChange.date));
  return rows
    .filter((r) => estDevise(r.devise))
    .map((r) => ({ id: r.id, devise: r.devise as TauxChange["devise"], date: r.date, taux: r.taux }));
}

export async function enregistrerTauxChange(v: TauxChange) {
  if (v.devise === DEVISE_PIVOT) throw new Error(`${DEVISE_PIVOT} est la devise pivot : son taux vaut toujours 1`);
  if (!(v.taux > 0)) throw new Error("Le taux doit être positif");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v.date)) throw new Error("Date invalide");
  await db
    .insert(tauxChange)
    .values(v)
    .onConflictDoUpdate({ target: [tauxChange.devise, tauxChange.date], set: { taux: v.taux } });
}

export async function supprimerTauxChange(id: number) {
  await db.delete(tauxChange).where(eq(tauxChange.id, id));
}
