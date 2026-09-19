import { PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { commandesConfiables, faconniersRef, tousLesConfiages } from "@/lib/services/industriel";
import { ConfiageClient } from "./confiage-client";

/* Confiage façonnier (§13) — route dédiée : ce qu'on confie à un façonnier pour
 * un OF (confié / expédié / retour prévu). Alimente l'historique factuel par
 * façonnier (écran « Historique façonniers ») et la chaîne confié → reçu, sans
 * créer de seconde GPAO. La réception reste le bon de réception (BR). */
export default async function ConfiagePage() {
  const [commandes, faconniers, confiages] = await Promise.all([
    commandesConfiables(),
    faconniersRef(),
    tousLesConfiages(),
  ]);
  return (
    <>
      <PageHeader
        icon={PackageCheck}
        title="Confiage façonnier"
        description="Déclarer ce qui est confié à un façonnier pour un OF — confié, expédié, retour prévu"
      />
      <ConfiageClient commandes={commandes} faconniers={faconniers} confiages={confiages} />
    </>
  );
}
