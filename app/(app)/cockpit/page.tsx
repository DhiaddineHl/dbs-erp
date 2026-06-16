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

const STAGES = [
  { n: "1 · Commandes", icon: Package, val: 12, lbl: "en cours", href: "/commandes", color: "var(--s1)" },
  { n: "2 · Matières", icon: Layers, val: 4, lbl: "à contrôler", href: "/tissus", color: "var(--s2)" },
  { n: "3 · Préparation", icon: PencilRuler, val: 3, lbl: "sans OK PRO", href: "/be", color: "var(--s3)" },
  { n: "4 · Production", icon: Factory, val: 6, lbl: "en fabrication", href: "/gpao_prod", color: "var(--s4)" },
  { n: "5 · Magasin", icon: Warehouse, val: 2, lbl: "à expédier", href: "/magasin", color: "var(--s5)" },
];

const AI_INSIGHTS = [
  { tone: "danger", text: "2 commande(s) en retard de livraison", href: "/commandes" },
  { tone: "warning", text: "1 commande(s) non assignées (chaîne/façonnier)", href: "/commandes" },
  { tone: "stage-2", text: "4 tissu(s) en attente de contrôle", href: "/tissus" },
  { tone: "stage-3", text: "3 tête(s) de série en attente OK PRO client", href: "/be" },
  { tone: "purple", text: "1 modèle(s) sans gamme SAM définie", href: "/gammes" },
] as const;

const TONE_TEXT: Record<string, string> = {
  danger: "text-[var(--danger)]",
  warning: "text-[var(--warn)]",
  "stage-2": "text-stage-2",
  "stage-3": "text-stage-3",
  purple: "text-purple",
};

const CHAINS = [
  { nom: "Chaîne 1", spec: "Chemise", ouv: 14, pcs: 420, rend: 88, color: "var(--s1)" },
  { nom: "Chaîne 2", spec: "Pantalon", ouv: 11, pcs: 310, rend: 72, color: "var(--s2)" },
  { nom: "Chaîne 3", spec: "Veste", ouv: 9, pcs: 180, rend: 64, color: "var(--s4)" },
];

const WEEK = [
  { d: "lun", v: 380 },
  { d: "mar", v: 520 },
  { d: "mer", v: 460 },
  { d: "jeu", v: 610 },
  { d: "ven", v: 540 },
  { d: "sam", v: 290 },
  { d: "dim", v: 0 },
];

export default function CockpitPage() {
  const maxV = Math.max(...WEEK.map((w) => w.v), 1);

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
        {STAGES.map((s, i) => {
          const Icon = s.icon;
          return (
            <Link
              key={s.n}
              href={s.href}
              className="relative overflow-hidden rounded-xl border bg-card p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
            >
              <span
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: s.color }}
              />
              <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
                {s.n}
              </div>
              <Icon className="mt-2 size-6" style={{ color: s.color }} />
              <div
                className="mt-2 text-2xl font-extrabold leading-none"
                style={{ color: s.color }}
              >
                {s.val}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">{s.lbl}</div>
              {i < STAGES.length - 1 && (
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
          Analyse intelligente — {AI_INSIGHTS.length} points d&apos;attention
        </div>
        <div className="flex flex-col">
          {AI_INSIGHTS.map((r, i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 border-b border-purple/10 py-2 text-xs last:border-0"
            >
              <span className={TONE_TEXT[r.tone]}>● {r.text}</span>
              <Link
                href={r.href}
                className={buttonVariants({
                  variant: "ghost",
                  size: "sm",
                  className: "h-6 px-2 text-[11px]",
                })}
              >
                Traiter →
              </Link>
            </div>
          ))}
        </div>
      </div>

      {/* Financial KPIs */}
      <KpiGrid>
        <KpiCard
          label="CA en cours"
          value="248 600 €"
          icon={Euro}
          tone="brand"
          sub="12 commandes actives"
        />
        <KpiCard
          label="Marge brute"
          value="61 200 €"
          icon={BarChart3}
          tone="purple"
          sub={<StatusBadge tone="success">25% du CA</StatusBadge>}
        />
        <KpiCard
          label="Facturé (TTC)"
          value="187 400 €"
          icon={Wallet}
          tone="success"
          sub="9 factures"
        />
        <KpiCard
          label="En retard"
          value="2"
          icon={TriangleAlert}
          tone="danger"
          sub="commandes à surveiller"
        />
      </KpiGrid>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionPanel
          title="Production des 7 derniers jours"
          icon={<TrendingUp className="size-4 text-brand" />}
        >
          <div className="flex h-52 items-end justify-around gap-3 pt-2">
            {WEEK.map((w) => (
              <div key={w.d} className="flex flex-1 flex-col items-center gap-2">
                <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
                  {w.v || ""}
                </span>
                <div
                  className="w-full max-w-[48px] rounded-md bg-brand transition-all"
                  style={{ height: `${(w.v / maxV) * 150}px` }}
                />
                <span className="text-[11px] text-muted-foreground">{w.d}</span>
              </div>
            ))}
          </div>
        </SectionPanel>

        <SectionPanel
          title="État des chaînes"
          icon={<Factory className="size-4 text-brand" />}
          flush
        >
          {CHAINS.map((ch) => (
            <div
              key={ch.nom}
              className="flex items-center gap-3 border-b px-4 py-3 last:border-0"
            >
              <span
                className="size-2.5 shrink-0 rounded-full"
                style={{ background: ch.color }}
              />
              <div className="flex-1">
                <div className="text-xs font-bold">{ch.nom}</div>
                <div className="text-[10px] text-muted-foreground">
                  {ch.ouv} ouvrières · {ch.pcs} pcs aujourd&apos;hui
                </div>
              </div>
              <div className="flex w-24 items-center gap-2">
                <Progress value={ch.rend} className="h-1.5" />
                <span className="w-8 text-right text-[11px] font-semibold tabular-nums">
                  {ch.rend}%
                </span>
              </div>
            </div>
          ))}
        </SectionPanel>
      </div>
    </>
  );
}
