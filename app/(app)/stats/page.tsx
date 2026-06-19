import { TrendingUp, Euro, BarChart3, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { DataTable } from "@/components/shared/data-table";
import { Progress } from "@/components/ui/progress";
import { getStatsData } from "@/lib/services/dashboard";

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export default async function StatsPage() {
  const { rows, totals } = await getStatsData();

  return (
    <>
      <PageHeader
        icon={TrendingUp}
        title="Statistiques"
        description="Analyses par client, façonnier et chaîne"
      />

      <KpiGrid>
        <KpiCard label="CA" value={eur(totals.ca)} icon={Euro} tone="brand" />
        <KpiCard label="Marge" value={eur(totals.marge)} icon={BarChart3} tone="purple" />
        <KpiCard label="Pièces" value={totals.pieces.toLocaleString("fr-FR")} icon={Package} tone="info" />
      </KpiGrid>

      <SectionPanel title="Performance par client" flush>
        <DataTable
          columns={["Unité", "Cmd actives", "Pièces", "Produit", "Avancement", "CA", "Marge"]}
          rows={rows.map((s) => [
            <span key="u" className="font-semibold">{s.unite}</span>,
            <span key="c" className="tabular-nums">{s.cmd}</span>,
            <span key="p" className="tabular-nums">{s.pieces.toLocaleString("fr-FR")}</span>,
            <span key="pr" className="tabular-nums">{s.produit.toLocaleString("fr-FR")}</span>,
            <div key="av" className="flex w-28 items-center gap-2">
              <Progress value={s.av} className="h-1.5" />
              <span className="w-8 text-right text-[11px] tabular-nums">{s.av}%</span>
            </div>,
            <span key="ca" className="tabular-nums">{eur(s.ca)}</span>,
            <span key="mg" className="font-semibold tabular-nums text-success-foreground">{eur(s.marge)}</span>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
