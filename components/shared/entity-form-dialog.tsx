"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import type { Field } from "@/lib/modules/forms";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Result = { ok: true } | { ok: false; error: string };

export function EntityFormDialog({
  triggerLabel,
  title,
  fields,
  action,
  successMessage = "Enregistré",
}: {
  triggerLabel: string;
  title: string;
  fields: Field[];
  /** Server action that inserts the row. */
  action: (data: Record<string, string>) => Promise<Result>;
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
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          {fields.map((f) => (
            <div key={f.name} className={`flex flex-col gap-1.5 ${f.full ? "col-span-2" : ""}`}>
              <Label className="text-[11px] font-semibold text-secondary-foreground">
                {f.label}
                {f.required && " *"}
              </Label>
              {f.type === "select" ? (
                <Select value={values[f.name] ?? ""} onValueChange={(v) => set(f.name, v ?? "")}>
                  <SelectTrigger className="bg-card">
                    <SelectValue placeholder="— choisir —" />
                  </SelectTrigger>
                  <SelectContent>
                    {(f.options ?? []).map((opt) => (
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
