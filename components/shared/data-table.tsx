import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";

export type Column = {
  label: string;
  className?: string;
};

export function DataTable({
  columns,
  rows,
  empty,
}: {
  columns: (string | Column)[];
  rows: React.ReactNode[][];
  empty?: React.ReactNode;
}) {
  const cols = columns.map((c) => (typeof c === "string" ? { label: c } : c));

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow className="hover:bg-transparent">
            {cols.map((c, i) => (
              <TableHead
                key={i}
                className={cn(
                  "h-9 whitespace-nowrap text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground",
                  c.className,
                )}
              >
                {c.label}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.length === 0 ? (
            <TableRow className="hover:bg-transparent">
              <TableCell colSpan={cols.length} className="p-0">
                {empty}
              </TableCell>
            </TableRow>
          ) : (
            rows.map((row, ri) => (
              <TableRow key={ri} className="hover:bg-accent/60">
                {row.map((cell, ci) => (
                  <TableCell
                    key={ci}
                    className={cn("py-2.5 text-xs", cols[ci]?.className)}
                  >
                    {cell}
                  </TableCell>
                ))}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
