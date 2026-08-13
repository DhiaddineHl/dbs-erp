"use client";

import { Area, AreaChart, Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { LIBELLES_ORIGINE, type PointFacturation } from "@/lib/domain/graphiques";
import { euros, eurosAxe } from "./format";

/* Deux graphiques empilés plutôt qu'un seul à deux axes Y. L'original traçait
 * les barres du mois et la courbe de cumul sur la même échelle : le cumul
 * atteignant plusieurs fois le meilleur mois, les barres se tassaient dans le
 * bas du cadre. Deux cadres, une échelle chacun, un axe X commun. */

const config = {
  interne: { label: LIBELLES_ORIGINE.interne, color: "var(--chart-1)" },
  faconnier: { label: LIBELLES_ORIGINE.faconnier, color: "var(--chart-2)" },
  nonRenseigne: { label: LIBELLES_ORIGINE.nonRenseigne, color: "var(--chart-vide)" },
  cumul: { label: "Cumul facturé", color: "var(--chart-1)" },
} satisfies ChartConfig;

const MARGE_GAUCHE = { top: 8, right: 8, bottom: 0, left: 0 };
const LARGEUR_AXE = 58;

export function FacturationMensuelle({ data }: { data: PointFacturation[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[280px] items-center justify-center text-xs text-muted-foreground">
        Aucune facture datée à représenter
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <ChartContainer config={config} className="h-[200px] w-full">
        <BarChart data={data} margin={MARGE_GAUCHE} accessibilityLayer>
          <CartesianGrid vertical={false} strokeDasharray="3 3" />
          <YAxis
            width={LARGEUR_AXE}
            tickLine={false}
            axisLine={false}
            tickFormatter={eurosAxe}
            tickMargin={4}
          />
          <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
          <ChartLegend verticalAlign="top" content={<ChartLegendContent className="pb-2 pt-0" />} />
          <ChartTooltip
            content={<ChartTooltipContent formatter={formatLigne} />}
          />
          {/* Le liseré blanc sépare les segments empilés sans ajouter de couleur. */}
          <Bar dataKey="interne" stackId="m" fill="var(--color-interne)" stroke="var(--card)" strokeWidth={1} maxBarSize={44} />
          <Bar dataKey="faconnier" stackId="m" fill="var(--color-faconnier)" stroke="var(--card)" strokeWidth={1} maxBarSize={44} />
          <Bar
            dataKey="nonRenseigne"
            stackId="m"
            fill="var(--color-nonRenseigne)"
            stroke="var(--card)"
            strokeWidth={1}
            maxBarSize={44}
            radius={[4, 4, 0, 0]}
          />
        </BarChart>
      </ChartContainer>

      <div className="mt-2 border-t pt-2 text-[10px] font-bold uppercase tracking-wide text-muted-foreground">
        Cumul facturé
      </div>
      <ChartContainer config={config} className="h-[76px] w-full">
        <AreaChart data={data} margin={MARGE_GAUCHE} accessibilityLayer>
          <YAxis
            width={LARGEUR_AXE}
            tickLine={false}
            axisLine={false}
            tickFormatter={eurosAxe}
            tickMargin={4}
            tickCount={3}
          />
          <XAxis dataKey="label" hide />
          <ChartTooltip content={<ChartTooltipContent formatter={formatLigne} />} />
          <Area
            dataKey="cumul"
            type="linear"
            stroke="var(--color-cumul)"
            strokeWidth={2}
            fill="var(--color-cumul)"
            fillOpacity={0.12}
            dot={false}
            activeDot={{ r: 4 }}
          />
        </AreaChart>
      </ChartContainer>
    </div>
  );
}

/* Rendu d'une entrée d'infobulle : pastille, libellé, montant. */
function formatLigne(
  value: unknown,
  name: unknown,
  item: { color?: string },
) {
  const cle = String(name) as keyof typeof config;
  return (
    <>
      <span
        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[2px]"
        style={{ background: item?.color }}
      />
      <div className="flex flex-1 items-center justify-between gap-3 leading-none">
        <span className="text-muted-foreground">{config[cle]?.label ?? String(name)}</span>
        <span className="font-mono font-medium tabular-nums text-foreground">
          {typeof value === "number" ? euros(value) : String(value)}
        </span>
      </div>
    </>
  );
}
