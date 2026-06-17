import { Scissors, CheckCircle2, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { COUPE_EDIT } from "@/lib/modules/edit-columns";
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
        <EditableTable entity="coupe" columns={COUPE_EDIT} rows={COUPE} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
