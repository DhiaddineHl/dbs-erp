import { Package, Euro, BarChart3, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { EditableTable } from "@/components/shared/editable-table";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { COMMANDE_FIELDS } from "@/lib/modules/forms";
import { COMMANDE_COLUMNS } from "@/lib/modules/columns";
import { commandeEdit } from "@/lib/modules/edit-columns";
import { listCommandes, listClients, listFaconniers } from "@/lib/services/modules";
import { getChaines } from "@/lib/services/gpao";
import { createCommande, importCommandes } from "@/lib/actions/modules";

export default async function CommandesPage() {
  const [CMDS, clients, faconniers, chaines] = await Promise.all([
    listCommandes(),
    listClients(),
    listFaconniers(),
    getChaines(),
  ]);

  const clientChoices = clients.map((c) => ({ value: c.nom, label: `${c.code} — ${c.nom}` }));
  const faconnierChoices = [
    ...faconniers.map((f) => ({ value: f.nom, label: f.nom })),
    { value: "DBS", label: "DBS (interne)" },
  ];
  const chaineChoices = chaines.map((c) => ({ value: String(c.id), label: c.nom }));

  const csvRows = CMDS.map((c) => ({
    of: c.of, modele: c.modele, client: c.client, assigne: c.assigne, qte: c.qte,
    pv: c.pv, pf: c.pf, marge: c.marge, export: c.export, retard: c.retard[1], av: c.av, statut: c.statut[1],
  }));
  return (
    <>
      <PageHeader
        icon={Package}
        title="Commandes"
        description="Cycle complet : prix, marge, tailles, N° OF auto, liaison chaîne"
        actions={
          <>
            <ExportCsvButton rows={csvRows} columns={COMMANDE_COLUMNS} filename="commandes" />
            <ImportButton action={importCommandes} label="Importer (CSV/Excel)" />
            <EntityFormDialog
              triggerLabel="Nouvelle commande"
              title="Nouvelle commande"
              fields={COMMANDE_FIELDS}
              dynamicOptions={{
                client: clientChoices,
                faconnier: faconnierChoices,
                chaineId: chaineChoices,
              }}
              action={createCommande}
              successMessage="Commande créée"
            />
          </>
        }
      />

      <KpiGrid>
        <KpiCard label="Commandes actives" value="12" icon={Package} tone="brand" />
        <KpiCard label="CA en cours" value="248 600 €" icon={Euro} tone="success" />
        <KpiCard label="Marge brute" value="61 200 €" icon={BarChart3} tone="purple" sub={<StatusBadge tone="success">25%</StatusBadge>} />
        <KpiCard label="En retard" value="2" icon={TriangleAlert} tone="danger" />
      </KpiGrid>

      <SectionPanel title="Carnet de commandes" actions={<StatusBadge tone="brand">{CMDS.length}</StatusBadge>} flush>
        <EditableTable
          entity="commande"
          columns={commandeEdit({ clients: clientChoices, faconniers: faconnierChoices, chaines: chaineChoices })}
          rows={CMDS}
          searchPlaceholder="Rechercher OF, modèle, client…"
        />
      </SectionPanel>
    </>
  );
}
