import "server-only";
import { and, eq, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { bl, blLigne, commande, coupe, coupeFiche, magasinMouvement } from "@/lib/db/schema";
import * as sk from "@/lib/domain/stock-taille";
import { attenduDeLOf } from "@/lib/services/coupe";

/* Stock PAR TAILLE des commandes, lu sur les mouvements du magasin (entrées
 * ventilées) et les lignes de BL envoyés (sorties ventilées). Lecture seule :
 * le stock TOTAL reste celui de `commande.magasinQte` − expédié. */

type Ex = Pick<typeof db, "select">;

/** Tailles admises pour une commande : sa grille commandée, et celles de la
 * coupe et du plan de coupe. */
export async function taillesDeLaCommande(commandeId: number): Promise<string[]> {
  const [a, grille] = await Promise.all([attenduDeLOf(commandeId), taillesRapides([commandeId])]);
  return [...new Set([...(grille.get(commandeId) ?? []), ...a.sizes, ...Object.keys(a.parTaille)])];
}

/** Tailles à proposer à la saisie, pour beaucoup de commandes d'un coup :
 * la grille commandée, puis les tailles réellement coupées. */
export async function taillesRapides(ids: number[]): Promise<Map<number, string[]>> {
  const out = new Map<number, string[]>();
  if (!ids.length) return out;
  const [cmds, coupes] = await Promise.all([
    db.select({ id: commande.id, tailles: commande.tailles }).from(commande).where(inArray(commande.id, ids)),
    db
      .select({ commandeId: coupe.commandeId, taille: coupe.taille })
      .from(coupe)
      .leftJoin(coupeFiche, eq(coupe.ficheId, coupeFiche.id))
      .where(and(inArray(coupe.commandeId, ids), or(isNull(coupe.ficheId), eq(coupeFiche.statut, "validee")))),
  ]);
  for (const c of cmds) {
    const t = [...(c.tailles ?? []).map((x) => String(x.taille)), ...coupes.filter((x) => x.commandeId === c.id && x.taille).map((x) => x.taille)];
    out.set(c.id, [...new Set(t)]);
  }
  return out;
}

export async function stocksParTaille(ids: number[], ex: Ex = db, ordre: Map<number, string[]> = new Map()): Promise<Map<number, sk.StockTaille>> {
  const out = new Map<number, sk.StockTaille>();
  if (!ids.length) return out;
  const [entrees, sorties] = await Promise.all([
    ex
      .select({ commandeId: magasinMouvement.commandeId, qte: magasinMouvement.qte, tailles: magasinMouvement.tailles })
      .from(magasinMouvement)
      .where(and(inArray(magasinMouvement.commandeId, ids), ne(magasinMouvement.origine, "rebut"))),
    ex
      .select({ commandeId: blLigne.commandeId, qte: blLigne.qteLivree, tailles: blLigne.tailles })
      .from(blLigne)
      .innerJoin(bl, eq(blLigne.blId, bl.id))
      .where(and(inArray(blLigne.commandeId, ids), inArray(bl.statut, ["sent", "invoiced"]))),
  ]);
  for (const id of ids) {
    out.set(
      id,
      sk.stockParTaille(
        entrees.filter((e) => e.commandeId === id).map((e) => ({ qte: e.qte, tailles: e.tailles ?? {} })),
        sorties.filter((s) => s.commandeId === id).map((s) => ({ qte: s.qte, tailles: s.tailles ?? {} })),
        ordre.get(id) ?? [],
      ),
    );
  }
  return out;
}
