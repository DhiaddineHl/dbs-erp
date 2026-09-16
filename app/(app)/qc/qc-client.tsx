"use client";

import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Input } from "@/components/ui/input";
import { VERDICTS } from "@/lib/domain/qc";
import type { BaremeRow, ChecklistRow, InspectionRow } from "@/lib/services/qc";
import * as A from "@/lib/actions/qc";
import { BoutonAction } from "./primitives";
import { Editeur, type CommandeChoix } from "./editeur";
import { Baremes } from "./baremes";
import { DashboardQualite } from "./dashboard";
import { Checklists } from "./checklists";

const nb = new Intl.NumberFormat("fr-FR");

export function QcClient({
  inspections,
  baremes,
  checklists,
  commandes,
  peutSaisir,
}: {
  inspections: InspectionRow[];
  baremes: BaremeRow[];
  checklists: ChecklistRow[];
  commandes: CommandeChoix[];
  peutSaisir: boolean;
}) {
  const [onglet, setOnglet] = useState<"insp" | "dashboard" | "baremes" | "checklists">("insp");
  const [ouverte, setOuverte] = useState<number | null>(null);
  const [q, setQ] = useState("");

  const courante = ouverte !== null ? inspections.find((i) => i.id === ouverte) : null;

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return inspections;
    return inspections.filter((i) =>
      `${i.ref_affichee} ${i.of} ${i.modele} ${i.client} ${i.ref} ${i.faconnier}`.toLowerCase().includes(n),
    );
  }, [inspections, q]);

  const stats = useMemo(() => {
    const clos = inspections.filter((i) => i.statut === "cloture");
    return {
      total: inspections.length,
      brouillons: inspections.length - clos.length,
      refuses: clos.filter((i) => i.verdict === "refuse").length,
      tauxAccept: clos.length
        ? Math.round((clos.filter((i) => i.verdict === "accepte").length / clos.length) * 100)
        : null,
    };
  }, [inspections]);

  if (courante) {
    return (
      <>
        <PageHeader
          icon={ShieldCheck}
          title="Contrôle Qualité PF"
          description="Inspection produit fini — échantillonnage AQL, barèmes clients, verdict"
        />
        <Editeur
          insp={courante}
          baremes={baremes}
          checklists={checklists}
          commandes={commandes}
          toutes={inspections}
          onRetour={() => setOuverte(null)}
          onOuvrir={(id) => setOuverte(id)}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        icon={ShieldCheck}
        title="Contrôle Qualité PF"
        description="Inspection produit fini — échantillonnage AQL, barèmes clients, verdict"
        actions={
          peutSaisir &&
          onglet === "insp" && (
            <BoutonAction
              variant="default"
              onRun={async () => {
                const r = await A.creerInspection();
                if (r.ok && r.data) setOuverte(r.data);
                return r;
              }}
              succes="Inspection créée"
            >
              + Nouvelle inspection
            </BoutonAction>
          )
        }
      />

      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(180px,1fr))] gap-3">
        <Tuile label="Inspections" valeur={stats.total} />
        <Tuile label="Brouillons" valeur={stats.brouillons} tone="warning" />
        <Tuile label="Lots refusés" valeur={stats.refuses} tone={stats.refuses ? "danger" : "success"} />
        <Tuile
          label="Taux d'acceptation"
          valeur={stats.tauxAccept === null ? "—" : `${stats.tauxAccept} %`}
          tone={stats.tauxAccept !== null && stats.tauxAccept >= 90 ? "success" : "warning"}
        />
      </div>

      <div className="mb-3 flex gap-1.5">
        {(
          [
            ["insp", "Inspections"],
            ["dashboard", "Tableau de bord"],
            ["checklists", "Checklists"],
            ["baremes", "Barèmes de mesures"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            onClick={() => setOnglet(k)}
            className={`rounded-full px-3.5 py-1.5 text-xs font-semibold transition-colors ${
              onglet === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"
            }`}
          >
            {l} {k === "baremes" && <span className="opacity-70">{baremes.length}</span>}
          </button>
        ))}
      </div>

      {onglet === "baremes" ? (
        <Baremes baremes={baremes} peutSaisir={peutSaisir} />
      ) : onglet === "checklists" ? (
        <Checklists checklists={checklists} peutSaisir={peutSaisir} />
      ) : onglet === "dashboard" ? (
        <DashboardQualite inspections={inspections} />
      ) : (
        <SectionPanel
          title="Inspections"
          actions={
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="QC, OF, modèle, client…"
              className="h-8 w-60 bg-card"
            />
          }
          flush
        >
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">N°</th>
                  <th className="px-3 py-2 text-left">Date</th>
                  <th className="px-3 py-2 text-left">OF / Client</th>
                  <th className="px-3 py-2 text-left">Modèle</th>
                  <th className="px-3 py-2 text-center">Lot</th>
                  <th className="px-3 py-2 text-center">Échant.</th>
                  <th className="px-3 py-2 text-center">Défauts</th>
                  <th className="px-3 py-2 text-left">Verdict</th>
                  <th className="px-3 py-2 text-left">Contrôleur</th>
                  <th className="w-10" />
                </tr>
              </thead>
              <tbody>
                {filtrees.length === 0 ? (
                  <tr>
                    <td colSpan={10} className="py-10 text-center text-muted-foreground">
                      Aucune inspection.
                    </td>
                  </tr>
                ) : (
                  filtrees.map((i) => {
                    const v = VERDICTS[i.verdict];
                    const clos = i.statut === "cloture";
                    return (
                      <tr
                        key={i.id}
                        className="cursor-pointer border-b hover:bg-accent/50"
                        onClick={() => setOuverte(i.id)}
                      >
                        <td className="px-3 py-2 font-bold text-brand">
                          {i.ref_affichee}
                          {i.recontroleDeId && <div className="text-[10px] font-normal text-purple">re-contrôle</div>}
                        </td>
                        <td className="px-3 py-2">{i.date}</td>
                        <td className="px-3 py-2">
                          <b>{i.of || "—"}</b>
                          <div className="text-[10px] text-muted-foreground">{i.client}</div>
                        </td>
                        <td className="px-3 py-2">
                          <b>{i.modele || "—"}</b>
                          <div className="text-[10px] text-muted-foreground">{i.couleur || i.ref}</div>
                        </td>
                        <td className="px-3 py-2 text-center tabular-nums">{nb.format(i.lot)}</td>
                        <td className="px-3 py-2 text-center tabular-nums font-semibold">{i.plan.n}</td>
                        <td className="px-3 py-2 text-center tabular-nums">
                          {i.totalDefauts > 0 ? (
                            <b className={i.proposition.critiques ? "text-[var(--danger-d)]" : ""}>{i.totalDefauts}</b>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-2">
                          {clos ? (
                            <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
                          ) : (
                            <StatusBadge tone="brand">✏️ Brouillon</StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-2 text-muted-foreground">{i.controleur}</td>
                        <td className="px-3 py-2 text-center" onClick={(e) => e.stopPropagation()}>
                          {peutSaisir && !clos && (
                            <BoutonAction
                              variant="ghost"
                              onRun={() => A.supprimerInspection(i.id)}
                              confirmer="Supprimer cette inspection ?"
                              succes="Inspection supprimée"
                            >
                              ×
                            </BoutonAction>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </SectionPanel>
      )}
    </>
  );
}

function Tuile({
  label,
  valeur,
  tone = "brand",
}: {
  label: string;
  valeur: string | number;
  tone?: "brand" | "warning" | "danger" | "success";
}) {
  const couleur = {
    brand: "text-brand",
    warning: "text-warning-foreground",
    danger: "text-[var(--danger-d)]",
    success: "text-success-foreground",
  }[tone];
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${couleur}`}>{valeur}</div>
    </div>
  );
}
