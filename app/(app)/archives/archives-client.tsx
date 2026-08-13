"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Archive } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { Affectation } from "@/lib/domain/aval";
import type { ArchiveRow } from "@/lib/services/aval";
import * as A from "@/lib/actions/aval";
import { Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

export function ArchivesClient({ archives, peutSaisir }: { archives: ArchiveRow[]; peutSaisir: boolean }) {
  const [q, setQ] = useState("");
  const [annee, setAnnee] = useState("");
  const [selection, setSelection] = useState<number[]>([]);
  const [rappro, setRappro] = useState(false);

  const annees = useMemo(
    () => [...new Set(archives.map((a) => (a.dateLivraison || a.dateExport).slice(0, 4)).filter(Boolean))].sort().reverse(),
    [archives],
  );

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return archives.filter(
      (a) =>
        (!annee || (a.dateLivraison || a.dateExport).startsWith(annee)) &&
        (!n || `${a.of} ${a.modele} ${a.client} ${a.refArticle} ${a.facNums.join(" ")}`.toLowerCase().includes(n)),
    );
  }, [archives, q, annee]);

  // Les totaux suivent le filtre : on veut le réalisé de la période affichée.
  const stats = useMemo(() => {
    const ca = filtrees.reduce((s, a) => s + a.ca, 0);
    const marge = filtrees.reduce((s, a) => s + a.marge, 0);
    const retards = filtrees.filter((a) => (a.retardExport ?? 0) > 0).length;
    return { nb: filtrees.length, ca, marge, pct: ca > 0 ? (marge / ca) * 100 : 0, retards };
  }, [filtrees]);

  const basculer = (id: number) =>
    setSelection((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));

  return (
    <>
      <PageHeader
        icon={Archive}
        title="Archives"
        description="Commandes soldées — délais réels, marges réalisées et factures rattachées"
        actions={
          peutSaisir && (
            <Button size="sm" variant="outline" onClick={() => setRappro(true)}>
              🔗 Rapprochement facturation
            </Button>
          )
        }
      />

      <Tuiles>
        <Kpi label="Commandes archivées" valeur={String(stats.nb)} />
        <Kpi label="CA réalisé" valeur={`${eur.format(stats.ca)} €`} tone="success" />
        <Kpi
          label="Marge réalisée"
          valeur={`${eur.format(stats.marge)} €`}
          tone="purple"
          sub={`${stats.pct.toFixed(1)} % du CA`}
        />
        <Kpi label="Livrées en retard" valeur={String(stats.retards)} tone={stats.retards ? "danger" : "neutral"} />
      </Tuiles>

      <SectionPanel
        title="Commandes archivées"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {selection.length > 0 && peutSaisir && (
              <DesarchiverBouton ids={selection} onFini={() => setSelection([])} />
            )}
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="OF, modèle, client, n° facture…"
              className="h-8 w-60 bg-card"
            />
            <select
              value={annee}
              onChange={(e) => setAnnee(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="">Toutes années</option>
              {annees.map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
          </div>
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                {peutSaisir && <th className="px-3 py-2" />}
                <th className="px-3 py-2 text-left">OF</th>
                <th className="px-3 py-2 text-left">Modèle / Client</th>
                <th className="px-3 py-2 text-right">Qté</th>
                <th className="px-3 py-2 text-left">Export prévu</th>
                <th className="px-3 py-2 text-left">Livré le</th>
                <th className="px-3 py-2 text-right">Retard</th>
                <th className="px-3 py-2 text-right">Cycle</th>
                <th className="px-3 py-2 text-right">CA</th>
                <th className="px-3 py-2 text-right">Marge</th>
                <th className="px-3 py-2 text-left">Factures</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr>
                  <td colSpan={peutSaisir ? 11 : 10} className="py-10 text-center text-muted-foreground">
                    Aucune commande archivée.
                  </td>
                </tr>
              ) : (
                filtrees.map((a) => (
                  <tr key={a.id} className="border-b last:border-0">
                    {peutSaisir && (
                      <td className="px-3 py-2">
                        <input
                          type="checkbox"
                          checked={selection.includes(a.id)}
                          onChange={() => basculer(a.id)}
                        />
                      </td>
                    )}
                    <td className="px-3 py-2 font-bold text-brand">{a.of}</td>
                    <td className="px-3 py-2">
                      <b>{a.modele}</b>
                      <div className="text-[10px] text-muted-foreground">
                        {a.client}
                        {a.faconnier && ` · ${a.faconnier}`}
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(a.qte)}</td>
                    <td className="px-3 py-2 tabular-nums">{dateFr(a.dateExport)}</td>
                    <td className="px-3 py-2 tabular-nums">{dateFr(a.dateLivraison || a.dateExportReel)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {a.retardExport == null ? (
                        "—"
                      ) : a.retardExport > 0 ? (
                        <b className="text-[var(--danger-d)]">+{a.retardExport} j</b>
                      ) : (
                        <span className="text-success-foreground">{a.retardExport} j</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                      {a.delaiCycle == null ? "—" : `${a.delaiCycle} j`}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{eur.format(a.ca)} €</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      <b className={a.marge >= 0 ? "text-success-foreground" : "text-[var(--danger-d)]"}>
                        {eur.format(a.marge)} €
                      </b>
                      <div className="text-[10px] text-muted-foreground">{a.margePct.toFixed(1)} %</div>
                    </td>
                    <td className="px-3 py-2">
                      {a.facNums.length === 0 ? (
                        <StatusBadge tone="warning">Non rattachée</StatusBadge>
                      ) : (
                        <span className="text-[11px]">{a.facNums.join(", ")}</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {rappro && <DialogRapprochement onFermer={() => setRappro(false)} />}
    </>
  );
}

function DesarchiverBouton({ ids, onFini }: { ids: number[]; onFini: () => void }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await A.desarchiver(ids);
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success(`${ids.length} commande(s) remise(s) en actif`);
          onFini();
          router.refresh();
        })
      }
    >
      ↺ Désarchiver ({ids.length})
    </Button>
  );
}

/* ─────────── rapprochement ───────────
 * Deux temps : on calcule d'abord ce qui changerait, on n'écrit qu'ensuite.
 * L'opération touche les quantités facturées de dizaines de commandes et en
 * archive une partie — elle ne doit pas partir sur un simple clic. */

function DialogRapprochement({ onFermer }: { onFermer: () => void }) {
  const router = useRouter();
  const [apercu, setApercu] = useState<Affectation[] | null>(null);
  const [pending, start] = useTransition();

  const lancerApercu = () =>
    start(async () => {
      const r = await A.apercuRapprochement();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      setApercu(r.data?.affectations ?? []);
    });

  const appliquer = () =>
    start(async () => {
      const r = await A.appliquerRapprochement();
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      const n = r.data?.affectations.length ?? 0;
      toast.success(`${n} commande(s) mise(s) à jour · ${r.data?.archivees ?? 0} archivée(s)`);
      onFermer();
      router.refresh();
    });

  const aArchiver = apercu?.filter((a) => a.complete).length ?? 0;

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>🔗 Rapprochement facturation</DialogTitle>
        </DialogHeader>

        <p className="text-xs text-muted-foreground">
          Pour chaque triplet client / modèle / référence, les quantités des lignes de facture sont réparties sur les
          commandes pas encore facturées, de la plus ancienne à la plus récente. Une commande intégralement facturée
          est archivée.
        </p>

        {apercu === null ? (
          <div className="rounded-lg border border-dashed px-4 py-8 text-center">
            <Button disabled={pending} onClick={lancerApercu}>
              Calculer l&apos;aperçu
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">Aucune écriture n&apos;est faite à cette étape.</p>
          </div>
        ) : apercu.length === 0 ? (
          <div className="rounded-lg bg-muted px-4 py-6 text-center text-xs">
            Tout est déjà rapproché — aucune commande à mettre à jour.
          </div>
        ) : (
          <>
            <div className="rounded-lg bg-muted px-3 py-2 text-xs">
              <b>{apercu.length}</b> commande(s) seraient mises à jour, dont <b>{aArchiver}</b> archivée(s).
            </div>
            <div className="max-h-80 overflow-y-auto rounded-lg border">
              <table className="w-full text-[11px]">
                <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                  <tr className="text-[10px] uppercase text-muted-foreground">
                    <th className="px-2 py-1.5 text-left">OF</th>
                    <th className="px-2 py-1.5 text-left">Modèle</th>
                    <th className="px-2 py-1.5 text-right">Facturé avant</th>
                    <th className="px-2 py-1.5 text-right">Après</th>
                    <th className="px-2 py-1.5 text-right">Commandé</th>
                    <th className="px-2 py-1.5 text-left">Factures</th>
                    <th className="px-2 py-1.5 text-left">Effet</th>
                  </tr>
                </thead>
                <tbody>
                  {apercu.map((a) => (
                    <tr key={a.commandeId} className="border-t">
                      <td className="px-2 py-1.5 font-semibold text-brand">{a.of}</td>
                      <td className="px-2 py-1.5">{a.modele}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">
                        {nb.format(a.avant)}
                      </td>
                      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{nb.format(a.apres)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{nb.format(a.qte)}</td>
                      <td className="px-2 py-1.5 text-muted-foreground">{a.numeros.join(", ") || "—"}</td>
                      <td className="px-2 py-1.5">
                        {a.complete ? (
                          <StatusBadge tone="success">Soldée → archivée</StatusBadge>
                        ) : (
                          <StatusBadge tone="warning">Partielle</StatusBadge>
                        )}
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
          {apercu !== null && apercu.length > 0 && (
            <Button disabled={pending} onClick={appliquer}>
              Appliquer le rapprochement
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
