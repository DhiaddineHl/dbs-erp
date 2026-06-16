import type { LucideIcon } from "lucide-react";

export function PageHeader({
  icon: Icon,
  title,
  description,
  actions,
}: {
  icon: LucideIcon;
  title: string;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="flex items-center gap-2.5 text-xl font-extrabold tracking-tight">
          <span className="flex size-9 items-center justify-center rounded-lg bg-accent text-brand">
            <Icon className="size-5" />
          </span>
          {title}
        </h1>
        {description && (
          <p className="mt-1.5 max-w-3xl text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
