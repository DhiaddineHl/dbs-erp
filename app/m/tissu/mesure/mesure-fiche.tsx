"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { annulerEtiquette, type RouleauAMesurer } from "@/lib/actions/rouleaux";
import { FormMesure } from "./form-mesure";

/* Fiche d'un rouleau « à mesurer » ouverte au scan : on tape son métrage
 * (ou, si ce rouleau n'est jamais arrivé, on annule l'étiquette). Une fois
 * mesuré, la fiche se recharge d'elle-même et montre le rouleau en stock ;
 * la confirmation s'affiche en bandeau. */
export function MesureFiche({ rouleau, emplacements }: { rouleau: RouleauAMesurer; emplacements: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="space-y-2">
      <FormMesure
        rouleau={rouleau}
        emplacements={emplacements}
        onFait={(m) => {
          toast.success(`✔ ${m.code} : ${m.metrage} m en stock`, {
            description: `Lot ${m.lot} : ${m.total - m.restants}/${m.total} rouleaux mesurés`,
            action: { label: "📏 Suivant", onClick: () => router.push("/m/tissu/mesure") },
          });
          router.refresh();
        }}
      />
      <button
        disabled={pending}
        onClick={() => {
          const motif = prompt("Ce rouleau n'est pas arrivé (étiquette en trop) ?\nL'étiquette sera annulée — elle reste visible, barrée.\nMotif :");
          if (!motif?.trim()) return;
          start(async () => {
            const r = await annulerEtiquette(rouleau.code, motif);
            if (!r.ok) return void toast.error(r.error);
            toast.success(`Étiquette ${r.code} annulée`);
            router.refresh();
          });
        }}
        className="w-full rounded-2xl bg-white py-3 text-sm font-semibold text-slate-600"
      >
        ✕ Annuler cette étiquette (rouleau en moins)
      </button>
    </div>
  );
}
