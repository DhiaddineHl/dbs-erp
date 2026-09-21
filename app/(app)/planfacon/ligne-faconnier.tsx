"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { PlanFaconnier } from "@/lib/domain/aval";
import { libelleMoisExport } from "@/lib/domain/aval";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/* Ligne d'un façonnier dans le plan : cliquable pour DÉPLIER le détail des
 * commandes qui lui sont confiées (tirées directement des commandes, là où le
 * façonnier est attribué). Le total mensuel reste affiché comme avant. */
export function LigneFaconnier({ plan: p, mois }: { plan: PlanFaconnier; mois: string[] }) {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <tr className="border-b last:border-0 cursor-pointer hover:bg-accent/30" onClick={() => setOuvert((v) => !v)}>
        <td className="sticky left-0 z-10 bg-card px-3 py-2">
          <div className="flex items-center gap-1.5">
            {ouvert ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
            <b>{p.faconnier}</b>
          </div>
          <div className="pl-5 text-[10px] text-muted-foreground">
            {p.total.nbCommandes} commande(s) · {eur.format(p.total.ca)} € · cliquer pour le détail
          </div>
        </td>
        {mois.map((m) => {
          const c = p.parMois[m];
          return (
            <td key={m || "sansdate"} className="px-3 py-2 text-right">
              {!c ? (
                <span className="text-muted-foreground">—</span>
              ) : (
                <>
                  <div className="font-semibold tabular-nums">{nb.format(c.qte)}</div>
                  <div
                    className={`text-[10px] tabular-nums ${c.restant > 0 ? "text-[var(--danger-d)]" : "text-success-foreground"}`}
                  >
                    {c.restant > 0 ? `reste ${nb.format(c.restant)}` : "à jour"}
                  </div>
                </>
              )}
            </td>
          );
        })}
        <td className="px-3 py-2 text-right">
          <div className="font-bold tabular-nums">{nb.format(p.total.qte)}</div>
          <div className="text-[10px] tabular-nums text-muted-foreground">reste {nb.format(p.total.restant)}</div>
        </td>
      </tr>

      {ouvert && (
        <tr className="border-b bg-muted/20">
          <td colSpan={mois.length + 2} className="px-3 py-2">
            <div className="mb-1 pl-5 text-[10.5px] font-bold uppercase text-muted-foreground">
              Commandes confiées à {p.faconnier} ({p.commandes.length})
            </div>
            <div className="overflow-x-auto pl-5">
              <table className="w-full text-[11px]">
                <thead>
                  <tr className="border-b text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1 text-left">OF</th>
                    <th className="px-2 py-1 text-left">Modèle</th>
                    <th className="px-2 py-1 text-left">Référence</th>
                    <th className="px-2 py-1 text-left">Client</th>
                    <th className="px-2 py-1 text-left">Export</th>
                    <th className="px-2 py-1 text-right">Qté</th>
                    <th className="px-2 py-1 text-right">Produit</th>
                    <th className="px-2 py-1 text-right">Reste</th>
                    <th className="px-2 py-1 text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {p.commandes.map((c, i) => (
                    <tr key={`${c.of}-${i}`} className="border-b last:border-0">
                      <td className="px-2 py-1 font-semibold">{c.of || "—"}</td>
                      <td className="px-2 py-1">{c.modele || "—"}</td>
                      <td className="px-2 py-1">{c.ref || "—"}</td>
                      <td className="px-2 py-1">{c.client || "—"}</td>
                      <td className="px-2 py-1">{libelleMoisExport(c.mois)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{nb.format(c.qte)}</td>
                      <td className="px-2 py-1 text-right tabular-nums">{nb.format(c.produit)}</td>
                      <td
                        className={`px-2 py-1 text-right font-semibold tabular-nums ${c.restant > 0 ? "text-[var(--danger-d)]" : "text-success-foreground"}`}
                      >
                        {c.restant > 0 ? nb.format(c.restant) : "à jour"}
                      </td>
                      <td className="px-2 py-1 text-right tabular-nums">{eur.format(c.ca)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </td>
        </tr>
      )}
    </>
  );
}
