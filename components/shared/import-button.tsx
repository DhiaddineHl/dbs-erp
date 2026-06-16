"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

type Result = { ok: true; count: number } | { ok: false; error: string };

export function ImportButton({
  action,
  label = "Importer",
}: {
  /** Server action that parses the uploaded file and bulk-inserts. */
  action: (formData: FormData) => Promise<Result>;
  label?: string;
}) {
  const router = useRouter();
  const ref = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    const fd = new FormData();
    fd.append("file", file);
    startTransition(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast.success(`${res.count} ligne(s) importée(s)`);
        router.refresh();
      } else {
        toast.error(res.error || "Import impossible");
      }
    });
  };

  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,.xlsx,.xls"
        className="hidden"
        onChange={onFile}
      />
      <Button variant="outline" size="sm" disabled={pending} onClick={() => ref.current?.click()}>
        <Upload className="size-4" /> {pending ? "Import…" : label}
      </Button>
    </>
  );
}
