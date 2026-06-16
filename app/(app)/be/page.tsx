import { PencilRuler, Mail, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { listBe } from "@/lib/services/modules";

export default async function BePage() {
  const BE = await listBe();
  return (
    <>
      <PageHeader
        icon={PencilRuler}
        title="Bureau d'Études"
        description="Tête de série → envoi client → OK Production reçu par email"
        actions={<Button size="sm"><Mail className="size-4" /> Envoyer TDS</Button>}
      />

      <KpiGrid>
        <KpiCard label="En attente OK PRO" value="1" icon={Clock} tone="warning" />
        <KpiCard label="OK PRO validés" value="5" icon={CheckCircle2} tone="success" />
        <KpiCard label="Têtes de série" value="6" icon={PencilRuler} tone="brand" />
      </KpiGrid>

      <SectionPanel title="Têtes de série" flush>
        <DataTable
          columns={["OF", "Modèle / Client", "Envoi TDS", "OK PRO reçu", "Réf email", "Statut"]}
          rows={BE.map((b) => [
            <span key="of" className="font-bold text-brand">{b.of}</span>,
            <span key="m" className="font-semibold">{b.mc}</span>,
            b.envoi,
            b.ok,
            <span key="r" className="text-muted-foreground">{b.ref}</span>,
            <StatusBadge key="s" tone={b.statut[0]}>{b.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
