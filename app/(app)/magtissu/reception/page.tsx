import { requireUser } from "@/lib/auth/server";
import { listReceptions } from "@/lib/services/tissu";
import { listClients } from "@/lib/services/commandes";
import { db } from "@/lib/db";
import { tissuLot } from "@/lib/db/schema";
import { ReceptionTissu } from "./reception-client";

export default async function ReceptionPage() {
  await requireUser();
  const [receptions, ids, clients] = await Promise.all([
    listReceptions(),
    db.select({ id: tissuLot.identifiant }).from(tissuLot),
    listClients(),
  ]);
  return (
    <div className="p-4">
      <ReceptionTissu
        receptions={receptions}
        identifiantsExistants={ids.map((r) => r.id)}
        clients={clients.map((c) => c.nom).filter(Boolean)}
      />
    </div>
  );
}
