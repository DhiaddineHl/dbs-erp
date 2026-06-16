import { Handshake, Boxes, Layers } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { FACONNIER_FIELDS } from "@/lib/modules/forms";
import { listFaconniers } from "@/lib/services/modules";
import { createFaconnier } from "@/lib/actions/modules";

export default async function FaconPage() {
  const FACONNIERS = await listFaconniers();
  return (
    <>
      <PageHeader
        icon={Handshake}
        title="Façonniers"
        description="Référentiel de vos sous-traitants — créez-les ici dès le départ, comme vos clients"
        actions={
          <EntityFormDialog
            triggerLabel="Nouveau façonnier"
            title="Nouveau façonnier"
            fields={FACONNIER_FIELDS}
            action={createFaconnier}
            successMessage="Façonnier créé"
          />
        }
      />

      <KpiGrid>
        <KpiCard label="Façonniers" value="3" icon={Handshake} tone="brand" />
        <KpiCard label="Cmd en sous-traitance" value="6" icon={Boxes} tone="purple" />
        <KpiCard label="Charge totale" value="5 100 pcs" icon={Layers} tone="warning" />
      </KpiGrid>

      <SectionPanel title="Référentiel façonniers" actions={<StatusBadge tone="brand">{FACONNIERS.length}</StatusBadge>} flush>
        <DataTable
          columns={["Nom", "Spécialité", "Contact", "Tél", "Prix façon réf.", "Cmd actives", "Charge (pcs)"]}
          rows={FACONNIERS.map((f) => [
            <span key="n" className="font-semibold">{f.nom}</span>,
            f.spec,
            f.contact,
            <span key="t" className="tabular-nums">{f.tel}</span>,
            <span key="p" className="font-semibold tabular-nums">{f.prix}</span>,
            <span key="c" className="font-semibold">{f.cmd}</span>,
            <span key="ch" className="tabular-nums">{f.charge.toLocaleString("fr-FR")}</span>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
