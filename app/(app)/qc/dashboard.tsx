"use client";

import { useMemo } from "react";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { calculerDashboard, FAMILLES_DEFAUT, type InspectionBilan } from "@/lib/domain/qc";
import type { InspectionRow } from "@/lib/services/qc";

const nb = new Intl.NumberFormat("fr-FR");
const moisFr = (p: string) => {
  if (!/^\d{4}-\d{2}$/.test(p)) return p;
  const [a, m] = p.split("-");
  const noms = ["janv.", "févr.", "mars", "avr.", "mai", "juin", "juil.", "août", "sept.", "oct.", "nov.", "déc."];
  return `${noms[Number(m) - 1]} ${a}`;
};

/* Tableau de bord qualité — tout est dérivé des inspections clôturées.
 *
 * Volontairement sans dépendance graphique : le Pareto et la courbe sont des
 * barres CSS. C'est lisible, imprimable, et ça n'ajoute aucune bibliothèque. */
export function DashboardQualite({ inspections }: { inspections: InspectionRow[] }) {
  const d = useMemo(
    () => calculerDashboard(inspections as unknown as InspectionBilan[], FAMILLES_DEFAUT),
    [inspections],
  );

  if (d.controles === 0) {
    return (
      <SectionPanel title="Tableau de bord qualité">
        <div className="py-10 text-center text-sm text-muted-foreground">
          Aucune inspection clôturée pour l&apos;instant. Les statistiques apparaîtront dès les premiers contrôles
          terminés.
        </div>
      </SectionPanel>
    );
  }

  const paretoMax = d.pareto[0]?.nombre ?? 1;

  return (
    <div className="space-y-4">
      {/* KPI principaux */}
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Taux de conformité" valeur={d.tauxConformite === null ? "—" : `${d.tauxConformite} %`} tone={d.tauxConformite !== null && d.tauxConformite >= 90 ? "success" : d.tauxConformite !== null && d.tauxConformite >= 75 ? "warning" : "danger"} gros />
        <Kpi label="Contrôles clôturés" valeur={nb.format(d.controles)} />
        <Kpi label="Pièces contrôlées" valeur={nb.format(d.piecesControlees)} />
        <Kpi label="Lots refusés" valeur={nb.format(d.refuses)} tone={d.refuses ? "danger" : "success"} />
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-3">
        <Kpi label="PASS (acceptés)" valeur={nb.format(d.acceptes)} tone="success" />
        <Kpi label="Sous réserve" valeur={nb.format(d.reserves)} tone="warning" />
        <Kpi label="FAIL (refusés)" valeur={nb.format(d.refuses)} tone={d.refuses ? "danger" : "neutral"} />
        <Kpi label="Défauts (total)" valeur={nb.format(d.defautsTotal)} />
        <Kpi
          label="Actions correctives ouvertes"
          valeur={nb.format(d.actionsOuvertes)}
          tone={d.actionsOuvertes ? "warning" : "success"}
        />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Critiques" valeur={nb.format(d.critiques)} tone={d.critiques ? "danger" : "success"} />
        <Kpi label="Majeurs" valeur={nb.format(d.majeurs)} tone={d.majeurs ? "warning" : "success"} />
        <Kpi label="Mineurs" valeur={nb.format(d.mineurs)} tone="neutral" />
      </div>

      {/* Pareto des défauts */}
      <SectionPanel title="Pareto des défauts par catégorie">
        {d.pareto.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Aucun défaut relevé.</div>
        ) : (
          <div className="space-y-1.5">
            {d.pareto.map((l) => (
              <div key={l.famille} className="flex items-center gap-2 text-xs">
                <div className="w-40 shrink-0 truncate text-right font-medium">{l.famille}</div>
                <div className="relative h-5 flex-1 overflow-hidden rounded bg-muted">
                  <div
                    className="absolute inset-y-0 left-0 rounded bg-brand/70"
                    style={{ width: `${Math.max(4, (l.nombre / paretoMax) * 100)}%` }}
                  />
                </div>
                <div className="w-24 shrink-0 tabular-nums text-muted-foreground">
                  <b className="text-foreground">{nb.format(l.nombre)}</b> · {l.pct}%
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Références les plus problématiques */}
        <SectionPanel title="Références présentant le plus de défauts" flush>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Modèle</th>
                <th className="px-3 py-2 text-center">Contrôles</th>
                <th className="px-3 py-2 text-center">Refusés</th>
                <th className="px-3 py-2 text-center">Défauts</th>
              </tr>
            </thead>
            <tbody>
              {d.refsFaibles.map((r) => (
                <tr key={r.cle} className="border-b">
                  <td className="px-3 py-1.5 font-semibold">{r.modele}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{r.controles}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">
                    {r.refuses > 0 ? <b className="text-[var(--danger-d)]">{r.refuses}</b> : "—"}
                  </td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{r.defauts || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>

        {/* Par client */}
        <SectionPanel title="Qualité par client" flush>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-center">Contrôles</th>
                <th className="px-3 py-2 text-center">Conformité</th>
                <th className="px-3 py-2 text-center">Défauts</th>
              </tr>
            </thead>
            <tbody>
              {d.parClient.map((c) => (
                <tr key={c.client} className="border-b">
                  <td className="px-3 py-1.5 font-semibold">{c.client}</td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{c.controles}</td>
                  <td className="px-3 py-1.5 text-center">
                    {c.taux === null ? (
                      "—"
                    ) : (
                      <StatusBadge tone={c.taux >= 90 ? "success" : c.taux >= 75 ? "warning" : "danger"}>
                        {c.taux}%
                      </StatusBadge>
                    )}
                  </td>
                  <td className="px-3 py-1.5 text-center tabular-nums">{c.defauts || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>
      </div>

      {/* Évolution mensuelle */}
      <SectionPanel title="Évolution du taux de conformité par mois">
        {d.parMois.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Pas encore d&apos;historique.</div>
        ) : (
          <div className="flex items-end gap-2 overflow-x-auto pb-1">
            {d.parMois.map((m) => (
              <div key={m.periode} className="flex min-w-[52px] flex-1 flex-col items-center gap-1">
                <div className="text-[10px] font-bold tabular-nums">{m.taux === null ? "—" : `${m.taux}%`}</div>
                <div className="flex h-28 w-full items-end">
                  <div
                    className={`w-full rounded-t ${
                      m.taux === null ? "bg-muted" : m.taux >= 90 ? "bg-green-500/70" : m.taux >= 75 ? "bg-amber-500/70" : "bg-red-500/70"
                    }`}
                    style={{ height: `${Math.max(4, m.taux ?? 0)}%` }}
                  />
                </div>
                <div className="text-[9.5px] text-muted-foreground">{moisFr(m.periode)}</div>
                <div className="text-[9.5px] tabular-nums text-muted-foreground">{m.controles} ct</div>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function Kpi({
  label,
  valeur,
  tone = "neutral",
  gros,
}: {
  label: string;
  valeur: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
  gros?: boolean;
}) {
  const cls = {
    neutral: "text-foreground",
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    danger: "text-[var(--danger-d)]",
  }[tone];
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${gros ? "text-3xl" : "text-2xl"} font-extrabold tabular-nums ${cls}`}>{valeur}</div>
    </div>
  );
}
