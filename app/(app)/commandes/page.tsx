import { Package, Euro, BarChart3, TriangleAlert } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { StatusBadge } from "@/components/shared/status-badge";
import { ExportCsvButton } from "@/components/shared/export-csv-button";
import { ImportButton } from "@/components/shared/import-button";
import { GabaritButton } from "@/components/shared/gabarit-button";
import { COMMANDE_COLUMNS } from "@/lib/modules/columns";
import { listCommandes, listClients, listFaconniers } from "@/lib/services/commandes";
import { getChaines } from "@/lib/services/gpao";
import { importCommandes, peutSupprimerCommandes } from "@/lib/actions/commandes";
import { peutFacturer } from "@/lib/actions/facturation-commande";
import { CommandesClient } from "./commandes-client";
import { NouvelleCommande } from "./nouvelle-commande";

const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const money = (n: number) => `${eur.format(Math.round(n))} €`;

/* Gabarit d'import : uniquement les colonnes réellement lues.
 *
 * Marge, retard, avancement et statut sont déduits — les proposer dans le
 * gabarit laisserait croire qu'on peut les imposer. Le n° OF peut rester vide,
 * la numérotation prend alors la suite ; « Modèle » et « Client » sont les
 * deux seules colonnes obligatoires. */
const GABARIT_ENTETES = [
  "N° OF", "Modèle", "Référence", "Couleur", "Saison", "Client",
  "Façonnier", "Qté", "Produit", "P. vente", "P. façon", "Export",
];
const GABARIT_EXEMPLES = [
  ["", "CHEMISE LIN", "REF-1042", "Blanc", "PE26", "PATRICK CONFECTION", "ATELIER SUD", "1200", "0", "18,50", "6,20", "15/09/2026"],
  ["OF-2026-118", "PANTALON CHINO", "REF-2210", "Marine", "PE26", "MODA SRL", "", "800", "150", "24,00", "", "30/09/2026"],
];

export default async function CommandesPage() {
  /* Les archivées sont chargées avec le reste : l'écran sait les masquer, et
   * la case « Inclure les archivées » doit répondre sans aller-retour. */
  const [CMDS, clients, faconniers, chaines, peutSupprimer] = await Promise.all([
    listCommandes({ includeArchived: true }),
    listClients(),
    listFaconniers(),
    getChaines(),
    peutSupprimerCommandes(),
  ]);
  const facturable = await peutFacturer();
  const actives = CMDS.filter((c) => !c.archived);

  /* Les listes déroulantes travaillent au NOM, puisque c'est par le nom que
   * `resolveClientId` rattache. Deux fiches homonymes — il en existe dans la
   * base reprise — ne doivent donc apparaître qu'une fois : les proposer deux
   * fois ne donne aucun choix réel, seulement une ambiguïté. La fusion des
   * doublons se fait dans l'écran Clients. */
  const parNom = <T,>(liste: T[], nom: (x: T) => string, label: (x: T) => string) => [
    ...new Map(liste.map((x) => [nom(x), { value: nom(x), label: label(x) }])).values(),
  ];

  const clientChoices = parNom(clients, (c) => c.nom, (c) => (c.code ? `${c.code} — ${c.nom}` : c.nom));
  const faconnierChoices = parNom(faconniers, (f) => f.nom, (f) => f.nom);
  const chaineChoices = chaines.map((c) => ({ value: String(c.id), label: c.nom }));

  /* KPIs read the same derived values the table shows — no second source of
   * truth. Les valeurs PROPRES, pas les totaux de ligne : une commande
   * découpée est présente ici avec sa mère ET ses parts, et compter les deux
   * gonflerait le CA de tout ce qui a été réparti. Sur une commande non
   * découpée, le propre est le tout — le chiffre ne bouge donc pas. */
  const caEnCours = actives.reduce((s, c) => s + c.caPropre, 0);
  const margeBrute = actives.reduce((s, c) => s + c.margePropre, 0);
  const margePct = caEnCours > 0 ? Math.round((margeBrute / caEnCours) * 100) : 0;
  const enRetard = actives.filter((c) => c.statutKey === "retard").length;
  /* Le compteur annonce des commandes, pas des lignes : une part n'est pas
   * une commande de plus pour le client. */
  const nbCommandes = actives.filter((c) => c.parentId == null).length;

  /* Le n° de la mère voyage avec la ligne : sans lui, un tableur reçoit des
   * parts qui ressemblent à des commandes entières et le total est faux. */
  const csvRows = actives.map((c) => ({
    of: c.of, parentOf: c.parentOf, modele: c.modele, refArticle: c.refArticle, couleur: c.couleur, saison: c.saison,
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
            <GabaritButton
              nom="gabarit_commandes"
              entetes={GABARIT_ENTETES}
              exemples={GABARIT_EXEMPLES}
              label="Gabarit import"
            />
            <ImportButton action={importCommandes} label="Importer (CSV/Excel)" />
            <NouvelleCommande
              clients={clientChoices}
              faconniers={faconnierChoices}
              chaines={chaineChoices}
            />
          </>
        }
      />

      <KpiGrid>
        <KpiCard
          label="Commandes actives"
          value={String(nbCommandes)}
          icon={Package}
          tone="brand"
          sub={
            actives.length > nbCommandes ? (
              <StatusBadge tone="neutral">{actives.length - nbCommandes} sous-commandes</StatusBadge>
            ) : undefined
          }
        />
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

      <CommandesClient
        commandes={CMDS}
        clients={clientChoices}
        faconniers={faconnierChoices}
        chaines={chaineChoices}
        peutSupprimer={peutSupprimer}
        peutFacturer={facturable}
      />
    </>
  );
}
