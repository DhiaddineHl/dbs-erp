import { Handshake, Boxes, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { FACONNIER_FIELDS } from "@/lib/modules/forms";
import { FACONNIER_COLUMNS } from "@/lib/modules/columns";
import { FACONNIER_EDIT } from "@/lib/modules/edit-columns";
import { listFaconniers } from "@/lib/services/commandes";
import { createFaconnier, importFaconniers } from "@/lib/actions/commandes";

const nb = new Intl.NumberFormat("fr-FR");

export default async function FaconPage() {
  const FACONNIERS = await listFaconniers();
  const cmdTotal = FACONNIERS.reduce((s, f) => s + f.cmd, 0);
  const chargeTotal = FACONNIERS.reduce((s, f) => s + f.charge, 0);

  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Façonniers"
        description="Référentiel de vos sous-traitants — créez-les ici dès le départ, comme vos clients"
        actions={
          <>
            <ExportCsvButton rows={FACONNIERS} columns={FACONNIER_COLUMNS} filename="faconniers" />
            <ImportButton action={importFaconniers} label="Importer (CSV/Excel)" />
            <EntityFormDialog
              triggerLabel="Nouveau façonnier"
              title="Nouveau façonnier"
              fields={FACONNIER_FIELDS}
              action={createFaconnier}
              successMessage="Façonnier créé"
            />
          </>
        }
      />

      <KpiGrid>
        <KpiCard label="Façonniers" value={String(FACONNIERS.length)} icon={Handshake} tone="brand" />
        <KpiCard label="Cmd en sous-traitance" value={String(cmdTotal)} icon={Boxes} tone="purple" />
        <KpiCard label="Charge totale" value={`${nb.format(chargeTotal)} pcs`} icon={Layers} tone="warning" />
      </KpiGrid>

      <SectionPanel title="Référentiel façonniers" actions={<StatusBadge tone="brand">{FACONNIERS.length}</StatusBadge>} flush>
        <EditableTable entity="faconnier" columns={FACONNIER_EDIT} rows={FACONNIERS} searchPlaceholder="Rechercher un façonnier…" />
      </SectionPanel>
    </>
  );
}
