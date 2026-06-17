import { ListChecks, FolderOpen, Clock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ACTION_FIELDS } from "@/lib/modules/forms";
import { ACTION_EDIT } from "@/lib/modules/edit-columns";
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
        <EditableTable entity="action" columns={ACTION_EDIT} rows={ACTIONS} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
