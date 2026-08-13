import { requireUser, userRole } from "@/lib/auth/server";
import { listCommandesAval } from "@/lib/services/aval";
import { MagasinClient } from "./magasin-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function MagasinPage() {
  const user = await requireUser();
  const role = userRole(user);
  const commandes = await listCommandesAval({ archived: false });

  return <MagasinClient commandes={commandes} peutSaisir={PRODUCTION.includes(role)} />;
}
