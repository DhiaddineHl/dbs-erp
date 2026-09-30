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
  Scale,
} from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { KpiCard, KpiGrid } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { BarresProduction } from "@/components/charts/barres-production";
import { FacturationMensuelle } from "@/components/charts/facturation-mensuelle";
import { MargesFaconniersChart } from "@/components/charts/marges-faconniers";
import { getCockpitData, getGraphiquesFinance } from "@/lib/services/dashboard";
import { pointMortMoisCourant } from "@/lib/services/rentabilite";
import { VueDeviseSelect } from "@/components/shared/vue-devise";
import { DEVISES, devisesDe, formatMontant, formatMontants, parseVueDevise } from "@/lib/domain/montants";

const STAGE_META = [
  { key: "commandes", n: "1 · Commandes", icon: Package, lbl: "en cours", href: "/commandes", color: "var(--s1)" },
  { key: "matieres", n: "2 · Matières", icon: Layers, lbl: "à contrôler", href: "/magtissu", color: "var(--s2)" },
  { key: "prepa", n: "3 · Préparation", icon: PencilRuler, lbl: "sans OK PRO", href: "/dt", color: "var(--s3)" },
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

export default async function CockpitPage({ searchParams }: { searchParams: Promise<{ vue?: string }> }) {
  // Montants séparés par devise, ou convertis dans la devise choisie (?vue=TND).
  const vue = parseVueDevise((await searchParams).vue);
  const [data, finance, pm] = await Promise.all([getCockpitData(vue), getGraphiquesFinance(vue), pointMortMoisCourant()]);
  const k = data.kpis;
  const arrondi = { decimales: 0 };
  const margePct = devisesDe(k.margePct)
    .map((d) => `${k.margePct[d]}%` + (devisesDe(k.margePct).length > 1 ? ` (${DEVISES[d].symbole})` : ""))
    .join(" · ");

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

      {/* Financial KPIs — hors taxes */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <VueDeviseSelect />
        {k.nonConvertis > 0 && (
          <span className="text-[11px] text-[var(--danger-d)]">
            ⚠ {k.nonConvertis} montant(s) exclu(s) faute de taux de change — voir Paramètres
          </span>
        )}
      </div>
      <KpiGrid>
        <KpiCard
          label="CA en cours (HT)"
          value={formatMontants(k.caEnCours, arrondi)}
          icon={Euro}
          tone="brand"
          sub={`${data.nbCommandes} commandes actives`}
        />
        <KpiCard
          label="Marge brute"
          value={formatMontants(k.margeBrute, arrondi)}
          icon={BarChart3}
          tone="purple"
          sub={margePct ? <StatusBadge tone="success">{margePct} du CA</StatusBadge> : undefined}
        />
        <KpiCard
          label="Facturé net (HT)"
          value={formatMontants(k.facture, arrondi)}
          icon={Wallet}
          tone="success"
          sub={`${k.nbFactures} factures`}
        />
        <KpiCard label="En retard" value={String(data.kpis.enRetard)} icon={TriangleAlert} tone="danger" sub="commandes à surveiller" />
      </KpiGrid>

      {/* Rentabilité atelier du mois : CA produit (GPAO) face aux charges de l'usine */}
      <SectionPanel
        title="Rentabilité atelier — mois en cours"
        icon={<Scale className="size-4 text-brand" />}
        actions={
          <Link href="/gpao_prod" className={buttonVariants({ variant: "ghost", size: "sm", className: "h-7 text-xs" })}>
            Détail GPAO → Rentabilité
          </Link>
        }
      >
        {!pm.configure ? (
          <div className="py-2 text-xs text-muted-foreground">
            Coût de l&apos;usine non réglé : renseigne charges mensuelles, ouvrières directes et heures/mois dans GPAO →
            Simulation.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {[
                { l: "CA produit", v: eur(pm.ca), c: "" },
                { l: "Charges à date", v: eur(pm.charges), c: "" },
                { l: "Marge", v: eur(pm.marge), c: pm.marge >= 0 ? "text-[var(--ok)]" : "text-[var(--danger)]" },
                {
                  l: "Couverture",
                  v: pm.couverture == null ? "—" : `${Math.round(pm.couverture * 100)} %`,
                  c: (pm.couverture ?? 0) >= 1 ? "text-[var(--ok)]" : "text-[var(--danger)]",
                },
                { l: "Point mort / jour", v: eur(pm.caJour), c: "", s: `${pm.joursAtteints}/${pm.joursProduits} jours atteints` },
                {
                  l: "Rendement",
                  v: pm.rendement == null ? "—" : `${Math.round(pm.rendement * 100)} %`,
                  c: "",
                  s: pm.modelesPerdants ? `${pm.modelesPerdants} modèle(s) à perte` : "aucun modèle à perte",
                },
              ].map((k) => (
                <div key={k.l} className="rounded-lg border p-3">
                  <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{k.l}</div>
                  <div className={`mt-1 text-lg font-extrabold tabular-nums ${k.c}`}>{k.v}</div>
                  {"s" in k && k.s && <div className="text-[10.5px] text-muted-foreground">{k.s}</div>}
                </div>
              ))}
            </div>
            {pm.couverture != null && (
              <div className="mt-3">
                <Progress value={Math.min(100, Math.round(pm.couverture * 100))} className="h-2" />
                <div className="mt-1 text-[11px] text-muted-foreground">
                  CA produit / charges de l&apos;usine à date (au prorata des jours travaillés). 100 % = point mort atteint.
                </div>
              </div>
            )}
          </>
        )}
      </SectionPanel>

      {/* Bottom grid */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[2fr_1fr]">
        <SectionPanel title="Production des 7 derniers jours" icon={<TrendingUp className="size-4 text-brand" />}>
          <BarresProduction data={data.week} />
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

      {/* Les deux séries financières mensuelles, une paire de graphiques par devise */}
      {finance.map((g) => {
        const suffixe = finance.length > 1 ? ` — ${g.devise}` : "";
        return (
          <div key={g.devise} className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SectionPanel
              title={`Facturation par origine de production${suffixe}`}
              icon={<Euro className="size-4 text-brand" />}
              actions={
                <StatusBadge tone="brand">
                  {formatMontant(g.facturation.at(-1)?.cumul ?? 0, g.devise, arrondi)} facturés HT
                </StatusBadge>
              }
            >
              <FacturationMensuelle data={g.facturation} devise={g.devise} />
            </SectionPanel>

            <SectionPanel
              title={`Marge sur coût façon, par façonnier${suffixe}`}
              icon={<BarChart3 className="size-4 text-brand" />}
              actions={<StatusBadge tone="success">{formatMontant(g.marges.total, g.devise, arrondi)}</StatusBadge>}
            >
              <MargesFaconniersChart marges={g.marges} devise={g.devise} />
              <p className="mt-2 text-[11px] leading-snug text-muted-foreground">
                Montant facturé moins la façon payée. Ni le tissu, ni les fournitures, ni la coupe
                ne sont déduits : ce n&apos;est pas la marge nette.
              </p>
            </SectionPanel>
          </div>
        );
      })}
    </>
  );
}
