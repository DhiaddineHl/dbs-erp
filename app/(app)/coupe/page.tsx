import { requireUser, userRole } from "@/lib/auth/server";
import { listCommandesAval, listToutesCoupes } from "@/lib/services/aval";
import { listFiches, seuilEcart } from "@/lib/services/coupe";
import { resumesPlans } from "@/lib/services/plan-coupe";
import { CoupeClient } from "./coupe-client";

const PRODUCTION = ["admin", "resp", "chef", "magasin"];

export default async function CoupePage() {
  const user = await requireUser();
  const role = userRole(user);
  const [commandes, coupes, plans, fiches, seuil] = await Promise.all([
    listCommandesAval({ archived: false }),
    listToutesCoupes(),
    resumesPlans(),
    listFiches(),
    seuilEcart(),
  ]);
  // État du plan de chaque commande qui en a un (porteur) : la coupe en part.
  const etatsPlans: Record<number, "pret" | "estime" | "ordre"> = Object.fromEntries(
    [...plans.entries()].map(([id, p]) => [id, p.pieces > 0 ? (p.estime ? "estime" : "pret") : "ordre"]),
  );

  return (
    <CoupeClient
      commandes={commandes}
      coupes={coupes}
      plans={etatsPlans}
      fiches={fiches}
      seuil={seuil}
      peutSaisir={PRODUCTION.includes(role)}
      peutReglerSeuil={["admin", "resp"].includes(role)}
    />
  );
}
