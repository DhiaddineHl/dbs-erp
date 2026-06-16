import { BarChart3, Factory, Wallet, Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
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
        <DataTable
          columns={["Chaîne", "Effectif", "Min. effectives/j", "Modèle en cours", "Capacité/jour", "Coût MO/jour"]}
          rows={CHAINES.map((c) => [
            <span key="c" className="font-semibold">{c.ch}</span>,
            <span key="e" className="tabular-nums">{c.eff}</span>,
            <span key="m" className="tabular-nums">{c.min}</span>,
            c.modele,
            <span key="cap" className="font-semibold tabular-nums">{c.cap}</span>,
            <span key="ct" className="tabular-nums">{c.cout}</span>,
          ])}
        />
      </SectionPanel>

      <SectionPanel title="Costing par OF" flush>
        <DataTable
          columns={["OF", "Modèle", "Qté", "SAM", "Coût MO/pcs", "Coût total", "Prix façon", "Écart", "Délai est."]}
          rows={COSTING.map((c) => [
            <span key="of" className="font-bold text-brand">{c.of}</span>,
            c.modele,
            <span key="q" className="tabular-nums">{c.qte.toLocaleString("fr-FR")}</span>,
            <span key="s" className="tabular-nums">{c.sam}</span>,
            <span key="cp" className="tabular-nums">{c.coutP}</span>,
            <span key="ct" className="tabular-nums">{c.coutT}</span>,
            <span key="pf" className="tabular-nums">{c.pf}</span>,
            <StatusBadge key="e" tone={c.ecart[0]}>{c.ecart[1]}</StatusBadge>,
            <span key="d" className="tabular-nums">{c.delai}</span>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
