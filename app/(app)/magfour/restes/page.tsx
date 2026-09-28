import { Recycle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { lignesPourReception, listRestes } from "@/lib/services/fournitures";
import { droitFournitures } from "../droits";
import { NavMagfour } from "../nav-magfour";
import { RestesClient } from "./restes-client";

export default async function RestesPage() {
  const [peutSaisir, restes, { clients, lignes }] = await Promise.all([droitFournitures(), listRestes(), lignesPourReception("")]);
  return (
    <>
      <PageHeader icon={Recycle} title="Restes de fournitures par client" description="En quantités : réutilisés sur une autre commande du même client, ou rendus avec un bon de retour" />
      <NavMagfour actif="/magfour/restes" />
      <RestesClient restes={restes} clients={clients} lignesOuvertes={lignes.filter((l) => l.reste > 0)} peutSaisir={peutSaisir} />
    </>
  );
}
