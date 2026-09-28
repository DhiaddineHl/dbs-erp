import { requireUser, userRole } from "@/lib/auth/server";
import {
  listActionsRegistre,
  listBaremes,
  listChecklists,
  listCommandesPourQc,
  listInspections,
} from "@/lib/services/qc";
import { QcClient, type OngletQc } from "./qc-client";

const SAISIE = ["admin", "resp", "chef", "qualitycontrol"];
const ONGLETS: OngletQc[] = ["insp", "actions", "dashboard", "baremes", "checklists"];

export default async function QcPage({
  searchParams,
}: {
  searchParams: Promise<{ onglet?: string; origine?: string }>;
}) {
  const user = await requireUser();
  const role = userRole(user);
  const sp = await searchParams;
  const [inspections, baremes, checklists, commandes, actions] = await Promise.all([
    listInspections(),
    listBaremes(),
    listChecklists(),
    listCommandesPourQc(),
    listActionsRegistre(),
  ]);
  const onglet = ONGLETS.find((o) => o === sp.onglet) ?? "insp";
  const origine = sp.origine === "qrqc" || sp.origine === "plan" || sp.origine === "qc" ? sp.origine : "";

  return (
    <QcClient
      // Remonté quand l'adresse change d'onglet (lien depuis le menu ou une alerte).
      key={`${onglet}-${origine}`}
      inspections={inspections}
      baremes={baremes}
      checklists={checklists}
      commandes={commandes}
      actions={actions}
      ongletInitial={onglet}
      origineInitiale={origine}
      peutSaisir={role === "admin" || SAISIE.includes(role)}
    />
  );
}
