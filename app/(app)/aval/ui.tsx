"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/* Petits éléments partagés par les écrans du flux aval. */

export type Retour = { ok: true; data?: unknown } | { ok: false; error: string };
export type ToneKpi = "brand" | "success" | "warning" | "danger" | "purple" | "neutral";

const COULEUR: Record<ToneKpi, string> = {
  brand: "text-brand",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-[var(--danger-d)]",
  purple: "text-purple",
  neutral: "text-foreground",
};

export function Tuiles({ children }: { children: React.ReactNode }) {
  return <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-3">{children}</div>;
}

export function Kpi({
  label,
  valeur,
  tone = "brand",
  sub,
}: {
  label: string;
  valeur: string | number;
  tone?: ToneKpi;
  sub?: string;
}) {
  return (
    <div className="rounded-xl border bg-card px-4 py-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", COULEUR[tone])}>{valeur}</div>
      {sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{sub}</div>}
    </div>
  );
}

/** Bouton qui exécute une action serveur puis rafraîchit. */
export function BoutonAction({
  onRun,
  children,
  variant = "outline",
  confirmer,
  succes,
  disabled,
}: {
  onRun: () => Promise<Retour>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive" | "ghost";
  confirmer?: string;
  succes?: string;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={disabled || pending}
      onClick={() => {
        if (confirmer && !confirm(confirmer)) return;
        start(async () => {
          const r = await onRun();
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          if (succes) toast.success(succes);
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}

/** Liste déroulante enregistrée au changement. */
export function SelectAction({
  valeur,
  options,
  onSave,
  disabled,
  className,
}: {
  valeur: string;
  options: { value: string; label: string }[];
  onSave: (v: string) => Promise<Retour>;
  disabled?: boolean;
  className?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      value={valeur}
      disabled={disabled || pending}
      className={cn(
        "rounded-md border border-input bg-card px-1.5 py-1 text-xs outline-none focus:border-ring disabled:opacity-60",
        className,
      )}
      onChange={(e) =>
        start(async () => {
          const r = await onSave(e.target.value);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Champ de date enregistré à la sortie du focus. */
export function DateAction({
  valeur,
  onSave,
  disabled,
}: {
  valeur: string;
  onSave: (v: string) => Promise<Retour>;
  disabled?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <input
      type="date"
      defaultValue={valeur}
      disabled={disabled || pending}
      className="rounded-md border border-input bg-card px-1.5 py-1 text-xs disabled:opacity-60"
      onBlur={(e) => {
        if (e.target.value === valeur) return;
        const v = e.target.value;
        start(async () => {
          const r = await onSave(v);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          router.refresh();
        });
      }}
    />
  );
}
