import { Building2, Euro, Package, Pencil, X } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { CLIENT_FIELDS } from "@/lib/modules/forms";
import { CLIENT_COLUMNS } from "@/lib/modules/columns";
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

      <div className="mb-3">
        <Input placeholder="Rechercher…" className="h-9 w-60 bg-card" />
      </div>

      <SectionPanel
        title="Répertoire"
        actions={<StatusBadge tone="brand">{CLIENTS.length} clients</StatusBadge>}
        flush
      >
        <DataTable
          columns={[
            "Code",
            "Raison sociale",
            "Contact",
            "Email",
            "Ville",
            "Commandes",
            "CA total",
            { label: "", className: "text-right" },
          ]}
          rows={CLIENTS.map((c) => [
            <span key="c" className="font-bold text-brand">{c.code}</span>,
            <span key="n" className="font-semibold">{c.nom}</span>,
            c.contact,
            <a key="e" href={`mailto:${c.email}`} className="text-brand hover:underline">{c.email}</a>,
            c.ville,
            <span key="cm" className="font-semibold">{c.cmd}</span>,
            <span key="ca" className="font-semibold text-success-foreground">{c.ca}</span>,
            <div key="a" className="flex justify-end gap-1">
              <Button variant="ghost" size="icon-xs"><Pencil /></Button>
              <Button variant="destructive" size="icon-xs"><X /></Button>
            </div>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
