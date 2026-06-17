import { Warehouse, Truck, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { MAGASIN_EDIT } from "@/lib/modules/edit-columns";
import { listMagasin } from "@/lib/services/modules";

export default async function MagasinPage() {
  const MAG = await listMagasin();
  return (
    <>
      <PageHeader
        icon={Warehouse}
        title="Magasin produits finis"
        description="Réception depuis production, préparation export, expédition"
      />

      <KpiGrid>
        <KpiCard label="Pièces en stock" value="2 966 pcs" icon={Warehouse} tone="brand" />
        <KpiCard label="À expédier" value="2" icon={Truck} tone="success" />
        <KpiCard label="Réceptions" value="5" icon={PackageCheck} tone="purple" />
      </KpiGrid>

      <SectionPanel title="Stock produits finis" flush>
        <EditableTable entity="magasin" columns={MAGASIN_EDIT} rows={MAG} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
