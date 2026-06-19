import Link from "next/link";
import {
  Target,
  Tv,
  Plus,
  Package,
  Layers,
  PencilRuler,
  Factory,
  Warehouse,
  ChevronRight,
  Euro,
  BarChart3,
  Wallet,
  TriangleAlert,
  Bot,
  TrendingUp,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getCockpitData } from "@/lib/services/dashboard";

const STAGE_META = [
  { key: "commandes", n: "1 · Commandes", icon: Package, lbl: "en cours", href: "/commandes", color: "var(--s1)" },
  { key: "matieres", n: "2 · Matières", icon: Layers, lbl: "à contrôler", href: "/tissus", color: "var(--s2)" },
  { key: "prepa", n: "3 · Préparation", icon: PencilRuler, lbl: "sans OK PRO", href: "/be", color: "var(--s3)" },
  { key: "production", n: "4 · Production", icon: Factory, lbl: "en fabrication", href: "/gpao_prod", color: "var(--s4)" },
  { key: "magasin", n: "5 · Magasin", icon: Warehouse, lbl: "à expédier", href: "/magasin", color: "var(--s5)" },
] as const;

const TONE_TEXT: Record<string, string> = {
  danger: "text-[var(--danger)]",
  warning: "text-[var(--warn)]",
  "stage-2": "text-stage-2",
  "stage-3": "text-stage-3",
  purple: "text-purple",
};

const eur = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export default async function CockpitPage() {
  const data = await getCockpitData();
  const maxV = Math.max(...data.week.map((w) => w.v), 1);

  return (
    <>
      <PageHeader
        icon={Target}
        title="Cockpit"
        description="Pilotage temps réel de toute la chaîne — de la commande à la facture"
        actions={
          <>
            <Button variant="outline" size="sm">
              <Tv className="size-4" />
              Mode TV atelier
            </Button>
            <Link href="/commandes" className={buttonVariants({ size: "sm" })}>
              <Plus className="size-4" />
              Nouvelle commande
            </Link>
          </>
        }
      />

      {/* Pipeline */}
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
        {STAGE_META.map((s, i) => {
          const Icon = s.icon;
          const val = data.pipeline[s.key];
          return (
            <Link
              key={s.n}
              href={s.href}
              className="relative overflow-hidden rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: s.color }} />
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{s.n}</div>
              <Icon className="mt-2 size-6" style={{ color: s.color }} />
              <div className="mt-2 text-2xl font-extrabold leading-none" style={{ color: s.color }}>
                {val}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.lbl}</div>
              {i < STAGE_META.length - 1 && (
                <ChevronRight className="absolute -right-1 top-1/2 size-5 -translate-y-1/2 text-border" />
              )}
            </Link>
          );
        })}
      </div>

      {/* AI insights */}
      <div className="mb-5 rounded-xl border border-[#ddd6fe] bg-gradient-to-br from-[#faf5ff] to-[#eff6ff] p-4">
        <div className="mb-2.5 flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-purple">
          <Bot className="size-4" />
          Analyse intelligente — {data.insights.length} point{data.insights.length > 1 ? "s" : ""} d&apos;attention
        </div>
        <div className="flex flex-col">
          {data.insights.length === 0 && (
            <div className="py-2 text-xs text-muted-foreground">Aucune anomalie détectée — tout est sous contrôle ✓</div>
          )}
          {data.insights.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-purple/10 py-2 text-xs last:border-0"
            >
              <span className={TONE_TEXT[r.tone]}>● {r.text}</span>
              <Link
                href={r.href}
                className={buttonVariants({ variant: "ghost", size: "sm", className: "h-6 px-2 text-[11px]" })}
              >
                Traiter →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Financial KPIs */}
      <KpiGrid>
        <KpiCard label="CA en cours" value={eur(data.kpis.caEnCours)} icon={Euro} tone="brand" sub={`${data.nbCommandes} commandes actives`} />
        <KpiCard
          label="Marge brute"
          value={eur(data.kpis.margeBrute)}
          icon={BarChart3}
          tone="purple"
          sub={<StatusBadge tone="success">{data.kpis.margePct}% du CA</StatusBadge>}
        />
        <KpiCard label="Facturé (net)" value={eur(data.kpis.facture)} icon={Wallet} tone="success" sub={`${data.kpis.nbFactures} factures`} />
        <KpiCard label="En retard" value={String(data.kpis.enRetard)} icon={TriangleAlert} tone="danger" sub="commandes à surveiller" />
      </KpiGrid>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionPanel title="Production des 7 derniers jours" icon={<TrendingUp className="size-4 text-brand" />}>
          <div className="flex h-52 items-end justify-around gap-3 pt-2">
            {data.week.map((w, i) => (
              <div key={i} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">{w.v || ""}</span>
                <div className="w-full max-w-[48px] rounded-md bg-brand transition-all" style={{ height: `${(w.v / maxV) * 150}px` }} />
                <span className="text-[11px] text-muted-foreground">{w.d}</span>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel title="État des chaînes" icon={<Factory className="size-4 text-brand" />} flush>
          {data.chains.length === 0 && (
            <div className="px-4 py-6 text-center text-xs text-muted-foreground">Aucune chaîne configurée</div>
          )}
          {data.chains.map((ch) => (
            <div key={ch.nom} className="flex items-center gap-3 border-b px-4 py-3 last:border-0">
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: ch.color }} />
              <div className="flex-1">
                <div className="text-xs font-bold">{ch.nom}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ch.ouv} ouvrières · {ch.pcs} pcs aujourd&apos;hui
                </div>
              </div>
              <div className="flex w-24 items-center gap-2">
                <Progress value={ch.rend} className="h-1.5" />
                <span className="w-8 text-right text-[11px] font-semibold tabular-nums">{ch.rend}%</span>
              </div>
            </div>
          ))}
        </SectionPanel>
      </div>
    </>
  );
}
