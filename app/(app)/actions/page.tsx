import { ListChecks, FolderOpen, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ACTION_FIELDS } from "@/lib/modules/forms";
import { listActions } from "@/lib/services/modules";
import { createAction } from "@/lib/actions/modules";

export default async function ActionsPage() {
  const ACTIONS = await listActions();
  return (
    <>
      <PageHeader
        icon={ListChecks}
        title="Plans d'actions"
        description="Actions correctives et préventives — responsable, échéance, suivi"
        actions={
          <EntityFormDialog
            triggerLabel="Nouvelle action"
            title="Nouvelle action"
            fields={ACTION_FIELDS}
            action={createAction}
            successMessage="Action créée"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Actions" value="4" icon={ListChecks} tone="brand" />
        <KpiCard label="Ouverts" value="3" icon={FolderOpen} tone="warning" />
        <KpiCard label="En retard" value="1" icon={Clock} tone="danger" />
      </KpiGrid>

      <SectionPanel title="Suivi des actions" flush>
        <DataTable
          columns={["Action", "Responsable", "Échéance", "Priorité", "Statut"]}
          rows={ACTIONS.map((a) => [
            <span key="a" className="font-semibold">{a.action}</span>,
            a.resp,
            a.echeance,
            <StatusBadge key="p" tone={a.prio[0]}>{a.prio[1]}</StatusBadge>,
            <StatusBadge key="s" tone={a.statut[0]}>{a.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
