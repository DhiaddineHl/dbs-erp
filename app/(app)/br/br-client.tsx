"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PackageCheck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { CONTROLES_BR, type AlerteReception } from "@/lib/domain/aval";
import type { BrRow, CommandeAval } from "@/lib/services/aval";
import * as A from "@/lib/actions/aval";
import { Kpi, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const auj = () => new Date().toISOString().slice(0, 10);

export function BrClient({
  brs,
  commandes,
  peutSaisir,
}: {
  brs: BrRow[];
  commandes: CommandeAval[];
  peutSaisir: boolean;
}) {
  const [q, setQ] = useState("");

  const filtres = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return brs;
    return brs.filter((b) => `${b.numero} ${b.of} ${b.modele} ${b.faconnier} ${b.client}`.toLowerCase().includes(n));
  }, [brs, q]);

  const stats = useMemo(() => {
    const recu = brs.reduce((s, b) => s + b.qteRecue, 0);
    const nc = brs.reduce((s, b) => s + b.qteNc, 0);
    return {
      nb: brs.length,
      recu,
      nc,
      tauxNc: recu > 0 ? Math.round((nc / recu) * 1000) / 10 : 0,
      refuses: brs.filter((b) => b.controle === "refuse").length,
    };
  }, [brs]);

  return (
    <>
      <PageHeader
        icon={PackageCheck}
        title="Réception sous-traitance"
        description="Bons de réception façonniers — contrôle et entrée au stock produits finis"
        actions={peutSaisir && <DialogReception commandes={commandes} />}
      />

      <Tuiles>
        <Kpi label="Bons de réception" valeur={String(stats.nb)} />
        <Kpi label="Pièces reçues" valeur={nb.format(stats.recu)} tone="success" />
        <Kpi
          label="Non conformes"
          valeur={nb.format(stats.nc)}
          tone={stats.tauxNc >= 5 ? "danger" : "success"}
          sub={`${stats.tauxNc} % du reçu`}
        />
        <Kpi label="Lots refusés" valeur={String(stats.refuses)} tone={stats.refuses ? "danger" : "success"} />
      </Tuiles>

      <SectionPanel
        title="Bons de réception"
        actions={
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="BR, OF, façonnier…" className="h-8 w-60 bg-card" />
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">N° BR</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Façonnier</th>
                <th className="px-3 py-2 text-left">OF / Modèle</th>
                <th className="px-3 py-2 text-right">Reçu</th>
                <th className="px-3 py-2 text-right">Conforme</th>
                <th className="px-3 py-2 text-right">NC</th>
                <th className="px-3 py-2 text-left">Contrôle</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Aucun bon de réception.
                  </td>
                </tr>
              ) : (
                filtres.map((b) => {
                  const c = CONTROLES_BR.find((x) => x.value === b.controle) ?? CONTROLES_BR[0];
                  return (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-bold text-brand">{b.numero}</td>
                      <td className="px-3 py-2">{b.date}</td>
                      <td className="px-3 py-2">{b.faconnier || "—"}</td>
                      <td className="px-3 py-2">
                        <b>{b.of}</b>
                        <div className="text-[10px] text-muted-foreground">{b.modele}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{nb.format(b.qteRecue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success-foreground">{nb.format(b.qteOk)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">
                        {b.qteNc > 0 ? <b className="text-[var(--danger-d)]">{nb.format(b.qteNc)}</b> : "—"}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={c.tone}>{c.label}</StatusBadge>
                        {b.note && <div className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</div>}
                      </td>
                      <td className="px-3 py-2 text-center">
                        {peutSaisir && (
                          <BoutonSupprimer
                            onRun={() => A.supprimerBr(b.id)}
                            confirmer={`Supprimer le bon ${b.numero} ?\n\nLes ${nb.format(b.qteOk)} pièces entrées au stock seront retirées.`}
                          />
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
    </>
  );
}

function BoutonSupprimer({ onRun, confirmer }: { onRun: () => Promise<A.Result>; confirmer: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button
      disabled={pending}
      className="text-muted-foreground hover:text-[var(--danger-d)]"
      onClick={() => {
        if (!confirm(confirmer)) return;
        start(async () => {
          const r = await onRun();
          if (!r.ok) {
            toast.error(r.error);
            return;
          }
          toast.success("Bon supprimé — compteurs recalculés");
          router.refresh();
        });
      }}
    >
      ×
    </button>
  );
}

/* ─────────── saisie d'une réception ─────────── */

function DialogReception({ commandes }: { commandes: CommandeAval[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [faconnier, setFaconnier] = useState("");
  const [commandeId, setCommandeId] = useState("");
  const [date, setDate] = useState(auj());
  const [recue, setRecue] = useState("");
  const [conforme, setConforme] = useState("");
  const [nc, setNc] = useState("");
  const [controle, setControle] = useState("ok");
  const [note, setNote] = useState("");
  const [recus, setRecus] = useState<AlerteReception[]>([]);
  const [pending, start] = useTransition();

  /* Seules les commandes sous-traitées et non terminées sont réceptionnables. */
  const faconniers = useMemo(
    () => [...new Set(commandes.filter((c) => c.faconnier && c.produit < c.qte).map((c) => c.faconnier))].sort(),
    [commandes],
  );
  const disponibles = useMemo(
    () => commandes.filter((c) => c.faconnier === faconnier && c.produit < c.qte),
    [commandes, faconnier],
  );
  const choisie = disponibles.find((c) => String(c.id) === commandeId) ?? null;

  /* L'aperçu des contrôles suit la saisie, sans attendre l'enregistrement.
   * L'effet ne fait qu'appeler le serveur ; il ne remet pas la liste à zéro —
   * l'absence de saisie est une condition d'affichage, pas un état à stocker. */
  useEffect(() => {
    if (!choisie || !recue) return;
    let vivant = true;
    const t = setTimeout(async () => {
      const r = await A.verifierReception(
        choisie.id,
        Number(recue) || 0,
        Number(conforme || recue) || 0,
        Number(nc) || 0,
      );
      if (vivant && r.ok) setRecus(r.data ?? []);
    }, 250);
    return () => {
      vivant = false;
      clearTimeout(t);
    };
  }, [choisie, recue, conforme, nc]);

  const alertes = choisie && recue ? recus : [];
  const bloquant = alertes.find((a) => a.niveau === "bloquant");
  const avertissement = alertes.find((a) => a.niveau === "warn");

  const enregistrer = (forcer: boolean) =>
    start(async () => {
      if (!choisie) return;
      const r = await A.creerBr({
        commandeId: choisie.id, date, qteRecue: recue, qteOk: conforme || recue, qteNc: nc,
        controle, note, forcer,
      });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success(`${r.data!.numero} — ${nb.format(Number(conforme || recue))} pcs entrées au stock`);
      setOpen(false);
      setFaconnier("");
      setCommandeId("");
      setRecue("");
      setConforme("");
      setNc("");
      setNote("");
      router.refresh();
    });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" />}>+ Nouvelle réception</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>📥 Réception sous-traitance</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Façonnier *">
            <select
              value={faconnier}
              onChange={(e) => {
                setFaconnier(e.target.value);
                setCommandeId("");
              }}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            >
              <option value="">— Choisir —</option>
              {faconniers.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Date *">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="Commande *" large>
            <select
              value={commandeId}
              onChange={(e) => setCommandeId(e.target.value)}
              disabled={!faconnier}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs disabled:opacity-60"
            >
              <option value="">{faconnier ? "— Choisir —" : "Choisissez d'abord un façonnier"}</option>
              {disponibles.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.of} · {c.modele} (reste {nb.format(c.qte - c.produit)} pcs)
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Qté reçue *">
            <input
              type="number"
              value={recue}
              onChange={(e) => setRecue(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-right text-xs"
            />
          </Champ>
          <Champ label="Qté conforme">
            <input
              type="number"
              value={conforme}
              onChange={(e) => setConforme(e.target.value)}
              placeholder={recue || "= reçue"}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-right text-xs"
            />
          </Champ>
          <Champ label="Qté non conforme">
            <input
              type="number"
              value={nc}
              onChange={(e) => setNc(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-right text-xs"
            />
          </Champ>
          <Champ label="Contrôle">
            <select
              value={controle}
              onChange={(e) => setControle(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            >
              {CONTROLES_BR.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Observations" large>
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
        </div>

        {alertes.length > 0 && (
          <div className="flex flex-col gap-1.5">
            {alertes.map((a, i) => (
              <div
                key={i}
                className={`rounded-lg px-3 py-2 text-xs ${
                  a.niveau === "bloquant"
                    ? "border border-[var(--danger)] bg-[var(--danger-l)] text-[var(--danger-d)]"
                    : a.niveau === "warn"
                      ? "border border-warning bg-warning-muted"
                      : "bg-muted text-muted-foreground"
                }`}
              >
                {a.niveau === "bloquant" ? "⛔ " : a.niveau === "warn" ? "⚠ " : "📊 "}
                {a.message}
              </div>
            ))}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            disabled={pending || !choisie || !recue || !!bloquant}
            variant={avertissement ? "destructive" : "default"}
            onClick={() => enregistrer(!!avertissement)}
          >
            {avertissement ? "Enregistrer malgré l'avertissement" : "Enregistrer"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Champ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={large ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
