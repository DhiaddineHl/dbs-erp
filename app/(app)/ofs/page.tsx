import { ClipboardList, Factory, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { DataTable } from "@/components/shared/data-table";
import { Progress } from "@/components/ui/progress";
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
        <DataTable
          columns={["OF", "Article", "Chaîne", "Qté", "Produit", "Avancement", "Début", "Fin prévue"]}
          rows={OFS.map((o) => [
            <span key="of" className="font-bold text-brand">{o.of}</span>,
            <span key="a" className="font-semibold">{o.article}</span>,
            o.chaine,
            <span key="q" className="tabular-nums">{o.qte.toLocaleString("fr-FR")}</span>,
            <span key="p" className="font-semibold tabular-nums">{o.prod.toLocaleString("fr-FR")}</span>,
            <div key="av" className="flex w-28 items-center gap-2">
              <Progress value={(o.prod / o.qte) * 100} className="h-1.5" />
              <span className="w-9 text-right text-[11px] tabular-nums">{Math.round((o.prod / o.qte) * 100)}%</span>
            </div>,
            o.debut,
            o.fin,
          ])}
        />
      </SectionPanel>
    </>
  );
}
