"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { annulerMouvement } from "@/lib/actions/tissu";
import { SENS, lieuSortie, type SensRouleau } from "@/lib/domain/rouleau";
import type { MouvementRouleauRow } from "@/lib/services/rouleaux";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateHeure = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const ANNULABLES = new Set(["sortie", "retour", "consommation", "chute", "rendu", "retour_fournisseur", "ajustement"]);

/** Chronologie d'un rouleau : rien ne s'efface, une annulation se voit. */
export function TimelineRouleau({ mouvements, unite, peutSaisir }: { mouvements: MouvementRouleauRow[]; unite: string; peutSaisir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const annulees = new Set(mouvements.filter((m) => m.sens === "annulation").map((m) => m.annuleId));
  return (
    <table className="w-full text-xs">
      <thead>
        <tr className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
          <th className="px-3 py-2 text-left">Date</th>
          <th className="px-3 py-2 text-left">Mouvement</th>
          <th className="px-3 py-2 text-right">Quantité</th>
          <th className="px-3 py-2 text-left">Avant → après</th>
          <th className="px-3 py-2 text-left">Commande · destination · motif</th>
          <th className="px-3 py-2 text-left">Par</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {[...mouvements].reverse().map((m) => {
          const s = SENS[m.sens as SensRouleau] ?? { label: m.sens, tone: "neutral" as const };
          return (
            <tr key={m.id} className={`border-b ${m.annule ? "text-muted-foreground line-through" : ""}`}>
              <td className="whitespace-nowrap px-3 py-1.5">{dateHeure(m.date)}</td>
              <td className="px-3 py-1.5">
                <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                {m.sens === "annulation" && <span className="ml-1 text-[10px]">du n° {m.annuleId}</span>}
              </td>
              <td className="px-3 py-1.5 text-right tabular-nums">
                {m.sens === "deplacement" || m.sens === "annulation" ? "" : `${m.sens === "ajustement" && m.quantite > 0 ? "+" : ""}${q2.format(m.quantite)} ${unite}`}
              </td>
              <td className="px-3 py-1.5 tabular-nums">{m.valeurAvant || m.valeurApres ? `${m.valeurAvant || "—"} → ${m.valeurApres || "—"}` : ""}</td>
              <td className="px-3 py-1.5">
                {[m.commandeLabel, m.destination && lieuSortie(m)].filter(Boolean).join(" · ")}
                {m.bon && (
                  <>
                    {" · "}
                    <Link href={`/magtissu/sortie/${encodeURIComponent(m.bon)}`} target="_blank" className="font-semibold underline">
                      {m.bon}
                    </Link>
                  </>
                )}
                {m.motif && (
                  <span className="text-muted-foreground">
                    {" "}
                    ·{" "}
                    {m.sens === "retour_fournisseur" || m.sens === "rendu" ? (
                      <Link href={`/magtissu/retour/${encodeURIComponent(m.motif)}`} target="_blank" className="underline">
                        {m.motif}
                      </Link>
                    ) : (
                      m.motif
                    )}
                  </span>
                )}
              </td>
              <td className="px-3 py-1.5">{m.par || "—"}</td>
              <td className="px-3 py-1.5 text-right">
                {peutSaisir && ANNULABLES.has(m.sens) && !annulees.has(m.id) && (
                  <button
                    disabled={pending}
                    className="text-[11px] font-semibold text-[var(--danger-d)] hover:underline"
                    onClick={() => {
                      const motif = prompt(`Annuler ce mouvement (${s.label} ${q2.format(m.quantite)} ${unite}) ?\nIl restera visible, barré. Motif obligatoire :`);
                      if (!motif?.trim()) return;
                      start(async () => {
                        const r = await annulerMouvement(m.id, motif);
                        if (!r.ok) return void toast.error(r.error);
                        toast.success("Mouvement annulé");
                        router.refresh();
                      });
                    }}
                  >
                    Annuler
                  </button>
                )}
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
