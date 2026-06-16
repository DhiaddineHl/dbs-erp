import { Warehouse, Truck, PackageCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
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
        <DataTable
          columns={["OF", "Modèle / Client", "Source", "Qté cmd", "Reçu magasin", "Statut"]}
          rows={MAG.map((m) => [
            <span key="of" className="font-bold text-brand">{m.of}</span>,
            <span key="mc" className="font-semibold">{m.mc}</span>,
            <StatusBadge key="src" tone={m.source[0]}>{m.source[1]}</StatusBadge>,
            <span key="c" className="tabular-nums">{m.cmd.toLocaleString("fr-FR")}</span>,
            <span key="r" className="font-semibold tabular-nums">{m.recu.toLocaleString("fr-FR")}</span>,
            <StatusBadge key="s" tone={m.statut[0]}>{m.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
