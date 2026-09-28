import { PackageOpen } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { lignesPourReception, listReceptionsFournitures } from "@/lib/services/fournitures";
import { droitFournitures } from "../droits";
import { NavMagfour } from "../nav-magfour";
import { ReceptionFournitures } from "./reception-client";

export default async function ReceptionFournituresPage({ searchParams }: { searchParams: Promise<{ client?: string }> }) {
  const { client = "" } = await searchParams;
  const [peutSaisir, { clients, lignes }, historique] = await Promise.all([
    droitFournitures(),
    lignesPourReception(client),
    listReceptionsFournitures(),
  ]);
  return (
    <>
      <PageHeader icon={PackageOpen} title="Réception fournitures — bon client" description="Un bon du client peut livrer plusieurs commandes et plusieurs modèles : une seule saisie" />
      <NavMagfour actif="/magfour/reception" />
      <ReceptionFournitures key={client} client={client} clients={clients} lignes={client ? lignes : []} historique={historique} peutSaisir={peutSaisir} />
    </>
  );
}
