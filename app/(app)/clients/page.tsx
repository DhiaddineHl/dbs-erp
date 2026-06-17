import { Building2, Euro, Package } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { CLIENT_FIELDS } from "@/lib/modules/forms";
import { CLIENT_COLUMNS } from "@/lib/modules/columns";
import { CLIENT_EDIT } from "@/lib/modules/edit-columns";
import { listClients } from "@/lib/services/modules";
import { createClient, importClients } from "@/lib/actions/modules";

export default async function ClientsPage() {
  const CLIENTS = await listClients();
  return (
    <>
      <PageHeader
        icon={Building2}
        title="Clients"
        description="Fiches clients réutilisées dans commandes, BL et factures"
        actions={
          <>
            <ExportCsvButton rows={CLIENTS} columns={CLIENT_COLUMNS} filename="clients" />
            <ImportButton action={importClients} label="Importer (CSV/Excel)" />
            <EntityFormDialog
              triggerLabel="Nouveau client"
              title="Nouveau client"
              fields={CLIENT_FIELDS}
              action={createClient}
              successMessage="Client créé"
            />
          </>
        }
      />

      <KpiGrid>
        <KpiCard label="Clients" value="8" icon={Building2} tone="brand" />
        <KpiCard label="CA portefeuille" value="248 600 €" icon={Euro} tone="success" />
        <KpiCard label="Commandes actives" value="12" icon={Package} tone="purple" />
      </KpiGrid>

      <SectionPanel
        title="Répertoire"
        actions={<StatusBadge tone="brand">{CLIENTS.length} clients</StatusBadge>}
        flush
      >
        <EditableTable
          entity="client"
          columns={CLIENT_EDIT}
          rows={CLIENTS}
          searchPlaceholder="Rechercher un client…"
        />
      </SectionPanel>
    </>
  );
}
