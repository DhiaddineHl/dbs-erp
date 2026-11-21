import { Globe } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { exigerModule, userRole } from "@/lib/auth/server";
import { db } from "@/lib/db";
import { client, faconnier } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { estSousTraitee } from "@/lib/domain/commande";
import { listAcces } from "@/lib/services/portail-acces";
import { basePortail } from "@/lib/services/portail";
import { PortailsClient } from "./portails-client";

/* ACCÈS AUX PORTAILS — un lien (et un QR) par personne extérieure : chez
 * chaque client, chez chaque sous-traitant. Un accès se coupe, sa clé ou son
 * PIN se regénèrent, sans toucher aux autres. */

export const dynamic = "force-dynamic";

export default async function PortailsPage() {
  const user = await exigerModule("portails");
  const role = userRole(user);
  const peutGerer = ["admin", "resp"].includes(role);
  const [acces, clients, ateliers, base] = await Promise.all([
    peutGerer ? listAcces() : Promise.resolve([]),
    db.select({ id: client.id, nom: client.nom }).from(client).orderBy(asc(client.nom)),
    db.select({ id: faconnier.id, nom: faconnier.nom }).from(faconnier).orderBy(asc(faconnier.nom)),
    basePortail(),
  ]);
  return (
    <>
      <PageHeader
        icon={Globe}
        title="Portails clients & sous-traitants"
        description="Un lien et un QR par personne : le client suit ses commandes et son tissu, le sous-traitant déclare sa production et ses livraisons."
      />
      {!peutGerer ? (
        <div className="rounded-lg border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
          Réservé au responsable de production et à l&apos;administrateur.
        </div>
      ) : (
        <PortailsClient
          acces={acces.map((a) => ({
            id: a.id,
            type: a.type as "client" | "soustraitant",
            cible: a.cible,
            nom: a.nom,
            avecPin: !!a.pinHash,
            actif: a.actif,
            cle: a.cle,
            derniereVisite: a.derniereVisite?.toISOString() ?? "",
            nbVisites: a.nbVisites,
            evenements: a.evenements,
          }))}
          clients={clients}
          ateliers={ateliers.filter((f) => estSousTraitee({ faconnier: f.nom }))}
          base={base.replace(/\/+$/, "")}
        />
      )}
    </>
  );
}
