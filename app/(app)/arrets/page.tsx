import { AlertCircle } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { journeesRecentesAvecArrets } from "@/lib/services/industriel";
import { ArretsClient } from "./arrets-client";

/* Arrêts / temps non productifs (§19) — route dédiée, sans toucher au gros
 * écran GPAO. Ces minutes sont déduites du temps disponible dans le calcul du
 * SAM constaté (lib/domain/sam.ts) : on ne confond plus contre-performance
 * opératrice et perte industrielle. */
export default async function ArretsPage() {
  const journees = await journeesRecentesAvecArrets(40);
  return (
    <>
      <PageHeader
        icon={AlertCircle}
        title="Arrêts & temps non productifs"
        description="Panne, attente matière, attente qualité, changement de modèle… — déduits du SAM constaté"
      />
      <ArretsClient journees={journees} />
    </>
  );
}
