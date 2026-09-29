import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser, userRole } from "@/lib/auth/server";
import { peutModifier } from "@/lib/domain/feux";
import { getRoleModules } from "@/lib/services/permissions";
import { getInventaire } from "@/lib/services/rouleaux";
import { StatusBadge } from "@/components/shared/status-badge";
import { ClotureInventaire } from "../inventaires-client";

export default async function InventairePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const role = userRole(user);
  const [inv, modules] = await Promise.all([getInventaire(Number((await params).id)), getRoleModules(role)]);
  if (!inv) notFound();
  const peutSaisir = peutModifier("tissu", role) || modules.magtissu === true;
  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <Link href="/magtissu/inventaires" className="text-xs font-semibold text-muted-foreground hover:underline">
          ← Inventaires
        </Link>
        <h1 className="font-mono text-lg font-black">{inv.numero}</h1>
        <span className="text-xs text-muted-foreground">
          {inv.zone ? `zone ${inv.zone}` : "tout le magasin"} · ouvert par {inv.ouvertPar}
        </span>
        {inv.statut === "ouvert" ? <StatusBadge tone="warning">En cours</StatusBadge> : <StatusBadge tone="success">Clos par {inv.closPar}</StatusBadge>}
      </div>
      <ClotureInventaire inventaire={inv} peutSaisir={peutSaisir && inv.statut === "ouvert"} />
    </div>
  );
}
