import type { LucideIcon } from "lucide-react";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Tone } from "@/components/shared/status-badge";

const ACCENT: Record<Tone, { bar: string; chip: string }> = {
  brand: { bar: "bg-brand", chip: "bg-accent text-brand" },
  success: { bar: "bg-success", chip: "bg-success-muted text-success-foreground" },
  warning: { bar: "bg-warning", chip: "bg-warning-muted text-warning-foreground" },
  danger: { bar: "bg-[var(--danger)]", chip: "bg-[var(--danger-l)] text-[var(--danger-d)]" },
  neutral: { bar: "bg-muted-foreground", chip: "bg-muted text-muted-foreground" },
  purple: { bar: "bg-purple", chip: "bg-purple-muted text-purple" },
  info: { bar: "bg-info", chip: "bg-info-muted text-info" },
};

const VALUE_COLOR: Record<Tone, string> = {
  brand: "text-brand",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-[var(--danger-d)]",
  neutral: "text-foreground",
  purple: "text-purple",
  info: "text-info",
};

export function KpiCard({
  label,
  value,
  icon: Icon,
  tone = "brand",
  sub,
}: {
  label: string;
  value: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  sub?: React.ReactNode;
}) {
  const accent = ACCENT[tone];
  return (
    <Card
      /* La carte de base espace ses lignes de 16 px : sur un téléphone,
         quatre indicateurs devenaient quatre écrans. On resserre. */
      className="relative overflow-hidden p-3 [--card-spacing:--spacing(1.5)] transition-shadow hover:shadow-md lg:p-4 lg:[--card-spacing:--spacing(4)]"
    >
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", accent.bar)} />
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-semibold uppercase leading-tight tracking-wide text-muted-foreground lg:text-[11px]">
          {label}
        </span>
        {Icon && (
          <span
            className={cn(
              "flex size-8 items-center justify-center rounded-lg",
              accent.chip,
            )}
          >
            <Icon className="size-4" />
          </span>
        )}
      </div>
      <div
        className={cn(
          "text-[22px] font-extrabold leading-none tracking-tight tabular-nums lg:mt-2 lg:text-[28px]",
          VALUE_COLOR[tone],
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground lg:mt-1.5">
          {sub}
        </div>
      )}
    </Card>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  /* Deux par ligne dès le téléphone : un indicateur par écran obligeait à
   * faire défiler quatre fois pour voir les chiffres du matin. */
  return (
    <div className="mb-4 grid grid-cols-2 gap-2.5 lg:mb-5 lg:gap-3.5 xl:grid-cols-4">
      {children}
    </div>
  );
}
