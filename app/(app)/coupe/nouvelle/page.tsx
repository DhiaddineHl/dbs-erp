import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Scissors } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { requireUser, userRole } from "@/lib/auth/server";
import * as av from "@/lib/domain/aval";
import { contexteCoupe, porteurDe } from "@/lib/services/coupe";
import { AssistantCoupe } from "./assistant";

/* Nouvelle coupe : elle part du PLAN DE COUPE de la commande (du porteur pour
 * des OF réunis). Tailles et quantités prévues sont importées, jamais
 * retapées. */
export default async function NouvelleCoupePage({ searchParams }: { searchParams: Promise<{ commande?: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const id = Number((await searchParams).commande);
  if (!Number.isInteger(id)) notFound();
  const porteur = await porteurDe(id);
  if (porteur == null) notFound();
  if (porteur !== id) redirect(`/coupe/nouvelle?commande=${porteur}`);
  const ctx = await contexteCoupe(porteur);
  if (!ctx) notFound();
  const peutSaisir = role === "admin" || av.ROLES_SAISIE_MAGASIN.includes(role);
  return (
    <>
      <PageHeader icon={Scissors} title={`Nouvelle coupe — ${ctx.porteur.of}`} description="Depuis le plan de coupe : rien à retaper, l'écart prévu / coupé est contrôlé" />
      <div className="mb-3">
        <Link href="/coupe" className="inline-flex h-8 items-center rounded-md border px-2.5 text-[11px] font-semibold hover:bg-muted">
          ← Service coupe
        </Link>
      </div>
      {!ctx.plan ? (
        <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm">
          <p className="font-semibold">Pas encore de plan de coupe pour {ctx.porteur.of}.</p>
          <p className="mt-1 text-muted-foreground">La coupe part du plan : la modéliste le prépare dans le Bureau modélisme.</p>
          <Link href={`/modelisme/${ctx.porteur.id}/plan`} className="mt-3 inline-block font-semibold text-brand underline">
            Ouvrir le plan de coupe
          </Link>
        </div>
      ) : !peutSaisir ? (
        <div className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">Consultation seule : la saisie de coupe est réservée à la production et au magasin.</div>
      ) : (
        <AssistantCoupe ctx={ctx} />
      )}
    </>
  );
}
