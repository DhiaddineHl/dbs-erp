import { headers } from "next/headers";
import { requireUser, userRole } from "@/lib/auth/server";
import { qrSvg, urlDirection, urlPortail } from "@/lib/atelier/qr";
import { listOuvrieres } from "@/lib/services/atelier";
import { getSetting } from "@/lib/services/permissions";
import { cartesQr } from "@/lib/services/portail";
import { QrOuvClient, type CarteAffichee } from "./qrouv-client";

const ATELIER = ["admin", "resp", "chef"];

/** Adresse de base des QR : celle configurée par l'administrateur, sinon
 * l'origine de la requête en cours — qui suffit tant qu'on reste sur le même
 * réseau, et qui donne au moins un QR testable tout de suite. */
async function basePortail(): Promise<string> {
  const reglee = await getSetting<string>("basePortail", "");
  if (reglee) return reglee;
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}

export default async function QrOuvPage() {
  const user = await requireUser();
  const role = userRole(user);

  const [cartes, ouvrieres, base, jeton] = await Promise.all([
    cartesQr(),
    listOuvrieres(),
    basePortail(),
    getSetting<string>("jetonDirection", ""),
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
    />
  );
}
