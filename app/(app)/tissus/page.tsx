import { Layers, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { TISSU_FIELDS } from "@/lib/modules/forms";
import { tissuEdit } from "@/lib/modules/edit-columns";
import { listTissus, listCommandes } from "@/lib/services/modules";
import { createTissu } from "@/lib/actions/modules";

export default async function TissusPage() {
  const [TISSUS, commandes] = await Promise.all([listTissus(), listCommandes()]);
  const cmdChoices = commandes.map((c) => ({ value: c.of, label: `${c.of} · ${c.modele}` }));
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
            dynamicOptions={{ cmd: cmdChoices }}
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
        <EditableTable entity="tissu" columns={tissuEdit(cmdChoices)} rows={TISSUS} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
