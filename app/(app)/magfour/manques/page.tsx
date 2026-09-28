import { BellRing } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { manques as calculerManques } from "@/lib/domain/fournitures";
import { lignesEnManque, relances } from "@/lib/services/fournitures";
import { droitFournitures } from "../droits";
import { NavMagfour } from "../nav-magfour";
import { ManquesClient } from "./manques-client";

export default async function ManquesPage() {
  const [peutSaisir, lignes, r] = await Promise.all([droitFournitures(), lignesEnManque(), relances()]);
  const { demandes, achats } = calculerManques(lignes);
  return (
    <>
      <PageHeader icon={BellRing} title="Manques fournitures & relances" description="Fourni client → demande de complément · acheté DBS → liste d'achat · export proche → relance" />
      <NavMagfour actif="/magfour/manques" />
      <ManquesClient jours={r.jours} relances={r.clients} demandes={demandes} achats={achats} peutSaisir={peutSaisir} />
    </>
  );
}
