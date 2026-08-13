"use client";

import { useEffect, useState } from "react";
import { ArrowRight } from "lucide-react";
import { DOMAINE_LABEL, type DomainePrepa } from "@/lib/domain/feux";
import { chargerJournal } from "@/lib/actions/preparation";

type Entree = Awaited<ReturnType<typeof chargerJournal>>[number];

const COULEUR_DOMAINE: Record<string, string> = {
  tds: "bg-purple-muted text-purple",
  tissu: "bg-accent text-brand",
  four: "bg-warning-muted text-warning-foreground",
  modelisme: "bg-success-muted text-success-foreground",
  nomen: "bg-muted text-muted-foreground",
  lancement: "bg-[var(--danger-l)] text-[var(--danger-d)]",
};

function dateHeure(iso: string) {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** Frise chronologique de la fiche, du plus récent au plus ancien. Chargée à
 * l'ouverture de la fiche : inutile de la transporter pour toutes les lignes. */
export function Journal({ commandeId, domaine }: { commandeId: number; domaine?: string }) {
  const [entrees, setEntrees] = useState<Entree[] | null>(null);

  useEffect(() => {
    let vivant = true;
    chargerJournal(commandeId, domaine)
      .then((r) => vivant && setEntrees(r))
      .catch(() => vivant && setEntrees([]));
    return () => {
      vivant = false;
    };
  }, [commandeId, domaine]);

  return (
    <details className="rounded-xl border bg-card">
      <summary className="cursor-pointer px-4 py-2.5 text-[12px] font-bold">
        🕓 Journal de la commande
        {domaine ? ` — ${DOMAINE_LABEL[domaine as DomainePrepa] ?? domaine}` : " (complet)"}
        {entrees && <span className="ml-1.5 font-normal text-muted-foreground">{entrees.length}</span>}
      </summary>

      <div className="max-h-80 overflow-y-auto border-t px-4 py-3">
        {entrees === null ? (
          <div className="py-2 text-xs text-muted-foreground">Chargement…</div>
        ) : entrees.length === 0 ? (
          <div className="py-2 text-xs text-muted-foreground">Aucun mouvement enregistré.</div>
        ) : (
          <ol className="flex flex-col gap-2.5">
            {entrees.map((e) => (
              <li key={e.id} className="flex gap-2.5 text-xs">
                <span
                  className={`mt-0.5 h-fit shrink-0 rounded px-1.5 py-0.5 text-[9.5px] font-bold uppercase ${COULEUR_DOMAINE[e.domaine] ?? "bg-muted"}`}
                >
                  {DOMAINE_LABEL[e.domaine as DomainePrepa] ?? e.domaine}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="font-semibold">{e.action}</div>
                  {e.detail && <div className="text-[11px] text-muted-foreground">{e.detail}</div>}
                  {(e.avant || e.apres) && (
                    <div className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-muted-foreground line-through">{e.avant || "∅"}</span>
                      <ArrowRight className="size-3 shrink-0 text-muted-foreground" />
                      <span className="font-semibold">{e.apres || "∅"}</span>
                    </div>
                  )}
                  <div className="mt-0.5 text-[10.5px] text-muted-foreground">
                    {dateHeure(e.ts)} · {e.par}
                    {e.role ? ` (${e.role})` : ""}
                  </div>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>
    </details>
  );
}
