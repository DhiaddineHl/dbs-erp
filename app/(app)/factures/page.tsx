import FacturesClient from "./factures-client";
import { getCostLines, getDeletedFactures, getFactures } from "@/lib/services/facturation";
import { listComptesBancaires, listEncaissements } from "@/lib/services/finance";
import { listTauxChange } from "@/lib/services/taux-change";
import type { Couts, Facture } from "@/lib/facturation/store";

/* Facturation state lives in Postgres now — load it server-side so every user
 * shares the same registre, marges and cost entries (no more localStorage). */
export default async function FacturesPage() {
  const [factures, couts, deleted, encaissements, comptes, taux] = await Promise.all([
    getFactures(),
    getCostLines(),
    getDeletedFactures(),
    listEncaissements(),
    listComptesBancaires(),
    listTauxChange(),
  ]);

  return (
    <FacturesClient
      factures={factures as Facture[]}
      couts={couts as Couts}
      deleted={deleted as Facture[]}
      encaissements={encaissements}
      comptes={comptes}
      taux={taux}
    />
  );
}
