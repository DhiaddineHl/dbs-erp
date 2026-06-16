import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

export type Tone =
  | "brand"
  | "success"
  | "warning"
  | "danger"
  | "neutral"
  | "purple"
  | "info";

const TONES: Record<Tone, string> = {
  brand: "bg-accent text-accent-foreground border-transparent",
  success: "bg-success-muted text-success-foreground border-transparent",
  warning: "bg-warning-muted text-warning-foreground border-transparent",
  danger: "bg-[var(--danger-l)] text-[var(--danger-d)] border-transparent",
  neutral: "bg-muted text-muted-foreground border-transparent",
  purple: "bg-purple-muted text-purple border-transparent",
  info: "bg-info-muted text-info border-transparent",
};

export function StatusBadge({
  tone = "neutral",
  className,
  children,
}: {
  tone?: Tone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("rounded-full font-semibold", TONES[tone], className)}
    >
      {children}
    </Badge>
  );
}
