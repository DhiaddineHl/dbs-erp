"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { DEVISES, LISTE_DEVISES, type VueDevise, parseVueDevise } from "@/lib/domain/montants";

/** Lecture de la vue devise depuis l'URL (`?vue=TND`), côté client. */
export function useVueDevise(): VueDevise {
  return parseVueDevise(useSearchParams().get("vue"));
}

/* Choix de présentation du chiffre d'affaires : chaque devise à part (défaut)
 * ou tout converti dans une devise de référence. Le choix vit dans l'URL
 * (`?vue=TND`) : les pages serveur le lisent, un lien partagé garde la vue. */
export function VueDeviseSelect({ note }: { note?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const vue = parseVueDevise(params.get("vue"));
  const [pending, start] = useTransition();

  const choisir = (v: VueDevise) => {
    const p = new URLSearchParams(params.toString());
    if (v === "par-devise") p.delete("vue");
    else p.set("vue", v);
    const qs = p.toString();
    start(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  };

  const base = "px-2.5 py-1 text-[11px] font-semibold transition-colors";
  const actif = "bg-primary text-primary-foreground";
  const inactif = "bg-card text-muted-foreground hover:bg-muted";

  return (
    <div className="flex flex-wrap items-center gap-2 text-[11px]" aria-busy={pending}>
      <span className="font-semibold text-muted-foreground">Montants :</span>
      <div className="inline-flex overflow-hidden rounded-md border border-input">
        <button
          type="button"
          className={`${base} ${vue === "par-devise" ? actif : inactif}`}
          onClick={() => choisir("par-devise")}
        >
          Par devise
        </button>
        {LISTE_DEVISES.map((d) => (
          <button
            key={d}
            type="button"
            className={`${base} border-l border-input ${vue === d ? actif : inactif}`}
            onClick={() => choisir(d)}
            title={`Tout convertir en ${d} au taux de la date de chaque document`}
          >
            Converti en {d} ({DEVISES[d].symbole})
          </button>
        ))}
      </div>
      {vue !== "par-devise" && (
        <span className="text-muted-foreground">{note ?? "converti au taux de la date de chaque document"}</span>
      )}
    </div>
  );
}
