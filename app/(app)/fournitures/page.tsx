import { Boxes, Clock, CheckCircle2 } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { FOURNITURE_FIELDS } from "@/lib/modules/forms";
import { fournitureEdit } from "@/lib/modules/edit-columns";
import { listFournitures, listCommandes } from "@/lib/services/modules";
import { createFourniture } from "@/lib/actions/modules";

export default async function FournituresPage() {
  const [FOURNITURES, commandes] = await Promise.all([listFournitures(), listCommandes()]);
  const cmdChoices = commandes.map((c) => ({ value: c.of, label: `${c.of} · ${c.modele}` }));
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
            dynamicOptions={{ cmd: cmdChoices }}
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
        <EditableTable entity="fourniture" columns={fournitureEdit(cmdChoices)} rows={FOURNITURES} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
