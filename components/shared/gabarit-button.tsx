"use client";

import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Télécharge un fichier d'exemple montrant les colonnes attendues à l'import.
 *
 * Un gabarit vaut mieux qu'une notice : l'atelier ouvre le fichier, remplace
 * les deux lignes d'exemple par ses données et le renvoie tel quel. */
export function GabaritButton({
  nom,
  entetes,
  exemples,
  label = "Gabarit",
}: {
  /** Nom du fichier téléchargé, sans extension. */
  nom: string;
  entetes: string[];
  /** Une ou deux lignes d'exemple, dans l'ordre des en-têtes. */
  exemples: string[][];
  label?: string;
}) {
  const telecharger = () => {
    const lignes = [entetes, ...exemples].map((l) => l.join(";")).join("\n");
    // BOM : sans lui, Excel ouvre les accents en mojibake.
    const blob = new Blob(["﻿" + lignes + "\n"], { type: "text/csv;charset=utf-8;" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${nom}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  return (
    <Button variant="outline" size="sm" onClick={telecharger}>
      <FileDown className="size-4" /> {label}
    </Button>
  );
}
