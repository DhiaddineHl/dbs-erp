import { requireUser, userRole } from "@/lib/auth/server";
import { listBl, listCommandesAval } from "@/lib/services/aval";
import { BlClient } from "./bl-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function BlPage() {
  const user = await requireUser();
  const role = userRole(user);
  const [bls, commandes] = await Promise.all([listBl(), listCommandesAval({ archived: false })]);

  return <BlClient bls={bls} commandes={commandes} peutSaisir={PRODUCTION.includes(role)} />;
}
