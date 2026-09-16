import { requireUser, userRole } from "@/lib/auth/server";
import { listBaremes, listChecklists, listCommandesPourQc, listInspections } from "@/lib/services/qc";
import { QcClient } from "./qc-client";

const SAISIE = ["admin", "resp", "chef", "qualitycontrol"];

export default async function QcPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [inspections, baremes, checklists, commandes] = await Promise.all([
    listInspections(),
    listBaremes(),
    listChecklists(),
    listCommandesPourQc(),
  ]);

  return (
    <QcClient
      inspections={inspections}
      baremes={baremes}
      checklists={checklists}
      commandes={commandes}
      peutSaisir={role === "admin" || SAISIE.includes(role)}
    />
  );
}
