import { requireUser, userRole } from "@/lib/auth/server";
import { listPrevisionExport } from "@/lib/services/aval";
import { PrevExportClient } from "./prevexport-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function PrevExportPage() {
  const user = await requireUser();
  const role = userRole(user);
  const lignes = await listPrevisionExport();

  return <PrevExportClient lignes={lignes} peutSaisir={PRODUCTION.includes(role)} />;
}
