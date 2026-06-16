import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

export function SectionPanel({
  title,
  icon,
  actions,
  flush,
  className,
  children,
}: {
  title?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
  /** Remove body padding (e.g. for full-bleed tables) */
  flush?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <Card className={cn("mb-4 gap-0 overflow-hidden p-0", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-2.5 border-b px-4 py-3">
          <span className="flex items-center gap-2 text-[13px] font-bold">
            {icon}
            {title}
          </span>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn(flush ? "" : "p-4")}>{children}</div>
    </Card>
  );
}
