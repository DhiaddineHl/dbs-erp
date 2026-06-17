"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Save, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { StatusBadge, type Tone } from "@/components/shared/status-badge";
import type { Opt } from "@/lib/modules/options";
import { toneOf, ecartTone } from "@/lib/modules/options";
import { updateEntity, deleteEntities } from "@/lib/actions/modules";
import type { EntityName } from "@/lib/services/modules";
import { cn } from "@/lib/utils";

/** Column kinds are all serialisable (pages are server components, so no render
 * functions can be passed). The table renders each cell from `kind`. */
export type EditColumn = {
  key: string;
  label: string;
  kind?: "text" | "number" | "select" | "status" | "badge" | "progress" | "readonly";
  /** status select options (label + tone tuple). */
  opts?: Opt[];
  /** plain select choices (client / façonnier / chaîne). */
  choices?: { value: string; label: string }[];
  className?: string;
  /** colour the displayed text. */
  accent?: "brand" | "success";
  strong?: boolean;
  align?: "right" | "center";
};

type Row = Record<string, unknown> & { id: number };

const toneText: Record<Tone, string> = {
  brand: "text-accent-foreground",
  success: "text-success-foreground",
  warning: "text-warning-foreground",
  danger: "text-[var(--danger-d)]",
  neutral: "text-muted-foreground",
  purple: "text-purple",
  info: "text-info",
};

const tupleLabel = (v: unknown) => (Array.isArray(v) ? String(v[1] ?? "") : "");
const tupleTone = (v: unknown) => (Array.isArray(v) ? (v[0] as Tone) : "neutral");

function searchText(row: Row): string {
  return Object.values(row)
    .map((v) => (Array.isArray(v) ? v[1] : v))
    .join(" ")
    .toLowerCase();
}

export function EditableTable({
  entity,
  columns,
  rows,
  searchPlaceholder = "Rechercher…",
}: {
  entity: EntityName;
  columns: EditColumn[];
  rows: Row[];
  searchPlaceholder?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [drafts, setDrafts] = useState<Record<number, Record<string, string>>>({});
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [pending, startTransition] = useTransition();

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((r) => searchText(r).includes(needle));
  }, [rows, q]);

  const dirtyIds = Object.keys(drafts).map(Number).filter((id) => Object.keys(drafts[id]).length);
  const cellValue = (row: Row, key: string, fallback: string) =>
    drafts[row.id]?.[key] ?? fallback;

  const setCell = (id: number, key: string, value: string) =>
    setDrafts((d) => ({ ...d, [id]: { ...(d[id] ?? {}), [key]: value } }));

  const toggleOne = (id: number, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  const allOn = filtered.length > 0 && filtered.every((r) => selected.has(r.id));
  const toggleAll = (on: boolean) =>
    setSelected(on ? new Set(filtered.map((r) => r.id)) : new Set());

  const save = () => {
    if (!dirtyIds.length) return;
    startTransition(async () => {
      for (const id of dirtyIds) {
        const res = await updateEntity(entity, id, drafts[id]);
        if (!res.ok) {
          toast.error(res.error || "Erreur");
          return;
        }
      }
      setDrafts({});
      toast.success(`${dirtyIds.length} ligne(s) enregistrée(s)`);
      router.refresh();
    });
  };

  const remove = (ids: number[]) => {
    if (!ids.length) return;
    if (!confirm(`Supprimer ${ids.length} ligne(s) ? Cette action est définitive.`)) return;
    startTransition(async () => {
      const res = await deleteEntities(entity, ids);
      if (!res.ok) {
        toast.error(res.error || "Erreur");
        return;
      }
      setSelected(new Set());
      setDrafts((d) => {
        const next = { ...d };
        for (const id of ids) delete next[id];
        return next;
      });
      toast.success(`${ids.length} ligne(s) supprimée(s)`);
      router.refresh();
    });
  };

  const editClass =
    "h-7 w-full min-w-0 rounded-md border border-input bg-card px-1.5 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 px-3 py-2.5">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={searchPlaceholder}
          className="h-8 w-64 bg-card"
        />
        <span className="text-[11px] text-muted-foreground">
          {filtered.length} / {rows.length}
        </span>
        {selected.size > 0 && (
          <Button
            variant="destructive"
            size="sm"
            className="ml-auto"
            disabled={pending}
            onClick={() => remove([...selected])}
          >
            <Trash2 /> Supprimer ({selected.size})
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead className="h-9 w-8 pl-3">
                <Checkbox
                  checked={allOn}
                  onCheckedChange={(v) => toggleAll(v === true)}
                  aria-label="Tout sélectionner"
                />
              </TableHead>
              {columns.map((c) => (
                <TableHead
                  key={c.key}
                  className={cn(
                    "h-9 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground",
                    c.align === "right" && "text-right",
                    c.align === "center" && "text-center",
                    c.className,
                  )}
                >
                  {c.label}
                </TableHead>
              ))}
              <TableHead className="h-9 w-12 text-right pr-3" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.length === 0 ? (
              <TableRow className="hover:bg-transparent">
                <TableCell colSpan={columns.length + 2} className="py-8 text-center text-xs text-muted-foreground">
                  Aucune ligne.
                </TableCell>
              </TableRow>
            ) : (
              filtered.map((row) => {
                const isDirty = !!drafts[row.id] && Object.keys(drafts[row.id]).length > 0;
                return (
                  <TableRow
                    key={row.id}
                    className={cn("hover:bg-accent/60", isDirty && "bg-warning-muted/40")}
                  >
                    <TableCell className="pl-3">
                      <Checkbox
                        checked={selected.has(row.id)}
                        onCheckedChange={(v) => toggleOne(row.id, v === true)}
                        aria-label="Sélectionner la ligne"
                      />
                    </TableCell>
                    {columns.map((c) => (
                      <TableCell
                        key={c.key}
                        className={cn(
                          "py-1.5 text-xs",
                          c.align === "right" && "text-right",
                          c.align === "center" && "text-center",
                          c.className,
                        )}
                      >
                        {renderCell(row, c, cellValue, setCell, editClass)}
                      </TableCell>
                    ))}
                    <TableCell className="py-1.5 pr-3 text-right">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        className="text-destructive hover:bg-destructive/10"
                        disabled={pending}
                        onClick={() => remove([row.id])}
                        aria-label="Supprimer"
                      >
                        <X />
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {dirtyIds.length > 0 && (
        <div className="sticky bottom-3 z-10 mx-auto mt-3 flex w-fit items-center gap-2 rounded-full border border-border bg-card px-3 py-2 shadow-lg">
          <span className="text-xs font-medium">{dirtyIds.length} modification(s) non enregistrée(s)</span>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => setDrafts({})}>
            Annuler
          </Button>
          <Button size="sm" disabled={pending} onClick={save}>
            <Save /> {pending ? "Enregistrement…" : "Enregistrer"}
          </Button>
        </div>
      )}
    </div>
  );
}

function renderCell(
  row: Row,
  c: EditColumn,
  cellValue: (row: Row, key: string, fallback: string) => string,
  setCell: (id: number, key: string, value: string) => void,
  editClass: string,
) {
  const kind = c.kind ?? "text";

  if (kind === "readonly") {
    return <span className={cn(c.strong && "font-semibold")}>{String(row[c.key] ?? "")}</span>;
  }

  if (kind === "badge") {
    const v = row[c.key];
    return <StatusBadge tone={tupleTone(v)}>{tupleLabel(v) || "—"}</StatusBadge>;
  }

  if (kind === "status") {
    const opts = c.opts ?? [];
    const current = cellValue(row, c.key, tupleLabel(row[c.key]));
    const tone = c.key === "ecart" ? ecartTone(current) : toneOf(opts, current);
    return (
      <select
        value={current}
        onChange={(e) => setCell(row.id, c.key, e.target.value)}
        className={cn(editClass, "font-semibold", toneText[tone])}
      >
        <option value="">—</option>
        {opts.map((o) => (
          <option key={o.label} value={o.label}>
            {o.label}
          </option>
        ))}
        {current && !opts.some((o) => o.label === current) && <option value={current}>{current}</option>}
      </select>
    );
  }

  if (kind === "select") {
    const choices = c.choices ?? [];
    const orig = row[c.key];
    const current = cellValue(row, c.key, orig == null ? "" : String(orig));
    return (
      <select
        value={current}
        onChange={(e) => setCell(row.id, c.key, e.target.value)}
        className={editClass}
      >
        <option value="">—</option>
        {choices.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
        {current && !choices.some((o) => o.value === current) && <option value={current}>{current}</option>}
      </select>
    );
  }

  if (kind === "progress") {
    const orig = row[c.key];
    const current = cellValue(row, c.key, orig == null ? "" : String(orig));
    const pct = Math.max(0, Math.min(100, Number(current) || 0));
    return (
      <div className="flex items-center gap-2">
        <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
        </div>
        <input
          type="number"
          value={current}
          onChange={(e) => setCell(row.id, c.key, e.target.value)}
          className={cn(editClass, "w-12 text-right")}
        />
      </div>
    );
  }

  // text / number
  const orig = row[c.key];
  const current = cellValue(row, c.key, orig == null ? "" : String(orig));
  return (
    <input
      type={kind === "number" ? "number" : "text"}
      value={current}
      onChange={(e) => setCell(row.id, c.key, e.target.value)}
      className={cn(
        editClass,
        kind === "number" && "text-right tabular-nums",
        c.strong && "font-semibold",
        c.accent === "brand" && "text-brand font-bold",
        c.accent === "success" && "text-success-foreground font-semibold",
      )}
    />
  );
}
