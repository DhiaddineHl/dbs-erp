"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Column } from "@/lib/modules/columns";

function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  // Quote when the value contains a delimiter, quote or newline.
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function ExportCsvButton({
  rows,
  columns,
  filename,
  label = "Export CSV",
}: {
  rows: Record<string, unknown>[];
  columns: Column[];
  filename: string;
  label?: string;
}) {
  const download = () => {
    const header = columns.map((c) => csvCell(c.label)).join(";");
    const body = rows.map((r) => columns.map((c) => csvCell(r[c.key])).join(";")).join("\n");
    // BOM so Excel opens accented UTF-8 correctly.
    const blob = new Blob(["﻿" + header + "\n" + body], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${filename}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Button variant="outline" size="sm" onClick={download} disabled={!rows.length}>
      <Download className="size-4" /> {label}
    </Button>
  );
}
