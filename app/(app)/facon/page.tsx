import { Handshake, Boxes, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { FACONNIER_FIELDS } from "@/lib/modules/forms";
import { FACONNIER_EDIT } from "@/lib/modules/edit-columns";
import { listFaconniers } from "@/lib/services/modules";
import { createFaconnier } from "@/lib/actions/modules";

export default async function FaconPage() {
  const FACONNIERS = await listFaconniers();
  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Façonniers"
        description="Référentiel de vos sous-traitants — créez-les ici dès le départ, comme vos clients"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau façonnier"
            title="Nouveau façonnier"
            fields={FACONNIER_FIELDS}
            action={createFaconnier}
            successMessage="Façonnier créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Façonniers" value="3" icon={Handshake} tone="brand" />
        <KpiCard label="Cmd en sous-traitance" value="6" icon={Boxes} tone="purple" />
        <KpiCard label="Charge totale" value="5 100 pcs" icon={Layers} tone="warning" />
      </KpiGrid>

      <SectionPanel title="Référentiel façonniers" actions={<StatusBadge tone="brand">{FACONNIERS.length}</StatusBadge>} flush>
        <EditableTable entity="faconnier" columns={FACONNIER_EDIT} rows={FACONNIERS} searchPlaceholder="Rechercher un façonnier…" />
      </SectionPanel>
    </>
  );
}
