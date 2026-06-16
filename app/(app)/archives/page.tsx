import { Archive, Euro, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { listArchives } from "@/lib/services/modules";

export default async function ArchivesPage() {
  const ARCH = await listArchives();
  return (
    <>
      <PageHeader
        icon={Archive}
        title="Archives"
        description="Commandes livrées et archivées — délais réels et marges finales"
      />

      <KpiGrid>
        <KpiCard label="Archivées" value="42" icon={Archive} tone="brand" />
        <KpiCard label="CA réalisé" value="638 200 €" icon={Euro} tone="success" />
        <KpiCard label="Marge réalisée" value="152 400 €" icon={BarChart3} tone="purple" />
      </KpiGrid>

      <SectionPanel title="Commandes archivées" flush>
        <DataTable
          columns={["OF", "Modèle", "Client", "Qté", "CA", "Marge", "Livré le", "Retard"]}
          rows={ARCH.map((a) => [
            <span key="of" className="font-bold text-muted-foreground">{a.of}</span>,
            <span key="m" className="font-semibold">{a.modele}</span>,
            a.client,
            <span key="q" className="tabular-nums">{a.qte.toLocaleString("fr-FR")}</span>,
            <span key="ca" className="tabular-nums">{a.ca}</span>,
            <span key="mg" className="font-semibold tabular-nums text-success-foreground">{a.marge}</span>,
            a.livre,
            <StatusBadge key="r" tone={a.retard[0]}>{a.retard[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
