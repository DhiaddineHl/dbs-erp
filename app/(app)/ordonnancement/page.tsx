import { CalendarRange, ListOrdered, Factory, Handshake, Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { ORDO_EDIT } from "@/lib/modules/edit-columns";
import { listOrdo } from "@/lib/services/modules";

export default async function OrdonnancementPage() {
  const ORDO = await listOrdo();
  return (
    <>
      <PageHeader
        icon={CalendarRange}
        title="Ordonnancement"
        description="Ordre de lancement optimisé et équilibrage de charge entre chaînes internes et façonniers"
      />

      <KpiGrid>
        <KpiCard label="À ordonnancer" value="3" icon={ListOrdered} tone="brand" />
        <KpiCard label="Charge totale" value="25 173 min" icon={Factory} tone="purple" />
        <KpiCard label="Charge totale ST" value="11 267 min" icon={Handshake} tone="warning" />
        <KpiCard label="Capacité totale" value="34 800 min" icon={Gauge} tone="info" />
      </KpiGrid>

      <SectionPanel title="Plan de lancement" flush>
        <EditableTable entity="ordo" columns={ORDO_EDIT} rows={ORDO} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
