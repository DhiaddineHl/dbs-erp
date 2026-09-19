import "server-only";
import { db } from "@/lib/db";
import { br, faconnier, faconnierConfiage } from "@/lib/db/schema";
import { bilansFaconniers, type BilanFaconnier } from "@/lib/domain/faconnier";

/* Historique factuel par façonnier (§14) : dérivé des confiages et des
 * réceptions (BR), sans score arbitraire. Ne s'appuie que sur des faits. */

export type BilanFaconnierNomme = BilanFaconnier & { nom: string };

/** Le confiage écrit `faconnierId` ; les BR existants ne l'ont pas forcément
 * (colonne ajoutée en 0030). On rattache alors par le nom recopié quand l'id
 * manque, pour ne pas perdre l'historique déjà saisi. */
export async function bilansFaconniersNommes(): Promise<BilanFaconnierNomme[]> {
  const [confiages, receptions, faconniers] = await Promise.all([
    db
      .select({
        faconnierId: faconnierConfiage.faconnierId,
        commandeId: faconnierConfiage.commandeId,
        qteConfiee: faconnierConfiage.qteConfiee,
        qteExpediee: faconnierConfiage.qteExpediee,
        dateConfiee: faconnierConfiage.dateConfiee,
        dateRetourPrevue: faconnierConfiage.dateRetourPrevue,
        prixFacon: faconnierConfiage.prixFacon,
      })
      .from(faconnierConfiage),
    db
      .select({
        faconnierId: br.faconnierId,
        commandeId: br.commandeId,
        date: br.date,
        qteRecue: br.qteRecue,
        qteOk: br.qteOk,
        qteNc: br.qteNc,
      })
      .from(br),
    db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier),
  ]);

  const nomParId = new Map(faconniers.map((f) => [f.id, f.nom]));

  const bilans = bilansFaconniers(
    confiages.filter((c): c is typeof c & { faconnierId: number } => c.faconnierId != null),
    receptions.filter((r): r is typeof r & { faconnierId: number } => r.faconnierId != null),
  );

  return bilans.map((b) => ({ ...b, nom: nomParId.get(b.faconnierId) ?? "—" }));
}
