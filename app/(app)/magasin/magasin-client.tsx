"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Warehouse } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ETATS_MAGASIN } from "@/lib/domain/aval";
import type { CommandeAval } from "@/lib/services/aval";
import * as A from "@/lib/actions/aval";
import { BoutonAction, Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const auj = () => new Date().toISOString().slice(0, 10);

export function MagasinClient({
  commandes,
  peutSaisir,
}: {
  commandes: CommandeAval[];
  peutSaisir: boolean;
}) {
  const [q, setQ] = useState("");
  const [etat, setEtat] = useState("");
  const [reception, setReception] = useState<CommandeAval | null>(null);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return commandes.filter(
      (c) =>
        (!etat || c.etatMagasin === etat) &&
        (!n || `${c.of} ${c.modele} ${c.client} ${c.source}`.toLowerCase().includes(n)),
    );
  }, [commandes, q, etat]);

  const stats = useMemo(() => {
    const stock = commandes.reduce((s, c) => s + (c.magasinExpedie ? 0 : c.magasinQte), 0);
    return {
      nb: commandes.length,
      stock,
      aExpedier: commandes.filter((c) => c.magasinQte > 0 && !c.magasinExpedie).length,
      expediees: commandes.filter((c) => c.magasinExpedie).length,
    };
  }, [commandes]);

  return (
    <>
      <PageHeader
        icon={Warehouse}
        title="Magasin produits finis"
        description="Réception depuis la production, préparation export, expédition"
      />

      <Tuiles>
        <Kpi label="Commandes suivies" valeur={String(stats.nb)} />
        <Kpi label="Pièces en stock" valeur={nb.format(stats.stock)} tone="success" sub="hors expédiées" />
        <Kpi label="À expédier" valeur={String(stats.aExpedier)} tone="warning" />
        <Kpi label="Expédiées" valeur={String(stats.expediees)} tone="purple" />
      </Tuiles>

      <SectionPanel
        title="Stock par commande"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, modèle, client…" className="h-8 w-52 bg-card" />
            <select
              value={etat}
              onChange={(e) => setEtat(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="">Tous les états</option>
              {Object.entries(ETATS_MAGASIN).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
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
                <th className="px-3 py-2 text-left">OF</th>
                <th className="px-3 py-2 text-left">Modèle / Client</th>
                <th className="px-3 py-2 text-left">Source</th>
                <th className="px-3 py-2 text-right">Qté cmd</th>
                <th className="px-3 py-2 text-right">Reçu magasin</th>
                <th className="px-3 py-2 text-left">Avancement</th>
                <th className="px-3 py-2 text-left">État</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-muted-foreground">
                    Aucune commande.
                  </td>
                </tr>
              ) : (
                filtrees.map((c) => {
                  const e = ETATS_MAGASIN[c.etatMagasin];
                  const pct = c.qte > 0 ? Math.min(100, Math.round((c.magasinQte / c.qte) * 100)) : 0;
                  return (
                    <tr key={c.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-bold text-brand">{c.of}</td>
                      <td className="px-3 py-2">
                        <b>{c.modele}</b>
                        <div className="text-[10px] text-muted-foreground">{c.client}</div>
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{c.source}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.qte)}</td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{nb.format(c.magasinQte)}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-2">
                          <span className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                            <span className="block h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                          </span>
                          <span className="tabular-nums text-[11px]">{pct} %</span>
                        </div>
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                      </td>
                      <td className="px-3 py-2">
                        {peutSaisir && (
                          <div className="flex flex-wrap justify-end gap-1.5">
                            {!c.magasinExpedie && (
                              <Button variant="outline" size="sm" onClick={() => setReception(c)}>
                                📥 Réception
                              </Button>
                            )}
                            {c.magasinQte > 0 && !c.magasinPrepare && (
                              <BoutonAction onRun={() => A.marquerPrepare(c.id, true)} succes="Préparé — créez le BL">
                                📦 Préparer
                              </BoutonAction>
                            )}
                            {c.magasinPrepare && !c.magasinExpedie && (
                              <BoutonAction
                                variant="default"
                                onRun={() => A.marquerExpedie(c.id, true)}
                                succes="Expédié — passez à la facturation"
                              >
                                🚚 Expédier
                              </BoutonAction>
                            )}
                            {c.magasinExpedie && (
                              <BoutonAction
                                variant="ghost"
                                onRun={() => A.marquerExpedie(c.id, false)}
                                confirmer="Annuler l'expédition de cette commande ?"
                                succes="Expédition annulée"
                              >
                                ↺ Annuler
                              </BoutonAction>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {reception && (
        <DialogReception commande={reception} onFermer={() => setReception(null)} />
      )}
    </>
  );
}

function DialogReception({ commande, onFermer }: { commande: CommandeAval; onFermer: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(auj());
  const [qte, setQte] = useState("");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();
  const reste = Math.max(0, commande.qte - commande.magasinQte);

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>📥 Réception magasin — {commande.modele}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg bg-muted px-3 py-2 text-xs">
          Commandé <b>{nb.format(commande.qte)}</b> · déjà au magasin <b>{nb.format(commande.magasinQte)}</b> · reste{" "}
          <b className="text-[var(--danger-d)]">{nb.format(reste)}</b>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Quantité reçue *</label>
            <input
              type="number"
              value={qte}
              onChange={(e) => setQte(e.target.value)}
              placeholder={String(reste)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-right text-xs"
            />
          </div>
          <div className="sm:col-span-2">
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Observations</label>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || !qte}
            onClick={() =>
              start(async () => {
                const r = await A.receptionMagasin({ commandeId: commande.id, date, qte, note });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`${nb.format(Number(qte))} pcs entrées au stock`);
                onFermer();
                router.refresh();
              })
            }
          >
            Enregistrer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
