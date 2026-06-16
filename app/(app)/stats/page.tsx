import { TrendingUp, Euro, BarChart3, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { DataTable } from "@/components/shared/data-table";
import { Progress } from "@/components/ui/progress";

const STATS = [
  { unite: "Lacoste France", cmd: 4, pieces: 4200, produit: 2688, av: 64, ca: "86 400 €", marge: "22 100 €" },
  { unite: "Kiabi", cmd: 3, pieces: 5000, produit: 1100, av: 22, ca: "61 800 €", marge: "15 300 €" },
  { unite: "Celio International", cmd: 3, pieces: 2400, produit: 2112, av: 88, ca: "52 100 €", marge: "13 050 €" },
  { unite: "Jules SA", cmd: 2, pieces: 1050, produit: 0, av: 0, ca: "48 300 €", marge: "10 750 €" },
];

export default function StatsPage() {
  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title="Statistiques"
        description="Analyses par client, façonnier et chaîne"
      />

      <KpiGrid>
        <KpiCard label="CA" value="248 600 €" icon={Euro} tone="brand" />
        <KpiCard label="Marge" value="61 200 €" icon={BarChart3} tone="purple" />
        <KpiCard label="Pièces" value="12 650" icon={Package} tone="info" />
      </KpiGrid>

      <SectionPanel title="Performance par client" flush>
        <DataTable
          columns={["Unité", "Cmd actives", "Pièces", "Produit", "Avancement", "CA", "Marge"]}
          rows={STATS.map((s) => [
            <span key="u" className="font-semibold">{s.unite}</span>,
            <span key="c" className="tabular-nums">{s.cmd}</span>,
            <span key="p" className="tabular-nums">{s.pieces.toLocaleString("fr-FR")}</span>,
            <span key="pr" className="tabular-nums">{s.produit.toLocaleString("fr-FR")}</span>,
            <div key="av" className="flex w-28 items-center gap-2">
              <Progress value={s.av} className="h-1.5" />
              <span className="w-8 text-right text-[11px] tabular-nums">{s.av}%</span>
            </div>,
            <span key="ca" className="tabular-nums">{s.ca}</span>,
            <span key="mg" className="font-semibold tabular-nums text-success-foreground">{s.marge}</span>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
