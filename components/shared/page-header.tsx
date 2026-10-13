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
    <div className="mb-4 flex flex-wrap items-start justify-between gap-3 lg:mb-5">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2.5 text-lg font-extrabold tracking-tight lg:text-xl">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent text-brand lg:size-9">
            <Icon className="size-4 lg:size-5" />
          </span>
          {title}
        </h1>
        {/* Sur téléphone, le titre est déjà dans la barre du haut : la phrase
            d'explication coûterait trois lignes avant le premier chiffre. */}
        {description && (
          <p className="mt-1.5 hidden max-w-3xl text-xs text-muted-foreground sm:block">
            {description}
          </p>
        )}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
