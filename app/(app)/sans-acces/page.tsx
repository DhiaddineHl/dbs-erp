import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser } from "@/lib/auth/server";
import { libelleModule } from "@/lib/auth/acces";

/** Page de refus. Deux cas :
 *  · ?module=… : la page demandée appartient à un module que la matrice
 *    (Paramètres → Rôles) n'ouvre pas à ce rôle — on le dit, sans rien montrer ;
 *  · sans paramètre : un rôle à qui l'on a retiré tous les modules. */
export default async function SansAccesPage({ searchParams }: { searchParams: Promise<{ module?: string }> }) {
  await requireUser();
  const { module } = await searchParams;
  const nom = module ? libelleModule(module) : "";
  return (
    <>
      <PageHeader icon={ShieldOff} title="Accès refusé" description={nom ? `« ${nom} » n'est pas ouvert à votre rôle` : "Ce compte n'a de droit sur aucun module"} />
      <EmptyState
        icon={ShieldOff}
        message={
          nom
            ? `Votre rôle n'a pas accès à « ${nom} ». Si vous en avez besoin, demandez à un administrateur de l'ouvrir dans Paramètres → Rôles.`
            : "Votre rôle ne donne accès à aucune page pour l'instant. Contactez un administrateur pour qu'il vous attribue des droits."
        }
      />
    </>
  );
}
