"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Field } from "@/lib/modules/forms";
import { TAILLE_GRIDS } from "@/lib/modules/options";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { ok: true } | { ok: false; error: string };

type Choice = { value: string; label: string };

export function EntityFormDialog({
  triggerLabel,
  title,
  fields,
  action,
  dynamicOptions,
  successMessage = "Enregistré",
}: {
  triggerLabel: string;
  title: string;
  fields: Field[];
  /** Server action that inserts the row. */
  action: (data: Record<string, string>) => Promise<Result>;
  /** Runtime dropdown sources for fields marked `dynamic` (keyed by field name). */
  dynamicOptions?: Record<string, Choice[]>;
  successMessage?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [pending, startTransition] = useTransition();

  const set = (name: string, v: string) => setValues((s) => ({ ...s, [name]: v }));

  const submit = () => {
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        toast.error(`« ${f.label} » est requis`);
        return;
      }
    }
    startTransition(async () => {
      const res = await action(values);
      if (res.ok) {
        toast.success(successMessage);
        setValues({});
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur");
      }
    });
  };

  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> {triggerLabel}
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setValues({});
        }}
      >
      <DialogContent className="max-h-[90vh] w-[95vw] max-w-[95vw] sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid max-h-[64vh] grid-cols-2 gap-4 overflow-y-auto px-0.5 py-0.5">
          {fields.map((f) => (
            <div key={f.name} className={`flex flex-col gap-1.5 ${f.full ? "col-span-2" : ""}`}>
              <Label className="text-[11px] font-semibold text-secondary-foreground">
                {f.label}
                {f.required && " *"}
              </Label>
              {f.type === "tailles" ? (
                <TaillesField value={values[f.name] ?? ""} onChange={(v) => set(f.name, v)} />
              ) : f.type === "select" ? (
                <Select value={values[f.name] ?? ""} onValueChange={(v) => set(f.name, v ?? "")}>
                  <SelectTrigger className="w-full bg-card">
                    <SelectValue placeholder="— choisir —" />
                  </SelectTrigger>
                  <SelectContent>
                    {f.dynamic
                      ? (dynamicOptions?.[f.name] ?? []).map((opt) => (
                          <SelectItem key={opt.value} value={opt.value}>
                            {opt.label}
                          </SelectItem>
                        ))
                      : (f.options ?? []).map((opt) => (
                          <SelectItem key={opt} value={opt}>
                            {opt}
                          </SelectItem>
                        ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                  value={values[f.name] ?? ""}
                  placeholder={f.placeholder}
                  className="bg-card"
                  onChange={(e) => set(f.name, e.target.value)}
                />
              )}
            </div>
          ))}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
      </Dialog>
    </>
  );
}

type TailleEntry = { taille: string; qte: number };

/** Size-grid editor: pick a grid (XS→XXL / 34→46 / Unique) then a qty per size.
 * Serialises to a JSON string in the form value; total qty is shown live. */
function TaillesField({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  let rows: TailleEntry[] = [];
  try {
    rows = value ? (JSON.parse(value) as TailleEntry[]) : [];
  } catch {
    rows = [];
  }
  const emit = (next: TailleEntry[]) => onChange(JSON.stringify(next));
  const setGrid = (key: keyof typeof TAILLE_GRIDS) =>
    emit(TAILLE_GRIDS[key].map((t) => ({ taille: t, qte: 0 })));
  const setQte = (i: number, q: number) =>
    emit(rows.map((r, idx) => (idx === i ? { ...r, qte: q } : r)));
  const total = rows.reduce((s, r) => s + (Number(r.qte) || 0), 0);

  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3">
      <div className="mb-2 flex flex-wrap gap-1.5">
        <Button type="button" variant="outline" size="xs" onClick={() => setGrid("standard")}>XS→XXL</Button>
        <Button type="button" variant="outline" size="xs" onClick={() => setGrid("num")}>34→46</Button>
        <Button type="button" variant="outline" size="xs" onClick={() => setGrid("uni")}>Unique</Button>
      </div>
      {rows.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Choisissez une grille de tailles ci-dessus.</p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {rows.map((r, i) => (
            <div key={r.taille} className="text-center">
              <div className="mb-1 text-[10px] font-bold text-brand">{r.taille}</div>
              <input
                type="number"
                min={0}
                value={r.qte || ""}
                onChange={(e) => setQte(i, Number(e.target.value) || 0)}
                onFocus={(e) => e.target.select()}
                className="h-8 w-14 rounded-md border border-input bg-card text-center text-xs font-semibold outline-none focus:border-ring focus:ring-2 focus:ring-ring/40"
              />
            </div>
          ))}
        </div>
      )}
      <div className="mt-2 border-t border-border pt-2 text-xs">
        Total : <b className="text-base text-brand">{total}</b> pcs
      </div>
    </div>
  );
}
