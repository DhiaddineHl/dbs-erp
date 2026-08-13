import { requireUser, userRole } from "@/lib/auth/server";
import { listBr, listCommandesAval } from "@/lib/services/aval";
import { BrClient } from "./br-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function BrPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [brs, commandes] = await Promise.all([listBr(), listCommandesAval({ archived: false })]);

  return <BrClient brs={brs} commandes={commandes} peutSaisir={PRODUCTION.includes(role)} />;
}
