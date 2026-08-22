import { CalendarDays, Package, Scissors, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import type { Column } from "@/lib/modules/columns";
import { listCommandes, listClients, listFaconniers } from "@/lib/services/commandes";
import { getChaines } from "@/lib/services/gpao";
import { peutSupprimerCommandes } from "@/lib/actions/commandes";
import { CommandesClient } from "../commandes/commandes-client";

const nb = new Intl.NumberFormat("fr-FR");

/* Export du planning : aucune colonne d'argent, et la réception tissu en plus —
 * c'est une date que le planning tient et que le carnet n'affiche pas. Le
 * fichier peut donc circuler à l'atelier tel quel. */
const COLONNES_CSV: Column[] = [
  { key: "of", label: "N° OF" },
  { key: "modele", label: "Modèle" },
  { key: "refArticle", label: "Référence" },
  { key: "couleur", label: "Couleur" },
  { key: "saison", label: "Saison" },
  { key: "client", label: "Client" },
  { key: "faconnier", label: "Façonnier" },
  { key: "qte", label: "Qté" },
  { key: "produit", label: "Produit" },
  { key: "receptTissu", label: "Réception tissu" },
  { key: "dateExport", label: "Export" },
  { key: "retard", label: "Retard" },
  { key: "av", label: "Avancement" },
  { key: "statut", label: "Statut" },
];

/* Planning général — le carnet de commandes vu par le planning.
 *
 * Ce sont les mêmes lignes, lues et écrites au même endroit : ce que le
 * planning déplace ici apparaît dans Commandes, et ce que le commercial change
 * là-bas apparaît ici. La différence n'est pas la donnée, c'est le périmètre —
 * prix, marge et facturation restent dans Commandes, parce que poser une date
 * d'export ou affecter un façonnier n'exige pas de connaître le prix de vente.
 *
 * L'écran ne crée pas de commandes et n'en importe pas : le planning ajuste ce
 * qui existe. La création reste au carnet. */
export default async function PlanningPage() {
  const [CMDS, clients, faconniers, chaines, peutSupprimer] = await Promise.all([
    listCommandes({ includeArchived: true }),
    listClients(),
    listFaconniers(),
    getChaines(),
    peutSupprimerCommandes(),
  ]);
  const actives = CMDS.filter((c) => !c.archived);

  const parNom = <T,>(liste: T[], nom: (x: T) => string, label: (x: T) => string) => [
    ...new Map(liste.map((x) => [nom(x), { value: nom(x), label: label(x) }])).values(),
  ];

  const clientChoices = parNom(clients, (c) => c.nom, (c) => (c.code ? `${c.code} — ${c.nom}` : c.nom));
  const faconnierChoices = parNom(faconniers, (f) => f.nom, (f) => f.nom);
  const chaineChoices = chaines.map((c) => ({ value: String(c.id), label: c.nom }));

  /* Les indicateurs du planning comptent des pièces et des retards, jamais des
   * euros — même règle que les colonnes. */
  const pieces = actives.reduce((s, c) => s + (c.qte || 0), 0);
  const resteAProduire = actives.reduce((s, c) => s + Math.max(0, (c.qte || 0) - (c.produit || 0)), 0);
  const enRetard = actives.filter((c) => c.statutKey === "retard").length;
  const nonAssignees = actives.filter((c) => !c.chaineId && !c.faconnier).length;

  const csvRows = actives.map((c) => ({
    of: c.of, modele: c.modele, refArticle: c.refArticle, couleur: c.couleur, saison: c.saison,
    client: c.client, faconnier: c.faconnier, qte: c.qte, produit: c.produit,
    receptTissu: c.receptTissu, dateExport: c.dateExport, retard: c.retard[1],
    av: c.av, statut: c.statut[1],
  }));

  return (
    <>
      <PageHeader
        icon={CalendarDays}
        title="Planning général"
        description="Affectation des façonniers, réception tissu et dates d'export — sur les commandes du carnet"
        actions={<ExportCsvButton rows={csvRows} columns={COLONNES_CSV} filename="planning" />}
      />

      <KpiGrid>
        <KpiCard label="Commandes actives" value={String(actives.length)} icon={Package} tone="brand" />
        <KpiCard
          label="Total pièces"
          value={nb.format(pieces)}
          icon={Scissors}
          tone="purple"
          sub={`reste ${nb.format(resteAProduire)} à produire`}
        />
        <KpiCard label="Non assignées" value={String(nonAssignees)} icon={CalendarDays} tone="warning" />
        <KpiCard label="En retard" value={String(enRetard)} icon={TriangleAlert} tone="danger" />
      </KpiGrid>

      <CommandesClient
        mode="planning"
        commandes={CMDS}
        clients={clientChoices}
        faconniers={faconnierChoices}
        chaines={chaineChoices}
        peutSupprimer={peutSupprimer}
        peutFacturer={false}
      />
    </>
  );
}
