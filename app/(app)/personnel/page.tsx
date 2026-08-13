import { requireUser, userRole } from "@/lib/auth/server";
import { listOuvrieres, listPersonnel } from "@/lib/services/atelier";
import { PersonnelClient } from "./personnel-client";

const ATELIER = ["admin", "resp", "chef"];

export default async function PersonnelPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [personnes, ouvrieres] = await Promise.all([listPersonnel(), listOuvrieres()]);

  return <PersonnelClient personnes={personnes} ouvrieres={ouvrieres} peutSaisir={ATELIER.includes(role)} />;
}
