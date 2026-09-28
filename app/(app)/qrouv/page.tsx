import { requireUser, userRole } from "@/lib/auth/server";
import { qrSvg, urlDirection, urlPortail } from "@/lib/atelier/qr";
import { CLE_SEUIL_ALERTE, SEUIL_ALERTE_DEFAUT } from "@/lib/domain/rendement";
import { listOuvrieres } from "@/lib/services/atelier";
import { getSetting } from "@/lib/services/permissions";
import { basePortail, cartesQr } from "@/lib/services/portail";
import { QrOuvClient, type CarteAffichee } from "./qrouv-client";

const ATELIER = ["admin", "resp", "chef"];

export default async function QrOuvPage() {
  const user = await requireUser();
  const role = userRole(user);

  const [cartes, ouvrieres, base, jeton, seuilAlerte] = await Promise.all([
    cartesQr(),
    listOuvrieres(),
    basePortail(),
    getSetting<string>("jetonDirection", ""),
    getSetting<number>(CLE_SEUIL_ALERTE, SEUIL_ALERTE_DEFAUT),
  ]);

  const affichees: CarteAffichee[] = await Promise.all(
    cartes.map(async (c) => {
      const url = urlPortail(base, c.cle);
      return { ...c, url, svg: await qrSvg(url, 128) };
    }),
  );

  const direction = jeton
    ? await (async () => {
        const url = urlDirection(base, jeton);
        return { url, svg: await qrSvg(url, 128) };
      })()
    : null;

  return (
    <QrOuvClient
      cartes={affichees}
      nonRattachees={ouvrieres.filter((o) => o.personnelId === null).length}
      base={await getSetting<string>("basePortail", "")}
      direction={direction}
      peutSaisir={ATELIER.includes(role)}
      seuilAlerte={seuilAlerte}
    />
  );
}
