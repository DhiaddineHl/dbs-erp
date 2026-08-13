import { requireUser, userRole } from "@/lib/auth/server";
import { listBaremes, listCommandesPourQc, listInspections } from "@/lib/services/qc";
import { QcClient } from "./qc-client";

const SAISIE = ["admin", "resp", "chef", "qualitycontrol"];

export default async function QcPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [inspections, baremes, commandes] = await Promise.all([
    listInspections(),
    listBaremes(),
    listCommandesPourQc(),
  ]);

  return (
    <QcClient
      inspections={inspections}
      baremes={baremes}
      commandes={commandes}
      peutSaisir={role === "admin" || SAISIE.includes(role)}
    />
  );
}
