import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { listCatalogueFournitures } from "@/lib/services/preparation";
import { CatalogueFournitures } from "./catalogue-client";

export default async function CataloguePage() {
  const user = await requireUser();
  const role = userRole(user);
  const [catalogue, modules] = await Promise.all([listCatalogueFournitures(), getRoleModules(role)]);
  const peutSaisir = peutModifier("four", role) || !!modules.magfour;
  return (
    <div className="p-4">
      <CatalogueFournitures catalogue={catalogue} peutSaisir={peutSaisir} />
    </div>
  );
}
