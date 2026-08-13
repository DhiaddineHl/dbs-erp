import { PageHeader } from "@/components/shared/page-header";
import { requireUser, userRole } from "@/lib/auth/server";
import { droitsDe } from "@/lib/domain/feux";
import { listPreparation } from "@/lib/services/preparation";
import { listFaconniers } from "@/lib/services/commandes";
import { ECRANS, type EcranId } from "./config";
import { EcranPreparation } from "./ecran";

/* Coquille serveur commune aux cinq écrans : charge une fois l'état complet de
 * la préparation, calcule les droits d'écriture du rôle, et laisse la coquille
 * cliente afficher la configuration de l'écran demandé. */
export async function PagePreparation({ ecran }: { ecran: EcranId }) {
  const cfg = ECRANS[ecran];
  const user = await requireUser();
  const [rows, faconniers] = await Promise.all([listPreparation(), listFaconniers()]);

  return (
    <>
      <PageHeader icon={cfg.Icon} title={cfg.titre} description={cfg.sous} />
      <EcranPreparation
        ecran={ecran}
        rows={rows}
        droits={droitsDe(userRole(user))}
        faconniers={faconniers.map((f) => f.nom)}
      />
    </>
  );
}
