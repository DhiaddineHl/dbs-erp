"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Divergence } from "@/lib/domain/facturation-commande";
import type { Soldee } from "@/lib/services/facturation-commande";
import * as F from "@/lib/actions/facturation-commande";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dec = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ═══════════ B3 · contrôle du prix façon ═══════════ */

/** Compare le prix façon des commandes à celui saisi sur les factures.
 *
 * En deux temps délibérément : on montre d'abord les écarts, on n'écrit que
 * si l'utilisateur le demande. Un écart peut venir d'une erreur sur la
 * facture autant que sur la commande — c'est à un humain de trancher. */
export function DialogPrixFacon({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [divergences, setDivergences] = useState<Divergence[] | null>(null);
  const [retenues, setRetenues] = useState<Set<number>>(new Set());

  const controler = () =>
    start(async () => {
      const r = await F.controlerPrixFacon();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const d = r.data ?? [];
      setDivergences(d);
      setRetenues(new Set(d.map((x) => x.commandeId)));
    });

  const aligner = () =>
    start(async () => {
      const choisies = (divergences ?? []).filter((d) => retenues.has(d.commandeId));
      const r = await F.alignerPrixFacon(choisies);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data ?? 0} commande(s) alignée(s) sur le prix de la facture`);
      onFermer();
      router.refresh();
    });

  const basculer = (id: number) =>
    setRetenues((p) => {
      const s = new Set(p);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      return s;
    });

  const impact = (divergences ?? [])
    .filter((d) => retenues.has(d.commandeId))
    .reduce((s, d) => s + Math.abs(d.ecart), 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>💶 Contrôle du prix façon</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Le prix façon porté par chaque commande est comparé à celui saisi sur la ligne de facture correspondante,
          archives comprises. <b>La facture fait foi</b> : c&apos;est elle qui a été envoyée et qui sert de base à la
          marge réalisée. Seule la sous-traitance est contrôlée — en interne il n&apos;y a pas de prix façon.
        </p>

        {divergences === null ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Button disabled={pending} onClick={controler}>
              Lancer le contrôle
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Aucune écriture n&apos;est faite à cette étape.</p>
          </div>
        ) : divergences.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            ✅ Aucun écart — les commandes et les factures portent le même prix façon.
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs">
              <b>{divergences.length}</b> écart(s) détecté(s) · {retenues.size} retenu(s) ·{" "}
              impact cumulé <b>{dec.format(impact)} €</b> par pièce
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5" />
                    <th className="px-2 py-1.5 text-left">OF</th>
                    <th className="px-2 py-1.5 text-left">Modèle</th>
                    <th className="px-2 py-1.5 text-left">Facture</th>
                    <th className="px-2 py-1.5 text-right">Commande</th>
                    <th className="px-2 py-1.5 text-right">Facture</th>
                    <th className="px-2 py-1.5 text-right">Écart</th>
                  </tr>
                </thead>
                <tbody>
                  {divergences.map((d) => (
                    <tr key={d.commandeId} className="border-t">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          checked={retenues.has(d.commandeId)}
                          onChange={() => basculer(d.commandeId)}
                        />
                      </td>
                      <td className="px-2 py-1.5 font-semibold text-brand">
                        {d.of}
                        {d.archivee && (
                          <StatusBadge tone="neutral">
                            <span className="text-[9px]">archivée</span>
                          </StatusBadge>
                        )}
                      </td>
                      <td className="px-2 py-1.5">{d.modele}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{d.numero}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {d.prixCommande == null ? "—" : `${dec.format(d.prixCommande)} €`}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
                        {d.prixFacture == null ? "—" : `${dec.format(d.prixFacture)} €`}
                      </td>
                      <td
                        className={`px-2 py-1.5 text-right font-bold tabular-nums ${
                          d.ecart < 0 ? "text-[var(--danger-d)]" : "text-success-foreground"
                        }`}
                      >
                        {d.ecart > 0 ? "+" : ""}
                        {dec.format(d.ecart)} €
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Fermer
          </Button>
          {divergences && divergences.length > 0 && (
            <Button disabled={pending || !retenues.size} onClick={aligner}>
              Aligner {retenues.size} commande(s) sur la facture
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ═══════════ B10 · purge des commandes soldées ═══════════ */

export function DialogPurge({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [soldees, setSoldees] = useState<Soldee[] | null>(null);

  const charger = () =>
    start(async () => {
      const r = await F.listerSoldees();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setSoldees(r.data ?? []);
    });

  const purger = (mode: "archiver" | "supprimer") =>
    start(async () => {
      const r = await F.purgerSoldees(mode);
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(
        mode === "archiver"
          ? `${r.data ?? 0} commande(s) archivée(s) — consultables dans Archives`
          : `${r.data ?? 0} commande(s) supprimée(s)`,
      );
      onFermer();
      router.refresh();
    });

  const ca = (soldees ?? []).reduce((s, c) => s + c.ca, 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>🧹 Purger les commandes soldées</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Sont soldées les commandes <b>intégralement</b> facturées, ou marquées livrées. Une commande facturée
          partiellement reste active : le reste est encore à produire.
        </p>

        {soldees === null ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Button disabled={pending} onClick={charger}>
              Chercher les commandes soldées
            </Button>
          </div>
        ) : soldees.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            Rien à purger — aucune commande active n&apos;est soldée.
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs">
              <b>{soldees.length}</b> commande(s) soldée(s) · CA total <b>{eur.format(ca)} €</b>
            </div>
            <div className="max-h-64 overflow-y-auto rounded-lg border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">OF</th>
                    <th className="px-2 py-1.5 text-left">Modèle</th>
                    <th className="px-2 py-1.5 text-left">Client</th>
                    <th className="px-2 py-1.5 text-right">Qté</th>
                    <th className="px-2 py-1.5 text-right">CA</th>
                  </tr>
                </thead>
                <tbody>
                  {soldees.map((c) => (
                    <tr key={c.id} className="border-t">
                      <td className="px-2 py-1.5 font-semibold text-brand">{c.of}</td>
                      <td className="px-2 py-1.5">{c.modele}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{c.client}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{nb.format(c.qte)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{eur.format(c.ca)} €</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="rounded-lg bg-muted px-3 py-2 text-[11px] leading-relaxed">
              <b>🗄 Archiver (recommandé)</b> : elles quittent les listes actives mais restent consultables dans
              Archives, avec leur historique.
              <br />
              <b>🗑 Supprimer</b> : effacement définitif de tous les modules — irréversible.
            </div>
          </>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          {soldees && soldees.length > 0 && (
            <>
              <Button
                variant="outline"
                className="border-[var(--danger)] text-[var(--danger-d)]"
                disabled={pending}
                onClick={() => purger("supprimer")}
              >
                🗑 Supprimer définitivement
              </Button>
              <Button disabled={pending} onClick={() => purger("archiver")}>
                🗄 Archiver tout
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
