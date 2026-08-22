"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import * as A from "@/lib/actions/commandes";

/* Réunir des OF qui portent la même référence pour le même client.
 *
 * Le problème que cela règle est concret : la même référence arrive en
 * plusieurs OF — un réassort, une commande complétée, une répartition par
 * magasin — mais le tissu s'achète une fois. Tant que les OF restent
 * indépendants, le magasin saisit la même réception autant de fois qu'il y a
 * d'OF, ou l'oublie sur tous sauf un, et le besoin théorique de chacun ment
 * puisqu'il ne parle que de sa part.
 *
 * L'écran ne décide rien. Deux OF de la même référence peuvent devoir rester
 * séparés — livraisons distinctes, saisons différentes — et le rapprochement
 * n'est proposé qu'avec de quoi trancher : quantités, dates d'export, métrage
 * déjà reçu. */

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : "—");

export function DialogRegrouper({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [groupes, setGroupes] = useState<A.GroupeRegroupable[] | null>(null);
  const [erreur, setErreur] = useState("");
  /** Porteur retenu par groupe ; la proposition tient jusqu'à ce qu'on la change. */
  const [porteurs, setPorteurs] = useState<Record<string, number>>({});
  /** Groupes que l'opérateur a écartés — ils ne repartent pas à chaque ouverture. */
  const [ecartes, setEcartes] = useState<Set<string>>(new Set());

  useEffect(() => {
    let vivant = true;
    A.listerRegroupements().then((r) => {
      if (!vivant) return;
      if (r.ok) {
        setGroupes(r.data);
        setPorteurs(Object.fromEntries(r.data.map((g) => [g.cle, g.porteurId])));
      } else setErreur(r.error);
    });
    return () => {
      vivant = false;
    };
  }, []);

  const lier = (g: A.GroupeRegroupable) =>
    start(async () => {
      const porteurId = porteurs[g.cle] ?? g.porteurId;
      const r = await A.regrouperCommandes(
        porteurId,
        g.lignes.map((l) => l.id),
      );
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const porteur = g.lignes.find((l) => l.id === porteurId);
      toast.success(`${r.data} OF rattaché(s) à ${porteur?.of ?? "l'OF porteur"}`);
      setGroupes((prev) => (prev ?? []).filter((x) => x.cle !== g.cle));
      router.refresh();
    });

  const restants = (groupes ?? []).filter((g) => !ecartes.has(g.cle));

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="w-[95vw] max-w-[95vw] sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>🧩 Sous-commandes — OF à réunir</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Ces OF partagent un client et une référence : c&apos;est le même article, donc la même matière. Les réunir
          fait saisir la réception tissu <b>une seule fois sur l&apos;OF porteur</b>, pour le besoin théorique du
          groupe entier ; fournitures et contrôle qualité ne proposent plus que lui. La production, la livraison et la
          facturation restent par OF, et le lien se défait à tout moment.
        </p>

        <div className="max-h-[60vh] space-y-3 overflow-y-auto px-0.5">
          {erreur && <p className="text-xs text-[var(--danger-d)]">{erreur}</p>}
          {groupes === null && <p className="text-xs text-muted-foreground">Recherche des OF apparentés…</p>}
          {groupes !== null && restants.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Aucun OF à réunir : chaque référence n&apos;apparaît que sur une commande, ou les groupes existants sont
              déjà liés.
            </p>
          )}

          {restants.map((g) => {
            const porteurId = porteurs[g.cle] ?? g.porteurId;
            return (
              <div key={g.cle} className="rounded-lg border border-border">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b bg-muted/40 px-3 py-2">
                  <b className="text-xs">{g.cle}</b>
                  <StatusBadge tone="brand">
                    {g.lignes.length} OF · {nb.format(g.qte)} pcs
                  </StatusBadge>
                  <span className="ml-auto flex gap-1.5">
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setEcartes((p) => new Set(p).add(g.cle))}>
                      Ignorer
                    </Button>
                    <Button size="sm" className="h-7" disabled={pending} onClick={() => lier(g)}>
                      🔗 Lier ces {g.lignes.length} OF
                    </Button>
                  </span>
                </div>

                <table className="w-full text-[11px]">
                  <thead>
                    <tr className="text-[9.5px] uppercase tracking-wide text-muted-foreground">
                      <th className="w-16 px-2 py-1 text-center">Porteur</th>
                      <th className="px-2 py-1 text-left">N° OF</th>
                      <th className="px-2 py-1 text-left">Modèle</th>
                      <th className="w-20 px-2 py-1 text-right">Qté</th>
                      <th className="w-24 px-2 py-1 text-left">Export</th>
                      <th className="w-24 px-2 py-1 text-right">Tissu reçu</th>
                      <th className="w-28 px-2 py-1 text-left">Statut</th>
                    </tr>
                  </thead>
                  <tbody>
                    {g.lignes.map((l) => (
                      <tr
                        key={l.id}
                        className={`border-t ${l.id === porteurId ? "bg-accent/40 font-semibold" : ""}`}
                      >
                        <td className="px-2 py-1 text-center">
                          <input
                            type="radio"
                            name={`porteur-${g.cle}`}
                            checked={l.id === porteurId}
                            title="Cet OF portera la matière et le contrôle qualité du groupe"
                            onChange={() => setPorteurs((p) => ({ ...p, [g.cle]: l.id }))}
                          />
                        </td>
                        <td className="px-2 py-1 text-brand">{l.of}</td>
                        <td className="px-2 py-1">
                          {l.modele}
                          {l.couleur && <span className="text-muted-foreground"> — {l.couleur}</span>}
                        </td>
                        <td className="px-2 py-1 text-right tabular-nums">{nb.format(l.qte)}</td>
                        <td className="px-2 py-1 tabular-nums">{dateFr(l.dateExport)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">
                          {l.tissuRecu > 0 ? `${nb.format(l.tissuRecu)} m` : "—"}
                        </td>
                        <td className="px-2 py-1 text-muted-foreground">{l.statut}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <p className="border-t px-3 py-1.5 text-[10.5px] text-muted-foreground">
                  Porteur proposé : la plus grosse quantité — c&apos;est celle dont le besoin tissu est déjà le plus
                  juste, et celle que le magasin connaît. Vous pouvez en désigner un autre.
                </p>
              </div>
            );
          })}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Fermer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
