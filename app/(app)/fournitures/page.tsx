import { Boxes, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { FOURNITURE_FIELDS } from "@/lib/modules/forms";
import { listFournitures } from "@/lib/services/modules";
import { createFourniture } from "@/lib/actions/modules";

export default async function FournituresPage() {
  const FOURNITURES = await listFournitures();
  return (
    <>
      <PageHeader
        icon={Boxes}
        title="Fournitures reçues"
        description="Boutons, fermetures, étiquettes, doublures, fils…"
        actions={
          <EntityFormDialog
            triggerLabel="Réception fourniture"
            title="Réception fourniture"
            fields={FOURNITURE_FIELDS}
            action={createFourniture}
            successMessage="Réception enregistrée"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="En attente" value="2" icon={Clock} tone="warning" />
        <KpiCard label="Libérées" value="8" icon={CheckCircle2} tone="success" />
        <KpiCard label="Enregistrements" value="10" icon={Boxes} tone="brand" />
      </KpiGrid>

      <SectionPanel title="Réceptions fournitures" actions={<StatusBadge tone="brand">{FOURNITURES.length}</StatusBadge>} flush>
        <DataTable
          columns={["Date", "Commande", "Type", "Désignation", "Qté", "Contrôle", "Statut"]}
          rows={FOURNITURES.map((f) => [
            f.date,
            <span key="c" className="font-semibold text-brand">{f.cmd}</span>,
            <StatusBadge key="t" tone="info">{f.type}</StatusBadge>,
            f.design,
            <span key="q" className="tabular-nums">{f.qte}</span>,
            <StatusBadge key="ct" tone={f.controle[0]}>{f.controle[1]}</StatusBadge>,
            <StatusBadge key="s" tone={f.statut[0]}>{f.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
