import { exigerModule, userRole } from "@/lib/auth/server";
import { listPrevisionExport } from "@/lib/services/aval";
import { brouillon, historique } from "@/lib/services/prevision-client";
import { estWeekEnd } from "@/lib/domain/prevision-client";
import { todayISO } from "@/lib/domain/commande";
import { PrevExportClient } from "./prevexport-client";
import { PublicationClients } from "./publication-clients";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export const dynamic = "force-dynamic";

export default async function PrevExportPage() {
  const user = await exigerModule("prevexport");
  const role = userRole(user);
  const [lignes, b, h] = await Promise.all([listPrevisionExport(), brouillon(), historique()]);

  return (
    <PrevExportClient
      lignes={lignes}
      peutSaisir={PRODUCTION.includes(role)}
      publication={<PublicationClients b={b} historique={h} peutPublier={["admin", "resp"].includes(role)} weekEnd={estWeekEnd(todayISO())} />}
    />
  );
}
