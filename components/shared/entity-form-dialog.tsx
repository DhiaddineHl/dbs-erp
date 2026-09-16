"use client";

import { useState, useTransition, cloneElement, isValidElement, type ReactElement } from "react";
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

type Valeurs = Record<string, string>;

/** Règles propres à un formulaire donné.
 *
 * Le dialogue reste générique — il ne connaît ni la marge ni la façon. Un
 * écran qui a des règles métier les fournit ici, et elles s'appliquent à
 * chaque frappe plutôt qu'à l'enregistrement : une saisie qu'on corrige au
 * moment de valider a déjà fait prendre une décision sur un chiffre faux. */
export type ReglesFormulaire = {
  /** Recalcule les valeurs après chaque changement. */
  ajuster?: (v: Valeurs) => Valeurs;
  /** Champs à verrouiller dans l'état courant : nom → raison affichée. */
  verrous?: (v: Valeurs) => Record<string, string>;
  /** Bandeau de synthèse rendu sous les champs. */
  apercu?: (v: Valeurs) => React.ReactNode;
  /** Bloc de saisie libre rendu à la suite des champs, dans le même
   * défilement et le même enregistrement.
   *
   * Il existe pour ce que la grille nom/valeur ne sait pas dire : une liste
   * de lignes répétables — les sous-commandes. Ce que le bloc produit revient
   * dans les valeurs du formulaire, sérialisé sous un nom de champ, donc
   * l'action serveur reste une action serveur ordinaire.
   *
   * Il ne remplace pas `fields` : un champ qui tient dans un libellé et une
   * valeur reste un champ, sinon chaque écran finirait par redessiner son
   * propre formulaire. */
  supplement?: (v: Valeurs, set: (nom: string, valeur: string) => void) => React.ReactNode;
  /** Refus avant envoi : message d'erreur, ou null quand la saisie tient. */
  valider?: (v: Valeurs) => string | null;
};

export function EntityFormDialog({
  triggerLabel,
  title,
  fields,
  action,
  dynamicOptions,
  regles,
  successMessage = "Enregistré",
  initialValues,
  trigger,
  submitLabel = "Enregistrer",
}: {
  triggerLabel: string;
  title: string;
  fields: Field[];
  /** Server action that inserts (or updates) the row. */
  action: (data: Valeurs) => Promise<Result>;
  /** Runtime dropdown sources for fields marked `dynamic` (keyed by field name). */
  dynamicOptions?: Record<string, Choice[]>;
  regles?: ReglesFormulaire;
  successMessage?: string;
  /** Pré-remplit le formulaire — pour un dialogue de modification plutôt que de création. */
  initialValues?: Valeurs;
  /** Élément déclencheur personnalisé (ex. un bouton icône « ✏️ Modifier » dans un tableau).
   * À défaut, le bouton « + triggerLabel » habituel est utilisé. */
  trigger?: ReactElement;
  /** Libellé du bouton de validation (« Enregistrer » par défaut, « Modifier » en édition…). */
  submitLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<Valeurs>(initialValues ?? {});
  const [pending, startTransition] = useTransition();

  const ouvrir = () => {
    setValues(initialValues ?? {});
    setOpen(true);
  };

  const set = (name: string, v: string) =>
    setValues((s) => {
      const next = { ...s, [name]: v };
      return regles?.ajuster ? regles.ajuster(next) : next;
    });

  const verrous = regles?.verrous?.(values) ?? {};

  const submit = () => {
    for (const f of fields) {
      if (f.required && !values[f.name]?.trim()) {
        toast.error(`« ${f.label} » est requis`);
        return;
      }
    }
    const refus = regles?.valider?.(values);
    if (refus) {
      toast.error(refus);
      return;
    }
    startTransition(async () => {
      const res = await action(values);
      if (res.ok) {
        toast.success(successMessage);
        setValues(initialValues ?? {});
        setOpen(false);
        router.refresh();
      } else {
        toast.error(res.error || "Erreur");
      }
    });
  };

  return (
    <>
      {trigger && isValidElement(trigger) ? (
        cloneElement(trigger, { onClick: ouvrir } as Record<string, unknown>)
      ) : (
        <Button size="sm" onClick={ouvrir}>
          <Plus className="size-4" /> {triggerLabel}
        </Button>
      )}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setValues(initialValues ?? {});
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
              {verrous[f.name] ? (
                /* Verrouillé : on montre la valeur imposée et pourquoi, plutôt
                 * que de masquer le champ — sinon l'utilisateur cherche où il
                 * est passé. */
                <>
                  <Input value={values[f.name] ?? ""} readOnly disabled className="bg-muted" />
                  <span className="text-[10.5px] text-muted-foreground">🔒 {verrous[f.name]}</span>
                </>
              ) : f.type === "tailles" ? (
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
          {regles?.supplement && <div className="col-span-2">{regles.supplement(values, set)}</div>}
        </div>
        {regles?.apercu?.(values)}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={pending}>
            Annuler
          </Button>
          <Button onClick={submit} disabled={pending}>
            {pending ? "Enregistrement…" : submitLabel}
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
