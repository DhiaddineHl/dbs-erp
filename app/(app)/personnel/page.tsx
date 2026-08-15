import { requireUser, userRole } from "@/lib/auth/server";
import { listOuvrieres, listPersonnel, nomsSaisis } from "@/lib/services/atelier";
import { getChaines } from "@/lib/services/gpao";
import { PersonnelClient } from "./personnel-client";

const ATELIER = ["admin", "resp", "chef"];

export default async function PersonnelPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [personnes, ouvrieres, saisies, chaines] = await Promise.all([
    listPersonnel(),
    listOuvrieres(),
    nomsSaisis(),
    getChaines(),
  ]);

  return (
    <PersonnelClient
      personnes={personnes}
      ouvrieres={ouvrieres}
      saisies={saisies}
      chaines={chaines.map((c) => ({ id: c.id, nom: c.nom, effectif: c.ouvrieres.length }))}
      peutSaisir={ATELIER.includes(role)}
    />
  );
}
