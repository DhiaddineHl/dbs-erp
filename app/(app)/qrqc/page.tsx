import { SearchCheck, AlertCircle, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { QRQC_FIELDS } from "@/lib/modules/forms";
import { listQrqc } from "@/lib/services/modules";
import { createQrqc } from "@/lib/actions/modules";

export default async function QrqcPage() {
  const QRQC = await listQrqc();
  return (
    <>
      <PageHeader
        icon={SearchCheck}
        title="QRQC / 5M"
        description="Quick Response Quality Control — analyse 5M (Main d'œuvre, Machine, Matière, Méthode, Milieu)"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau QRQC"
            title="Nouveau QRQC / 5M"
            fields={QRQC_FIELDS}
            action={createQrqc}
            successMessage="QRQC créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Problèmes" value="3" icon={SearchCheck} tone="brand" />
        <KpiCard label="En cours" value="1" icon={AlertCircle} tone="warning" />
        <KpiCard label="Résolus" value="1" icon={CheckCircle2} tone="success" />
      </KpiGrid>

      <SectionPanel title="Résolution de problèmes" flush>
        <DataTable
          columns={["Date", "Problème", "Cause 5M", "Commande", "Action corrective", "Statut"]}
          rows={QRQC.map((q) => [
            q.date,
            <span key="p" className="font-semibold">{q.pb}</span>,
            <StatusBadge key="c" tone="info">{q.cause}</StatusBadge>,
            <span key="cmd" className="text-brand">{q.cmd}</span>,
            q.action,
            <StatusBadge key="s" tone={q.statut[0]}>{q.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
