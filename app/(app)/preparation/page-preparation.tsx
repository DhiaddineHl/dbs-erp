import { PageHeader } from "@/components/shared/page-header";
import { requireUser, userRole } from "@/lib/auth/server";
import { droitsDe } from "@/lib/domain/feux";
import { listPreparation, listCatalogueFournitures } from "@/lib/services/preparation";
import { listFaconniers } from "@/lib/services/commandes";
import { getRoleModules } from "@/lib/services/permissions";
import { ECRANS, type EcranId } from "./config";
import { EcranPreparation } from "./ecran";

/* Coquille serveur commune aux cinq écrans : charge une fois l'état complet de
 * la préparation, calcule les droits d'écriture du rôle, et laisse la coquille
 * cliente afficher la configuration de l'écran demandé. */
export async function PagePreparation({ ecran }: { ecran: EcranId }) {
  const cfg = ECRANS[ecran];
  const user = await requireUser();
  const role = userRole(user);
  const [rows, faconniers, modules, catalogue] = await Promise.all([
    listPreparation(),
    listFaconniers(),
    getRoleModules(role),
    ecran === "magfour" ? listCatalogueFournitures() : Promise.resolve([]),
  ]);

  /* Les droits d'écriture magasin suivent l'ACCÈS MODULE accordé par l'admin :
   * si un compte magasin tissu s'est vu ouvrir le module « magfour », il peut
   * aussi y écrire (et réciproquement) — sinon on avait deux réglages
   * contradictoires (accès sans droit d'écriture). */
  const droits = droitsDe(role);
  if (modules.magtissu) droits.tissu = true;
  if (modules.magfour) droits.four = true;

  return (
    <>
      <PageHeader icon={cfg.Icon} title={cfg.titre} description={cfg.sous} />
      <EcranPreparation
        ecran={ecran}
        rows={rows}
        droits={droits}
        faconniers={faconniers.map((f) => f.nom)}
        catalogue={catalogue}
      />
    </>
  );
}
