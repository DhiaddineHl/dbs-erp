import { Archive, Euro, BarChart3 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { ARCHIVE_EDIT } from "@/lib/modules/edit-columns";
import { listArchives } from "@/lib/services/modules";

export default async function ArchivesPage() {
  const ARCH = await listArchives();
  return (
    <>
      <PageHeader
        icon={Archive}
        title="Archives"
        description="Commandes livrées et archivées — délais réels et marges finales"
      />

      <KpiGrid>
        <KpiCard label="Archivées" value="42" icon={Archive} tone="brand" />
        <KpiCard label="CA réalisé" value="638 200 €" icon={Euro} tone="success" />
        <KpiCard label="Marge réalisée" value="152 400 €" icon={BarChart3} tone="purple" />
      </KpiGrid>

      <SectionPanel title="Commandes archivées" flush>
        <EditableTable entity="archive" columns={ARCHIVE_EDIT} rows={ARCH} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
