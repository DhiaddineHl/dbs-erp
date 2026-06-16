import { Scissors, CheckCircle2, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { Progress } from "@/components/ui/progress";
import { listCoupe } from "@/lib/services/modules";

export default async function CoupePage() {
  const COUPE = await listCoupe();
  return (
    <>
      <PageHeader
        icon={Scissors}
        title="Service Coupe"
        description="Commandes dont le tissu est libéré — planifier et suivre la coupe"
      />

      <KpiGrid>
        <KpiCard label="À couper" value="2" icon={Scissors} tone="warning" />
        <KpiCard label="Coupées" value="1" icon={CheckCircle2} tone="success" />
        <KpiCard label="Libérées coupe" value="6" icon={Layers} tone="brand" />
      </KpiGrid>

      <SectionPanel title="Planning de coupe" flush>
        <DataTable
          columns={["OF", "Modèle / Client", "Qté", "Qté coupée", "Date planifiée", "Fin coupe", "Statut"]}
          rows={COUPE.map((c) => [
            <span key="of" className="font-bold text-brand">{c.of}</span>,
            <span key="m" className="font-semibold">{c.mc}</span>,
            <span key="q" className="tabular-nums">{c.qte.toLocaleString("fr-FR")}</span>,
            <div key="cp" className="flex w-32 items-center gap-2">
              <Progress value={(c.coupee / c.qte) * 100} className="h-1.5" />
              <span className="text-[11px] tabular-nums">{c.coupee}</span>
            </div>,
            c.planif,
            c.fin,
            <StatusBadge key="s" tone={c.statut[0]}>{c.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
