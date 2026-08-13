"use client";

import { Fragment, useMemo, useState } from "react";
import { CalendarClock } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { STATUTS_LOGISTIQUE, URGENCES_EXPORT, libelleMoisExport, type StatutLogistique } from "@/lib/domain/aval";
import type { LignePrevision } from "@/lib/services/aval";
import * as A from "@/lib/actions/aval";
import { DateAction, Kpi, SelectAction, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

const OPTIONS_LOG = (Object.keys(STATUTS_LOGISTIQUE) as StatutLogistique[]).map((k) => ({
  value: k,
  label: STATUTS_LOGISTIQUE[k].label,
}));

export function PrevExportClient({
  lignes,
  peutSaisir,
}: {
  lignes: LignePrevision[];
  peutSaisir: boolean;
}) {
  const [q, setQ] = useState("");
  const [urgence, setUrgence] = useState("");
  const [masquerExpediees, setMasquer] = useState(true);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return lignes.filter(
      (l) =>
        (!masquerExpediees || !l.magasinExpedie) &&
        (!urgence || l.urgence === urgence) &&
        (!n || `${l.of} ${l.modele} ${l.client} ${l.source}`.toLowerCase().includes(n)),
    );
  }, [lignes, q, urgence, masquerExpediees]);

  // Regroupement par mois d'export : c'est la maille de décision du planning.
  const groupes = useMemo(() => {
    const m = new Map<string, LignePrevision[]>();
    for (const l of filtrees) {
      const cle = l.datePlan.slice(0, 7);
      const g = m.get(cle);
      if (g) g.push(l);
      else m.set(cle, [l]);
    }
    return [...m.entries()].sort(([a], [b]) => (a || "9999").localeCompare(b || "9999"));
  }, [filtrees]);

  const stats = useMemo(() => {
    const actives = lignes.filter((l) => !l.magasinExpedie);
    return {
      aExporter: actives.length,
      depasse: actives.filter((l) => l.urgence === "depasse").length,
      imminent: actives.filter((l) => l.urgence === "imminent").length,
      pieces: actives.reduce((s, l) => s + Math.max(0, l.qte - l.magasinQte), 0),
    };
  }, [lignes]);

  return (
    <>
      <PageHeader
        icon={CalendarClock}
        title="Prévision export"
        description="Échéancier des exports — dates prévisionnelles et statut logistique"
      />

      <Tuiles>
        <Kpi label="À exporter" valeur={String(stats.aExporter)} />
        <Kpi label="Dates dépassées" valeur={String(stats.depasse)} tone={stats.depasse ? "danger" : "neutral"} />
        <Kpi label="Sous 7 jours" valeur={String(stats.imminent)} tone="warning" />
        <Kpi label="Pièces à finir" valeur={nb.format(stats.pieces)} tone="brand" sub="hors stock magasin" />
      </Tuiles>

      <SectionPanel
        title="Échéancier"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <input type="checkbox" checked={masquerExpediees} onChange={(e) => setMasquer(e.target.checked)} />
              Masquer les expédiées
            </label>
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="OF, modèle, client…"
              className="h-8 w-52 bg-card"
            />
            <select
              value={urgence}
              onChange={(e) => setUrgence(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="">Toutes urgences</option>
              {Object.entries(URGENCES_EXPORT).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
          </div>
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">OF</th>
                <th className="px-3 py-2 text-left">Modèle / Client</th>
                <th className="px-3 py-2 text-left">Production</th>
                <th className="px-3 py-2 text-right">Qté</th>
                <th className="px-3 py-2 text-right">Prêt</th>
                <th className="px-3 py-2 text-left">Export contractuel</th>
                <th className="px-3 py-2 text-left">Prévision</th>
                <th className="px-3 py-2 text-right">Reste</th>
                <th className="px-3 py-2 text-left">Urgence</th>
                <th className="px-3 py-2 text-left">Statut logistique</th>
              </tr>
            </thead>
            <tbody>
              {groupes.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    Aucune commande à exporter.
                  </td>
                </tr>
              ) : (
                groupes.map(([mois, lot]) => (
                  <Fragment key={mois || "sansdate"}>
                    <tr className="border-b bg-muted/60">
                      <td colSpan={10} className="px-3 py-1.5 text-[11px] font-bold uppercase tracking-wide">
                        {libelleMoisExport(mois)} — {lot.length} commande(s) ·{" "}
                        {nb.format(lot.reduce((s, l) => s + l.qte, 0))} pcs ·{" "}
                        {eur.format(lot.reduce((s, l) => s + l.ca, 0))} €
                      </td>
                    </tr>
                    {lot.map((l) => {
                      const u = URGENCES_EXPORT[l.urgence];
                      return (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="px-3 py-2 font-bold text-brand">{l.of}</td>
                          <td className="px-3 py-2">
                            <b>{l.modele}</b>
                            <div className="text-[10px] text-muted-foreground">{l.client}</div>
                          </td>
                          <td className="px-3 py-2 text-muted-foreground">{l.source}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nb.format(l.qte)}</td>
                          <td className="px-3 py-2 text-right tabular-nums">{nb.format(l.magasinQte)}</td>
                          <td className="px-3 py-2 tabular-nums text-muted-foreground">
                            {l.dateExport ? l.dateExport.split("-").reverse().join("/") : "—"}
                          </td>
                          <td className="px-3 py-2">
                            {peutSaisir ? (
                              <DateAction valeur={l.exportPrev} onSave={(v) => A.majPrevisionExport(l.id, v)} />
                            ) : l.exportPrev ? (
                              l.exportPrev.split("-").reverse().join("/")
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-3 py-2 text-right tabular-nums">
                            {l.joursRestants == null ? (
                              "—"
                            ) : l.joursRestants < 0 ? (
                              <b className="text-[var(--danger-d)]">{l.joursRestants} j</b>
                            ) : (
                              `${l.joursRestants} j`
                            )}
                          </td>
                          <td className="px-3 py-2">
                            <StatusBadge tone={u.tone}>{u.label}</StatusBadge>
                          </td>
                          <td className="px-3 py-2">
                            {peutSaisir ? (
                              <SelectAction
                                valeur={l.statutLog}
                                options={OPTIONS_LOG}
                                onSave={(v) => A.majStatutLogistique(l.id, v)}
                              />
                            ) : (
                              <StatusBadge tone={STATUTS_LOGISTIQUE[l.statutLog as StatutLogistique]?.tone ?? "neutral"}>
                                {STATUTS_LOGISTIQUE[l.statutLog as StatutLogistique]?.label ?? l.statutLog}
                              </StatusBadge>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </>
  );
}
