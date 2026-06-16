import {
  AlertCircle,
  TriangleAlert,
  Bell,
  Clock,
  Euro,
  Layers,
  PencilRuler,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { listAlertes } from "@/lib/services/modules";

const ICONS: Record<string, LucideIcon> = { AlertCircle, TriangleAlert, Clock, Euro, Layers, PencilRuler };

export default async function AlertesPage() {
  const ALERTS = await listAlertes();
  return (
    <>
      <PageHeader
        icon={AlertCircle}
        title="Alertes"
        description="Détection automatique : retards, matières, marges, OK PRO, qualité"
      />

      <KpiGrid>
        <KpiCard label="Alertes totales" value="4" icon={Bell} tone="brand" />
        <KpiCard label="Critiques" value="2" icon={TriangleAlert} tone="danger" />
        <KpiCard label="Avertissements" value="2" icon={AlertCircle} tone="warning" />
      </KpiGrid>

      <SectionPanel title="Anomalies détectées" flush>
        <div className="divide-y">
          {ALERTS.map((a, i) => {
            const Icon = ICONS[a.iconName] ?? AlertCircle;
            return (
              <div key={i} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={
                    a.tone === "danger"
                      ? "flex size-9 items-center justify-center rounded-lg bg-[var(--danger-l)] text-[var(--danger-d)]"
                      : "flex size-9 items-center justify-center rounded-lg bg-warning-muted text-warning-foreground"
                  }
                >
                  <Icon className="size-4" />
                </span>
                <div className="flex-1">
                  <div className="text-[13px] font-semibold">{a.title}</div>
                  <div className="text-[11px] text-muted-foreground">{a.detail}</div>
                </div>
                <StatusBadge tone={a.level[0]}>{a.level[1]}</StatusBadge>
                <Button variant="outline" size="sm">Traiter</Button>
              </div>
            );
          })}
        </div>
      </SectionPanel>
    </>
  );
}
