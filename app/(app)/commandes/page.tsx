import { Package, Euro, BarChart3, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { DataTable } from "@/components/shared/data-table";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { EntityFormDialog } from "@/components/shared/entity-form-dialog";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { COMMANDE_FIELDS } from "@/lib/modules/forms";
import { COMMANDE_COLUMNS } from "@/lib/modules/columns";
import { listCommandes } from "@/lib/services/modules";
import { createCommande, importCommandes } from "@/lib/actions/modules";

export default async function CommandesPage() {
  const CMDS = await listCommandes();
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

      <div className="mb-3">
        <Input placeholder="Rechercher OF, modèle, client…" className="h-9 w-72 bg-card" />
      </div>

      <SectionPanel title="Carnet de commandes" actions={<StatusBadge tone="brand">{CMDS.length}</StatusBadge>} flush>
        <DataTable
          columns={["N° OF", "Modèle", "Client", "Assigné", "Qté", "P. vente", "P. façon", "Marge", "Export", "Retard", "Avancement", "Statut"]}
          rows={CMDS.map((c) => [
            <span key="of" className="font-bold text-brand">{c.of}</span>,
            <span key="m" className="font-semibold">{c.modele}</span>,
            c.client,
            c.assigne,
            <span key="q" className="tabular-nums">{c.qte.toLocaleString("fr-FR")}</span>,
            <span key="pv" className="tabular-nums">{c.pv}</span>,
            <span key="pf" className="tabular-nums">{c.pf}</span>,
            <span key="mg" className="font-semibold tabular-nums text-success-foreground">{c.marge}</span>,
            c.export,
            <StatusBadge key="r" tone={c.retard[0]}>{c.retard[1]}</StatusBadge>,
            <div key="av" className="flex w-28 items-center gap-2">
              <Progress value={c.av} className="h-1.5" />
              <span className="w-8 text-right text-[11px] tabular-nums">{c.av}%</span>
            </div>,
            <StatusBadge key="s" tone={c.statut[0]}>{c.statut[1]}</StatusBadge>,
          ])}
        />
      </SectionPanel>
    </>
  );
}
