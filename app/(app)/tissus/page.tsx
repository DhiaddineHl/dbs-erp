import { Layers, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { TISSU_FIELDS } from "@/lib/modules/forms";
import { listTissus } from "@/lib/services/modules";
import { createTissu } from "@/lib/actions/modules";

export default async function TissusPage() {
  const TISSUS = await listTissus();
  return (
    <>
      <PageHeader
        icon={Layers}
        title="Tissus reçus"
        description="Réception des tissus client, contrôle, libération vers la coupe"
        actions={
          <EntityFormDialog
            triggerLabel="Réception tissu"
            title="Réception tissu"
            fields={TISSU_FIELDS}
            action={createTissu}
            successMessage="Réception enregistrée"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="En attente" value="4" icon={Clock} tone="warning" />
        <KpiCard label="Libérés coupe" value="6" icon={CheckCircle2} tone="success" />
        <KpiCard label="Pièces reçues" value="6 130 m" icon={Layers} tone="brand" />
      </KpiGrid>

      <SectionPanel title="Réceptions tissus" actions={<StatusBadge tone="brand">{TISSUS.length}</StatusBadge>} flush>
        <DataTable
          columns={["Date", "Commande", "Désignation", "Qté reçue", "Prévue", "Écart", "Contrôle", "Statut"]}
          rows={TISSUS.map((t) => [
            t.date,
            <span key="c" className="font-semibold text-brand">{t.cmd}</span>,
            t.design,
            <span key="r" className="tabular-nums">{t.recue.toLocaleString("fr-FR")}</span>,
            <span key="p" className="tabular-nums text-muted-foreground">{t.prevue.toLocaleString("fr-FR")}</span>,
            <StatusBadge key="e" tone={t.ecart[0]}>{t.ecart[1]}</StatusBadge>,
            <StatusBadge key="ct" tone={t.controle[0]}>{t.controle[1]}</StatusBadge>,
            <StatusBadge key="s" tone={t.statut[0]}>{t.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
