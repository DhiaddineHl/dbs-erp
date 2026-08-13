"use client";

import { Bar, BarChart, CartesianGrid, LabelList, XAxis } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";

export type PointProduction = { d: string; iso: string; v: number };

/* Une seule série : pas de légende, le titre du panneau la nomme.
 * Pas d'axe Y non plus — la valeur en bout de barre se lit plus vite
 * qu'une grille, et sept barres tiennent sans encombrement. */
const config = {
  v: { label: "Pièces sorties", color: "var(--chart-1)" },
} satisfies ChartConfig;

const JOURS: Record<string, string> = {
  dim: "dimanche",
  lun: "lundi",
  mar: "mardi",
  mer: "mercredi",
  jeu: "jeudi",
  ven: "vendredi",
  sam: "samedi",
};

const dateLongue = (iso: string) => {
  const [a, m, j] = iso.split("-");
  return `${j}/${m}/${a}`;
};

export function BarresProduction({ data }: { data: PointProduction[] }) {
  const vide = data.every((p) => p.v === 0);

  if (vide) {
    return (
      <div className="flex h-[208px] items-center justify-center text-xs text-muted-foreground">
        Aucune sortie enregistrée sur les 7 derniers jours
      </div>
    );
  }

  return (
    <ChartContainer config={config} className="h-[208px] w-full">
      <BarChart data={data} margin={{ top: 24, right: 8, bottom: 0, left: 8 }} accessibilityLayer>
        <CartesianGrid vertical={false} strokeDasharray="3 3" />
        <XAxis dataKey="d" tickLine={false} axisLine={false} tickMargin={8} />
        <ChartTooltip
          cursor={false}
          content={
            <ChartTooltipContent
              labelFormatter={(_, payload) => {
                const p = payload?.[0]?.payload as PointProduction | undefined;
                return p ? `${JOURS[p.d] ?? p.d} ${dateLongue(p.iso)}` : "";
              }}
            />
          }
        />
        <Bar dataKey="v" fill="var(--color-v)" radius={[4, 4, 0, 0]} maxBarSize={48}>
          <LabelList
            dataKey="v"
            position="top"
            offset={8}
            className="fill-muted-foreground"
            fontSize={11}
            formatter={(v) => (typeof v === "number" && v ? v.toLocaleString("fr-FR") : "")}
          />
        </Bar>
      </BarChart>
    </ChartContainer>
  );
}
