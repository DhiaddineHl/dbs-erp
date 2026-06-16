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
    <Card className="relative overflow-hidden p-4 transition-shadow hover:shadow-md">
      <div className={cn("absolute inset-y-0 left-0 w-[3px]", accent.bar)} />
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
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
          "mt-2 text-[28px] font-extrabold leading-none tracking-tight tabular-nums",
          VALUE_COLOR[tone],
        )}
      >
        {value}
      </div>
      {sub && (
        <div className="mt-1.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {sub}
        </div>
      )}
    </Card>
  );
}

export function KpiGrid({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-5 grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      {children}
    </div>
  );
}
