import { requireUser, userRole } from "@/lib/auth/server";
import { listCommandesAval, listToutesCoupes } from "@/lib/services/aval";
import { CoupeClient } from "./coupe-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function CoupePage() {
  const user = await requireUser();
  const role = userRole(user);
  const [commandes, coupes] = await Promise.all([listCommandesAval({ archived: false }), listToutesCoupes()]);

  return <CoupeClient commandes={commandes} coupes={coupes} peutSaisir={PRODUCTION.includes(role)} />;
}
