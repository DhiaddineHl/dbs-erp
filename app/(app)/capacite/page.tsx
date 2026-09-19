import { BarChart3, Factory, Wallet, Gauge } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { EditableTable } from "@/components/shared/editable-table";
import { CAPACITE_EDIT, COSTING_EDIT } from "@/lib/modules/edit-columns";
import { listCapaciteChaines, listCosting } from "@/lib/services/modules";
import { bilanCapaciteAtelier } from "@/lib/services/capacite";

const nb = new Intl.NumberFormat("fr-FR");

export default async function CapacitePage() {
  const [CHAINES, COSTING, cap] = await Promise.all([
    listCapaciteChaines(),
    listCosting(),
    bilanCapaciteAtelier(),
  ]);
  return (
    <>
      <PageHeader
        icon={BarChart3}
        title="Capacité & Costing"
        description="Capacité de ligne, coût main d'œuvre et délais — calculés par le SAM"
      />

      {/* KPI DÉRIVÉS des chaînes, effectifs, SAM et heures (plus aucune valeur
          codée en dur — cf. audit §29). Le coût MO reste à 0 tant que le coût
          horaire n'est pas renseigné dans les paramètres (mo.coutHoraire). */}
      <KpiGrid>
        <KpiCard
          label={`Capacité attendue/j (${cap.rendementReference}%)`}
          value={`${nb.format(cap.capaciteAttendueJour)} pcs`}
          icon={Factory}
          tone="brand"
        />
        <KpiCard label="Coût MO/jour" value={`${nb.format(cap.coutMoJour)} €`} icon={Wallet} tone="purple" />
        <KpiCard
          label="Capacité théorique/j"
          value={`${nb.format(cap.capaciteTheoriqueJour)} pcs`}
          icon={Gauge}
          tone="info"
        />
      </KpiGrid>

      <SectionPanel title="Capacité par chaîne" flush>
        <EditableTable entity="capacite" columns={CAPACITE_EDIT} rows={CHAINES} searchPlaceholder="Rechercher…" />
      </SectionPanel>

      <SectionPanel title="Costing par OF" flush>
        <EditableTable entity="costing" columns={COSTING_EDIT} rows={COSTING} searchPlaceholder="Rechercher…" />
      </SectionPanel>
    </>
  );
}
