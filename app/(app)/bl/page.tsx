import { requireUser, userRole } from "@/lib/auth/server";
import { listBl } from "@/lib/services/aval";
import { vueMagasin } from "@/lib/services/magasin-vue";
import { BlClient } from "./bl-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function BlPage() {
  const user = await requireUser();
  const role = userRole(user);
  // Les commandes avec leur stock PAR TAILLE (pour livrer taille par taille).
  const [bls, { commandes }] = await Promise.all([listBl(), vueMagasin()]);

  return <BlClient bls={bls} commandes={commandes} peutSaisir={PRODUCTION.includes(role)} />;
}
