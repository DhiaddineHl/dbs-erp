import "server-only";
import { asc, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { commande, stDeclaration } from "@/lib/db/schema";
import { confectionDeclaree } from "@/lib/domain/soustraitant";

/* Avancement DÉCLARÉ par les ateliers extérieurs (saisie du soir du portail
 * sous-traitant), sous la forme que peut afficher le portail client :
 *  · plafonné (jamais plus que lancé, ni que la quantité de l'OF) ;
 *  · jamais en recul (le maximum atteint reste) ;
 *  · emballé jamais au-dessus du produit.
 * Lecture seule : `commande.produit` n'est PAS touché (seul
 * lib/services/avancement.ts l'écrit, depuis les BR validés). */
export async function avancementDeclare(ids: number[]): Promise<Map<number, { produit: number; emballe: number }>> {
  const out = new Map<number, { produit: number; emballe: number }>();
  if (!ids.length) return out;
  const [decls, cmds] = await Promise.all([
    db.select().from(stDeclaration).where(inArray(stDeclaration.commandeId, ids)).orderBy(asc(stDeclaration.jour), asc(stDeclaration.id)),
    db.select({ id: commande.id, qte: commande.qte }).from(commande).where(inArray(commande.id, ids)),
  ]);
  const qte = new Map(cmds.map((c) => [c.id, c.qte]));
  for (const id of ids) {
    const d = decls.filter((x) => x.commandeId === id);
    if (!d.length) continue;
    const produit = confectionDeclaree(d, qte.get(id) ?? 0);
    const emballe = Math.min(produit, d.reduce((m, x) => Math.max(m, Math.min(x.emballe, x.produit)), 0));
    out.set(id, { produit, emballe });
  }
  return out;
}
