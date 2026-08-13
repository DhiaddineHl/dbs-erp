"use client";

import { Bar, BarChart, LabelList, XAxis, YAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { euros } from "./format";

export type PartClient = { client: string; ca: number; pieces: number };

/* Un classement, donc une seule teinte : colorer chaque barre reviendrait à
 * encoder le rang, qui est déjà porté par la position. Le montant en bout de
 * barre remplace la grille — plus court à lire. */
const config = {
  ca: { label: "CA", color: "var(--chart-1)" },
} satisfies ChartConfig;

/** Tronque les raisons sociales longues pour garder l'axe étroit. */
const court = (s: string) => (s.length > 18 ? `${s.slice(0, 17)}…` : s);

export function CaParClient({ data }: { data: PartClient[] }) {
  if (!data.length) {
    return (
      <div className="flex h-[240px] items-center justify-center text-xs text-muted-foreground">
        Aucun chiffre d&apos;affaires à représenter
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="w-full" style={{ height: data.length * 32 + 24 }}>
      <BarChart
        data={data}
        layout="vertical"
        margin={{ top: 4, right: 76, bottom: 4, left: 4 }}
        accessibilityLayer
      >
        <XAxis type="number" dataKey="ca" hide />
        <YAxis
          type="category"
          dataKey="client"
          width={128}
          tickLine={false}
          axisLine={false}
          tickMargin={4}
          tickFormatter={court}
        />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              formatter={(value, _name, item) => (
                <div className="flex flex-1 items-center justify-between gap-3 leading-none">
                  <span className="text-muted-foreground">
                    {(item?.payload as PartClient | undefined)?.pieces.toLocaleString("fr-FR")} pcs
                  </span>
                  <span className="font-mono font-medium tabular-nums text-foreground">
                    {typeof value === "number" ? euros(value) : String(value)}
                  </span>
                </div>
              )}
            />
          }
        />
        <Bar dataKey="ca" fill="var(--color-ca)" radius={[0, 4, 4, 0]} barSize={16}>
          <LabelList
            dataKey="ca"
            position="right"
            offset={8}
            className="fill-foreground"
            fontSize={11}
            formatter={(v) => (typeof v === "number" ? euros(v) : "")}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
