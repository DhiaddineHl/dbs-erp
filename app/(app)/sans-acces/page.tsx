import { ShieldOff } from "lucide-react";
import { EmptyState } from "@/components/shared/empty-state";
import { PageHeader } from "@/components/shared/page-header";

/** Landing page for a role stripped of every module (an edge case reachable
 * only from the permissions matrix in Paramètres) — keeps a bare account from
 * bouncing between pages it has no access to. */
export default function SansAccesPage() {
  return (
    <>
      <PageHeader icon={ShieldOff} title="Aucun accès" description="Ce compte n'a de droit sur aucun module" />
      <EmptyState
        icon={ShieldOff}
        message="Votre rôle ne donne accès à aucune page pour l'instant. Contactez un administrateur pour qu'il vous attribue des droits."
      />
    </>
  );
}
