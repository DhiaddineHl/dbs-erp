import { FlaskConical, Timer, ListChecks } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { GAMME_FIELDS } from "@/lib/modules/forms";
import { GAMME_EDIT } from "@/lib/modules/edit-columns";
import { listGammes } from "@/lib/services/modules";
import { createGamme } from "@/lib/actions/modules";

export default async function GammesPage() {
  const GAMMES = await listGammes();
  return (
    <>
      <PageHeader
        icon={FlaskConical}
        title="Gammes opératoires & SAM"
        description="Décomposez chaque modèle en opérations chronométrées (SAM = temps standard, en secondes/pièce)"
        actions={
          <EntityFormDialog
            triggerLabel="Nouvelle gamme"
            title="Nouvelle gamme"
            fields={GAMME_FIELDS}
            action={createGamme}
            successMessage="Gamme créée"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Gammes" value="3" icon={FlaskConical} tone="brand" />
        <KpiCard label="SAM moyen" value="615 s" icon={Timer} tone="purple" />
        <KpiCard label="Opérations" value="41" icon={ListChecks} tone="info" />
      </KpiGrid>

      <SectionPanel title="Modèles & temps standards" actions={<StatusBadge tone="brand">{GAMMES.length}</StatusBadge>} flush>
        <EditableTable entity="gamme" columns={GAMME_EDIT} rows={GAMMES} searchPlaceholder="Rechercher un modèle…" />
      </SectionPanel>
    </>
  );
}
