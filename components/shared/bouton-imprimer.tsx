"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Déclenche l'impression du navigateur : les pages « document » sont mises en
 * page pour l'impression, il n'y a pas de fenêtre à construire. */
export function BoutonImprimer({ label = "Imprimer / PDF" }: { label?: string }) {
  return (
    <Button size="sm" onClick={() => window.print()}>
      <Printer className="size-3.5" /> {label}
    </Button>
  );
}
