"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { GroupeFusion } from "@/lib/services/referentiel";
import * as R from "@/lib/actions/referentiel";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

/** B17 · fusionne les fiches clients qui désignent la même société.
 *
 * Un doublon éclate le CA d'un client en deux, fait apparaître deux fois la
 * même société dans les listes déroulantes et fausse le classement du
 * portefeuille. La base reprise en contient au moins un réel.
 *
 * Rien n'est fusionné en masse : on traite un groupe à la fois, et le bouton
 * dit exactement ce qui va être déplacé. */
export function BoutonFusionClients() {
  const [ouvert, setOuvert] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        title="Regrouper les fiches qui désignent la même société"
        onClick={() => setOuvert(true)}
      >
        🔗 Fusionner les doublons
      </Button>
      {ouvert && <DialogFusion onFermer={() => setOuvert(false)} />}
    </>
  );
}

function DialogFusion({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [groupes, setGroupes] = useState<GroupeFusion[] | null>(null);
  /** Fiche retenue par groupe (index → id), pour pouvoir corriger le choix. */
  const [gardes, setGardes] = useState<Record<number, number>>({});
  const [faits, setFaits] = useState<Set<number>>(new Set());

  const chercher = () =>
    start(async () => {
      const r = await R.propositionsFusionClients();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setGroupes(r.data);
      setGardes(Object.fromEntries(r.data.map((g, i) => [i, g.garde.id])));
      setFaits(new Set());
    });

  const fusionner = (index: number) =>
    start(async () => {
      const g = groupes?.[index];
      if (!g) return;
      const gardeId = gardes[index] ?? g.garde.id;
      const absorbes = [g.garde, ...g.absorbes].filter((c) => c.id !== gardeId).map((c) => c.id);
      const r = await R.fusionnerClients(gardeId, absorbes);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const b = r.data;
      toast.success(
        `${b.fiches} fiche(s) absorbée(s) — ${b.commandes} commande(s), ${b.bls} BL et ${b.factures} facture(s) rattachés`,
      );
      setFaits((p) => new Set(p).add(index));
      router.refresh();
    });

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>🔗 Fusionner les fiches clients en double</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Un même client sur deux fiches, c&apos;est un CA coupé en deux et une liste déroulante ambiguë. La fiche
          conservée récupère <b>les commandes, les BL et les factures</b> des autres, ainsi que les coordonnées
          qui lui manquaient. <b>La fusion est définitive</b> — vérifiez qu&apos;il s&apos;agit bien de la même
          société avant de valider.
        </p>

        {groupes === null ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Button disabled={pending} onClick={chercher}>
              Chercher les doublons
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Aucune écriture n&apos;est faite à cette étape.</p>
          </div>
        ) : groupes.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            ✅ Aucun doublon — chaque société n&apos;a qu&apos;une fiche.
          </div>
        ) : (
          <div className="max-h-[26rem] space-y-3 overflow-y-auto">
            {groupes.map((g, i) => {
              const toutes = [g.garde, ...g.absorbes];
              const gardeId = gardes[i] ?? g.garde.id;
              const fait = faits.has(i);
              return (
                <div key={`${g.garde.id}`} className={`rounded-lg border ${fait ? "opacity-50" : ""}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/40 px-3 py-1.5">
                    <span className="text-[11px] font-semibold">
                      {toutes.length} fiches ·{" "}
                      <span className="font-normal text-muted-foreground">{g.motif}</span>
                    </span>
                    <StatusBadge tone={g.certitude === "identique" ? "success" : "warning"}>
                      {g.certitude === "identique" ? "Certain" : "À vérifier"}
                    </StatusBadge>
                  </div>

                  <table className="w-full text-[11px]">
                    <thead>
                      <tr className="text-[10px] uppercase text-muted-foreground">
                        <th className="px-2 py-1 text-left">Garder</th>
                        <th className="px-2 py-1 text-left">Code</th>
                        <th className="px-2 py-1 text-left">Raison sociale</th>
                        <th className="px-2 py-1 text-right">Commandes</th>
                        <th className="px-2 py-1 text-right">CA</th>
                      </tr>
                    </thead>
                    <tbody>
                      {toutes.map((c) => (
                        <tr key={c.id} className={`border-t ${c.id === gardeId ? "bg-accent/30" : ""}`}>
                          <td className="px-2 py-1">
                            <input
                              type="radio"
                              name={`garde-${i}`}
                              checked={c.id === gardeId}
                              disabled={fait}
                              onChange={() => setGardes((p) => ({ ...p, [i]: c.id }))}
                            />
                          </td>
                          <td className="px-2 py-1 text-muted-foreground">{c.code || "—"}</td>
                          <td className="px-2 py-1 font-semibold">{c.nom}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{nb.format(c.cmd)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">{eur.format(c.ca)} €</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>

                  <div className="flex items-center justify-between gap-2 border-t px-3 py-1.5">
                    <span className="text-[10.5px] text-muted-foreground">
                      {fait
                        ? "✅ Fusionnée"
                        : `Les ${toutes.length - 1} autre(s) fiche(s) seront supprimées après transfert.`}
                    </span>
                    <Button size="sm" className="h-6 text-[11px]" disabled={pending || fait} onClick={() => fusionner(i)}>
                      Fusionner ce groupe
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
