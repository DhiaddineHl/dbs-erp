"use client";

import { Archive, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { CLOTURE_LABEL, type Cloture } from "@/lib/domain/commande";

/* Bouton « commandes livrées / facturées » partagé par la nomenclature et les
 * magasins : par défaut elles sont rangées (masquées) pour alléger la vue ; un
 * clic les ressort, un autre les range. Rien n'est supprimé. */
export function BasculeRangees({ nombre, visibles, onChange }: { nombre: number; visibles: boolean; onChange: (v: boolean) => void }) {
  if (nombre === 0) return null;
  return (
    <button
      type="button"
      onClick={() => onChange(!visibles)}
      title={
        visibles
          ? "Ranger les commandes déjà livrées ou facturées (elles restent consultables)"
          : "Afficher aussi les commandes déjà livrées ou facturées"
      }
      className={cn(
        "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-[11px] font-semibold",
        visibles ? "border-amber-300 bg-amber-50 text-amber-900 hover:bg-amber-100" : "border-input text-muted-foreground hover:bg-muted",
      )}
    >
      {visibles ? <Archive className="size-3.5" /> : <Eye className="size-3.5" />}
      {visibles ? `Ranger les ${nombre} livrées / facturées` : `${nombre} livrée${nombre > 1 ? "s" : ""} / facturée${nombre > 1 ? "s" : ""} rangée${nombre > 1 ? "s" : ""}`}
    </button>
  );
}

/** Petite pastille « Livrée » / « Facturée » sur une ligne ressortie. */
export function PastilleCloture({ cloture }: { cloture: Cloture }) {
  if (!cloture) return null;
  return (
    <span className="ml-1 rounded bg-slate-200 px-1 py-px text-[9.5px] font-bold uppercase tracking-wide text-slate-700">
      {CLOTURE_LABEL[cloture]}
    </span>
  );
}
