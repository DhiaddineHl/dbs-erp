"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Input } from "@/components/ui/input";
import type { CommandeIndex } from "@/lib/services/tracabilite";

/** Recherche d'un OF. La frise se charge côté serveur : le sélecteur ne fait
 * que naviguer, il ne transporte pas les données. */
export function Selecteur({ commandes, actif }: { commandes: CommandeIndex[]; actif: number | null }) {
  const router = useRouter();
  const [q, setQ] = useState("");

  const resultats = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return commandes.slice(0, 12);
    return commandes
      .filter((c) => `${c.of} ${c.modele} ${c.client} ${c.refArticle} ${c.couleur}`.toLowerCase().includes(n))
      .slice(0, 40);
  }, [commandes, q]);

  return (
    <div className="rounded-xl border bg-card">
      <div className="border-b p-3">
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un OF, un modèle, un client…"
          className="h-8 bg-background"
          autoFocus
        />
        {!q && <p className="mt-1.5 text-[10.5px] text-muted-foreground">12 commandes les plus récentes</p>}
      </div>
      <div className="max-h-[70vh] overflow-y-auto">
        {resultats.length === 0 ? (
          <p className="px-3 py-8 text-center text-xs text-muted-foreground">Aucun résultat.</p>
        ) : (
          resultats.map((c) => (
            <button
              key={c.id}
              onClick={() => router.push(`/tracabilite?of=${c.id}`)}
              className={`block w-full border-b px-3 py-2 text-left last:border-0 hover:bg-muted ${
                actif === c.id ? "bg-accent" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <b className="text-xs text-brand">{c.of}</b>
                {c.archived && <span className="text-[9.5px] uppercase text-muted-foreground">archivée</span>}
              </div>
              <div className="text-[11px]">{c.modele}</div>
              <div className="text-[10px] text-muted-foreground">
                {c.client}
                {c.couleur && ` · ${c.couleur}`}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
