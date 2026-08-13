"use client";

import { CartesianGrid, Line, LineChart, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { CLE_AUTRES, type MargesFaconniers } from "@/lib/domain/graphiques";
import { euros, eurosAxe } from "./format";

/* Palette catégorielle figée : la couleur suit le façonnier, pas son rang du
 * mois. « Autres » prend le gris de repli — un agrégat n'est pas une entité. */
const TEINTES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const teinte = (cle: string, i: number) => (cle === CLE_AUTRES ? "var(--chart-vide)" : TEINTES[i % TEINTES.length]);

export function MargesFaconniersChart({ marges }: { marges: MargesFaconniers }) {
  const { data, series } = marges;

  if (!data.length || !series.length) {
    return (
      <div className="flex h-[240px] items-center justify-center text-center text-xs text-muted-foreground">
        Aucun article sous-traité avec un coût de façon saisi
      </div>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    series.map((s, i) => [s.cle, { label: s.nom, color: teinte(s.cle, i) }]),
  );

  return (
    <ChartContainer config={config} className="h-[240px] w-full">
      <LineChart data={data} margin={{ top: 8, right: 12, bottom: 0, left: 0 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <YAxis width={48} tickLine={false} axisLine={false} tickFormatter={eurosAxe} tickMargin={4} />
        <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartLegend content={<ChartLegendContent className="flex-wrap gap-x-4 gap-y-1" />} />
        <ChartTooltip
          content={
            <ChartTooltipContent
              formatter={(value, name, item) => (
                <>
                  <span
                    className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[2px]"
                    style={{ background: item?.color }}
                  />
                  <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                    <span className="text-muted-foreground">{config[String(name)]?.label ?? String(name)}</span>
                    <span className="font-mono font-medium tabular-nums text-foreground">
                      {typeof value === "number" ? euros(value) : String(value)}
                    </span>
                  </div>
                </>
              )}
            />
          }
        />
        {series.map((s, i) => (
          <Line
            key={s.cle}
            dataKey={s.cle}
            // Segments droits : une spline inventerait des valeurs entre deux
            // mois, et ferait dépasser la courbe au-dessus des points réels.
            type="linear"
            stroke={teinte(s.cle, i)}
            strokeWidth={2}
            dot={{ r: 3, strokeWidth: 0, fill: teinte(s.cle, i) }}
            activeDot={{ r: 5, stroke: "var(--card)", strokeWidth: 2 }}
          />
        ))}
      </LineChart>
    </ChartContainer>
  );
}
