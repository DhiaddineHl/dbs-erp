"use client";

import { Cell, Pie, PieChart } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { RepartitionProduction } from "@/lib/domain/graphiques";
import { pieces } from "./format";

const TEINTES = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
  "var(--chart-6)",
];

const teinte = (slot: number | null) => (slot == null ? "var(--chart-vide)" : TEINTES[slot % TEINTES.length]);

export function RepartitionProductionChart({ repartition }: { repartition: RepartitionProduction }) {
  const { parts, total, pctInterne } = repartition;

  if (!parts.length || total === 0) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
        Aucune pièce en production
      </div>
    );
  }

  const config: ChartConfig = Object.fromEntries(
    parts.map((p) => [p.cle, { label: p.nom, color: teinte(p.slot) }]),
  );

  return (
    <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:gap-5">
      <div className="relative shrink-0">
        <ChartContainer config={config} className="h-[190px] w-[190px]">
          <PieChart accessibilityLayer>
            <ChartTooltip
              content={
                <ChartTooltipContent
                  hideLabel
                  nameKey="cle"
                  formatter={(value, _name, item) => (
                    <>
                      <span
                        className="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-[2px]"
                        style={{ background: item?.payload?.fill }}
                      />
                      <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                        <span className="text-muted-foreground">{item?.payload?.nom}</span>
                        <span className="font-mono font-medium tabular-nums text-foreground">
                          {typeof value === "number" ? `${pieces(value)} pcs` : String(value)}
                        </span>
                      </div>
                    </>
                  )}
                />
              }
            />
            <Pie
              data={parts}
              dataKey="pieces"
              nameKey="cle"
              innerRadius={58}
              outerRadius={90}
              paddingAngle={2}
              stroke="var(--card)"
              strokeWidth={2}
            >
              {parts.map((p) => (
                <Cell key={p.cle} fill={teinte(p.slot)} />
              ))}
            </Pie>
          </PieChart>
        </ChartContainer>
        {/* Le chiffre au centre : la part que l'atelier fabrique lui-même. */}
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-extrabold leading-none text-brand">{pctInterne}%</span>
          <span className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">interne DBS</span>
        </div>
      </div>

      {/* Légende-tableau : identité, teinte et volume sur la même ligne. */}
      <ul className="flex w-full min-w-0 flex-col gap-1.5">
        {parts.map((p) => (
          <li key={p.cle} className="flex items-center gap-2 text-xs">
            <span className="size-2.5 shrink-0 rounded-[2px]" style={{ background: teinte(p.slot) }} />
            <span className="min-w-0 flex-1 truncate">{p.nom}</span>
            <span className="tabular-nums text-muted-foreground">{pieces(p.pieces)}</span>
            <span className="w-9 text-right tabular-nums text-muted-foreground">
              {Math.round((p.pieces / total) * 100)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
