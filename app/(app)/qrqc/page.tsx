import { SearchCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { QRQC_FIELDS } from "@/lib/modules/forms";
import { QRQC_EDIT } from "@/lib/modules/edit-columns";
import { listQrqc } from "@/lib/services/modules";
import { createQrqc } from "@/lib/actions/modules";

export default async function QrqcPage() {
  const QRQC = await listQrqc();
  return (
    <>
      <PageHeader
        icon={SearchCheck}
        title="QRQC / 5M"
        description="Quick Response Quality Control — analyse 5M (Main d'œuvre, Machine, Matière, Méthode, Milieu)"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau QRQC"
            title="Nouveau QRQC / 5M"
            fields={QRQC_FIELDS}
            action={createQrqc}
            successMessage="QRQC créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Problèmes" value="3" icon={SearchCheck} tone="brand" />
        <KpiCard label="En cours" value="1" icon={AlertCircle} tone="warning" />
        <KpiCard label="Résolus" value="1" icon={CheckCircle2} tone="success" />
      </KpiGrid>

      <SectionPanel title="Résolution de problèmes" flush>
        <EditableTable entity="qrqc" columns={QRQC_EDIT} rows={QRQC} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
