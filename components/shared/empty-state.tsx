import type { LucideIcon } from "lucide-react";

export function EmptyState({
  icon: Icon,
  message,
}: {
  icon: LucideIcon;
  message: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-12 text-center">
      <Icon className="size-8 text-muted-foreground/50" />
      <p className="text-xs text-muted-foreground">{message}</p>
    </div>
  );
}
