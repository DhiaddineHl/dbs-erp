import { CalendarRange, ListOrdered, Factory, Handshake, Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
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
        <DataTable
          columns={["#", "Priorité", "OF", "Modèle / Client", "Qté", "SAM", "Charge (min)", "Assigné", "Export", "Criticité"]}
          rows={ORDO.map((o) => [
            <span key="r" className="font-bold tabular-nums text-muted-foreground">{o.rang}</span>,
            <StatusBadge key="p" tone={o.prio[0]}>{o.prio[1]}</StatusBadge>,
            <span key="of" className="font-bold text-brand">{o.of}</span>,
            <span key="m" className="font-semibold">{o.mc}</span>,
            <span key="q" className="tabular-nums">{o.qte.toLocaleString("fr-FR")}</span>,
            <span key="s" className="tabular-nums">{o.sam}</span>,
            <span key="c" className="tabular-nums">{o.charge}</span>,
            o.assigne,
            o.export,
            <StatusBadge key="cr" tone={o.crit[0]}>{o.crit[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
