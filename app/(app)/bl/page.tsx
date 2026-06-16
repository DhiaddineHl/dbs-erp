import { FileText, Euro, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { BL_FIELDS } from "@/lib/modules/forms";
import { listBl } from "@/lib/services/modules";
import { createBl } from "@/lib/actions/modules";

export default async function BlPage() {
  const BLS = await listBl();
  return (
    <>
      <PageHeader
        icon={FileText}
        title="Bons de livraison"
        description="Documents d'export vers clients — N° auto, impression"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau BL"
            title="Nouveau bon de livraison"
            fields={BL_FIELDS}
            action={createBl}
            successMessage="BL créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="BL émis" value="3" icon={FileText} tone="brand" />
        <KpiCard label="Total HT" value="40 500 €" icon={Euro} tone="success" />
        <KpiCard label="Facturés" value="1" icon={CheckCircle2} tone="purple" />
      </KpiGrid>

      <SectionPanel title="Bons de livraison" flush>
        <DataTable
          columns={["N° BL", "Date", "Client", "Lignes", "Qté", "Total HT", "Statut"]}
          rows={BLS.map((b) => [
            <span key="bl" className="font-bold text-brand">{b.bl}</span>,
            b.date,
            <span key="c" className="font-semibold">{b.client}</span>,
            <span key="l" className="tabular-nums">{b.lignes}</span>,
            <span key="q" className="tabular-nums">{b.qte.toLocaleString("fr-FR")}</span>,
            <span key="t" className="font-semibold tabular-nums text-success-foreground">{b.total}</span>,
            <StatusBadge key="s" tone={b.statut[0]}>{b.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
