import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { commandesPourAffectation, listLots } from "@/lib/services/tissu";
import { MagasinTissu } from "./magtissu-client";

export default async function Page() {
  const user = await requireUser();
  const role = userRole(user);
  const [lots, commandes] = await Promise.all([listLots(), commandesPourAffectation()]);
  return <MagasinTissu lots={lots} commandes={commandes} peutSaisir={peutModifier("tissu", role)} />;
}
