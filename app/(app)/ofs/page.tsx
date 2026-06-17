import { ClipboardList, Factory, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { OF_EDIT } from "@/lib/modules/edit-columns";
import { listOfs } from "@/lib/services/modules";

export default async function OfsPage() {
  const OFS = await listOfs();
  return (
    <>
      <PageHeader
        icon={ClipboardList}
        title="Ordres de fabrication"
        description="Suivi de la production lancée sur les chaînes internes"
      />

      <KpiGrid>
        <KpiCard label="OFs" value="6" icon={ClipboardList} tone="brand" />
        <KpiCard label="En cours" value="3" icon={Factory} tone="warning" />
        <KpiCard label="Déjà produit" value="1 912 pcs" icon={CheckCircle2} tone="success" />
      </KpiGrid>

      <SectionPanel title="Ordres en production" flush>
        <EditableTable entity="of" columns={OF_EDIT} rows={OFS} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
