import { BarChart3, Factory, Wallet, Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { CAPACITE_EDIT, COSTING_EDIT } from "@/lib/modules/edit-columns";
import { listCapaciteChaines, listCosting } from "@/lib/services/modules";

export default async function CapacitePage() {
  const CHAINES = await listCapaciteChaines();
  const COSTING = await listCosting();
  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Capacité & Costing"
        description="Capacité de ligne, coût main d'œuvre et délais — calculés par le SAM"
      />

      <KpiGrid>
        <KpiCard label="Capacité interne/j" value="121 pcs" icon={Factory} tone="brand" />
        <KpiCard label="Coût MO/jour" value="1 259 €" icon={Wallet} tone="purple" />
        <KpiCard label="Capacité théorique" value="2 904 pcs" icon={Gauge} tone="info" />
      </KpiGrid>

      <SectionPanel title="Capacité par chaîne" flush>
        <EditableTable entity="capacite" columns={CAPACITE_EDIT} rows={CHAINES} searchPlaceholder="Rechercher…" />
      </SectionPanel>

      <SectionPanel title="Costing par OF" flush>
        <EditableTable entity="costing" columns={COSTING_EDIT} rows={COSTING} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
