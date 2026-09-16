"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type Retour = { ok: true; data?: unknown } | { ok: false; error: string };

/** Exécute une action serveur, signale l'erreur, rafraîchit en cas de succès. */
export function useAction() {
  const router = useRouter();
  return useCallback(
    async (run: () => Promise<Retour>, succes?: string) => {
      const r = await run();
      if (!r.ok) {
        toast.error(r.error);
        return r;
      }
      if (succes) toast.success(succes);
      router.refresh();
      return r;
    },
    [router],
  );
}

const base =
  "w-full rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60";

/** Champ enregistré à la sortie du focus. La valeur locale est remise à celle
 * du serveur si l'écriture est refusée — l'écran ne ment jamais sur l'état. */
export function ChampAction({
  valeur,
  type = "text",
  fige,
  onSave,
  className,
  placeholder,
  step,
  liste,
}: {
  valeur: string;
  type?: "text" | "number" | "date" | "textarea";
  fige?: boolean;
  onSave: (v: string) => Promise<Retour>;
  className?: string;
  placeholder?: string;
  step?: string;
  liste?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(valeur);
  const [pending, start] = useTransition();

  const commit = () => {
    if (v === valeur) return;
    start(async () => {
      const r = await onSave(v);
      if (!r.ok) {
        toast.error(r.error);
        setV(valeur);
        return;
      }
      router.refresh();
    });
  };

  const commun = { disabled: fige || pending, className: cn(base, pending && "opacity-60", className) };

  if (type === "textarea") {
    return (
      <textarea {...commun} rows={2} value={v} placeholder={placeholder} onChange={(e) => setV(e.target.value)} onBlur={commit} />
    );
  }
  return (
    <input
      {...commun}
      type={type}
      step={step}
      list={liste}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={commit}
    />
  );
}

/** Liste déroulante enregistrée au changement. */
export function SelectAction({
  valeur,
  options,
  fige,
  onSave,
  className,
}: {
  valeur: string;
  options: { value: string; label: string }[];
  fige?: boolean;
  onSave: (v: string) => Promise<Retour>;
  className?: string;
}) {
  const router = useRouter();
  const [v, setV] = useState(valeur);
  const [pending, start] = useTransition();

  return (
    <select
      value={v}
      disabled={fige || pending}
      className={cn(base, className)}
      onChange={(e) => {
        const next = e.target.value;
        setV(next);
        start(async () => {
          const r = await onSave(next);
          if (!r.ok) {
            toast.error(r.error);
            setV(valeur);
            return;
          }
          router.refresh();
        });
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

export function BoutonAction({
  onRun,
  children,
  variant = "outline",
  confirmer,
  succes,
  disabled,
  title,
}: {
  onRun: () => Promise<Retour>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive" | "ghost";
  confirmer?: string;
  succes?: string;
  disabled?: boolean;
  title?: string;
}) {
  const run = useAction();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size="sm"
      disabled={disabled || pending}
      title={title}
      onClick={() => {
        if (confirmer && !confirm(confirmer)) return;
        start(() => run(onRun, succes).then(() => undefined));
      }}
    >
      {children}
    </Button>
  );
}
