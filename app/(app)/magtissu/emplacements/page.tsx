import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { listEmplacements } from "@/lib/services/rouleaux";
import { Emplacements } from "./emplacements-client";

/* Emplacements du magasin tissu (zone / rayon / case). Chaque emplacement a
 * son étiquette QR : on la scanne pour ranger ou pour inventorier un rayon. */
export default async function EmplacementsPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [emps, modules] = await Promise.all([listEmplacements(), getRoleModules(role)]);
  return <Emplacements emplacements={emps} peutSaisir={peutModifier("tissu", role) || modules.magtissu === true} />;
}
