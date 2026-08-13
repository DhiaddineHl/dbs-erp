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
import { listCommandes, listClients, listFaconniers } from "@/lib/services/commandes";
import { getChaines } from "@/lib/services/gpao";
import { createCommande, importCommandes } from "@/lib/actions/commandes";

const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (n: number) => `${eur.format(Math.round(n))} €`;

export default async function CommandesPage() {
  const [CMDS, clients, faconniers, chaines] = await Promise.all([
    listCommandes(),
    listClients(),
    listFaconniers(),
    getChaines(),
  ]);

  const clientChoices = clients.map((c) => ({ value: c.nom, label: `${c.code || "—"} — ${c.nom}` }));
  const faconnierChoices = faconniers.map((f) => ({ value: f.nom, label: f.nom }));
  const chaineChoices = chaines.map((c) => ({ value: String(c.id), label: c.nom }));

  // KPIs read the same derived values the table shows — no second source of truth.
  const caEnCours = CMDS.reduce((s, c) => s + c.ca, 0);
  const margeBrute = CMDS.reduce((s, c) => s + c.margeTotale, 0);
  const margePct = caEnCours > 0 ? Math.round((margeBrute / caEnCours) * 100) : 0;
  const enRetard = CMDS.filter((c) => c.statutKey === "retard").length;

  const csvRows = CMDS.map((c) => ({
    of: c.of, modele: c.modele, refArticle: c.refArticle, couleur: c.couleur, saison: c.saison,
    client: c.client, faconnier: c.faconnier, qte: c.qte, produit: c.produit,
    prixVente: c.prixVente ?? "", prixFacon: c.prixFacon ?? "", margeTotale: Math.round(c.margeTotale),
    dateExport: c.dateExport, retard: c.retard[1], av: c.av, statut: c.statut[1],
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
        <KpiCard label="Commandes actives" value={String(CMDS.length)} icon={Package} tone="brand" />
        <KpiCard label="CA en cours" value={money(caEnCours)} icon={Euro} tone="success" />
        <KpiCard
          label="Marge brute"
          value={money(margeBrute)}
          icon={BarChart3}
          tone="purple"
          sub={<StatusBadge tone={margePct >= 20 ? "success" : "warning"}>{margePct}%</StatusBadge>}
        />
        <KpiCard label="En retard" value={String(enRetard)} icon={TriangleAlert} tone="danger" />
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
