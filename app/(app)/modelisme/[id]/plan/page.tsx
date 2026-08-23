import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { PencilRuler } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { contexteCommande, etapeTracesFaite, planOuInitial } from "@/lib/services/plan-coupe";
import { EditeurPlan } from "./editeur";

/* Le plan de coupe d'une commande.
 *
 * Route dédiée plutôt que fenêtre : la fiche de matelassage se cite. La liste
 * des commandes, la traçabilité et l'écran modélisme y renvoient tous, et
 * l'impression n'est qu'un segment de plus dessous — pas un document.write
 * dans une fenêtre surgissante. */
export default async function PlanDeCoupePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const commandeId = Number(id);
  if (!Number.isInteger(commandeId)) notFound();

  const ctx = await contexteCommande(commandeId);
  if (!ctx) notFound();

  /* Une sous-commande n'a pas de plan : on coupe le tissu une fois pour le
   * groupe, sur le porteur — même règle que la réception tissu et le contrôle
   * qualité. Plutôt qu'un message d'erreur, on emmène là où le travail se
   * fait. */
  if (ctx.parentId != null) redirect(`/modelisme/${ctx.parentId}/plan`);

  const [{ plan, existe }, tracesFaites] = await Promise.all([
    planOuInitial(ctx),
    etapeTracesFaite(commandeId),
  ]);

  return (
    <>
      <PageHeader
        icon={PencilRuler}
        title={`Plan de coupe — ${ctx.modele}`}
        description={`OF ${ctx.of || "—"} · ${ctx.client || "client inconnu"} · réf ${ctx.refArticle || "—"}${ctx.couleur ? ` · ${ctx.couleur}` : ""}`}
        actions={
          <Link
            href="/modelisme"
            className="rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            ← Bureau Modélisme
          </Link>
        }
      />
      <EditeurPlan
        ctx={ctx}
        planInitial={plan}
        existe={existe}
        tracesFaites={tracesFaites}
        peutModifier={peutModifier("modelisme", userRole(user))}
      />
    </>
  );
}
