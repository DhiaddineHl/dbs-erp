import { PackageCheck, Package, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { BR_FIELDS } from "@/lib/modules/forms";
import { listBr } from "@/lib/services/modules";
import { createBr } from "@/lib/actions/modules";

export default async function BrPage() {
  const BRS = await listBr();
  return (
    <>
      <PageHeader
        icon={PackageCheck}
        title="Réception sous-traitance"
        description="Réceptions des façonniers — contrôle qualité, écarts"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau BR"
            title="Nouveau bon de réception"
            fields={BR_FIELDS}
            action={createBr}
            successMessage="BR créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Réceptions" value="3" icon={PackageCheck} tone="brand" />
        <KpiCard label="Pièces reçues" value="1 544 pcs" icon={Package} tone="success" />
        <KpiCard label="Non conformes" value="63" icon={TriangleAlert} tone="danger" />
      </KpiGrid>

      <SectionPanel title="Bons de réception" flush>
        <DataTable
          columns={["N° BR", "Date", "Façonnier", "Commande", "Reçu", "OK / NC", "Contrôle"]}
          rows={BRS.map((b) => [
            <span key="br" className="font-bold text-brand">{b.br}</span>,
            b.date,
            <span key="f" className="font-semibold">{b.facon}</span>,
            <span key="c" className="text-brand">{b.cmd}</span>,
            <span key="r" className="tabular-nums">{b.recu}</span>,
            <span key="o" className="tabular-nums">{b.oknc}</span>,
            <StatusBadge key="ct" tone={b.controle[0]}>{b.controle[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
