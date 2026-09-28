"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { LigneOuverte, ReceptionFournituresRow } from "@/lib/services/fournitures";
import * as A from "@/lib/actions/fournitures";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

/* Réception par bon du client : on choisit le client, toutes les fournitures
 * attendues de ses commandes s'affichent (par commande / modèle), on tape ce
 * qui est arrivé — ou « = reste » en un clic — et on valide une fois. */
export function ReceptionFournitures({
  client,
  clients,
  lignes,
  historique,
  peutSaisir,
}: {
  client: string;
  clients: string[];
  lignes: LigneOuverte[];
  historique: ReceptionFournituresRow[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [bl, setBl] = useState("");
  const [note, setNote] = useState("");
  const [toutes, setToutes] = useState(false);
  const [q, setQ] = useState<Record<number, string>>({});

  const visibles = lignes.filter((l) => toutes || l.reste > 0);
  const parCommande = useMemo(() => {
    const m = new Map<number, { of: string; modele: string; couleur: string; lignes: LigneOuverte[] }>();
    for (const l of visibles) {
      const g = m.get(l.commandeId) ?? { of: l.of, modele: l.modele, couleur: l.couleur, lignes: [] };
      g.lignes.push(l);
      m.set(l.commandeId, g);
    }
    return [...m.entries()];
  }, [visibles]);
  const saisies = Object.entries(q).filter(([, v]) => Number(v.replace(",", ".")) > 0);

  const enregistrer = () =>
    start(async () => {
      const r = await A.creerReceptionFournitures({
        date,
        client,
        blClient: bl,
        note,
        lignes: saisies.map(([id, v]) => ({ ligneId: Number(id), qte: v })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Bon ${r.numero} enregistré — ${saisies.length} ligne(s) créditée(s)`);
      setQ({});
      setBl("");
      setNote("");
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <SectionPanel title="Nouveau bon de réception">
        <div className="grid gap-3 sm:grid-cols-4">
          <Champ label="Client">
            <select
              value={client}
              onChange={(e) => router.push(`/magfour/reception${e.target.value ? `?client=${encodeURIComponent(e.target.value)}` : ""}`)}
              className="h-9 w-full rounded-md border border-input bg-card px-2 text-sm"
            >
              <option value="">— Choisir le client —</option>
              {clients.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </Champ>
          <Champ label="N° BL du client">
            <Input value={bl} onChange={(e) => setBl(e.target.value)} className="bg-card" />
          </Champ>
          <Champ label="Date">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
          </Champ>
          <Champ label="Observations">
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="bg-card" />
          </Champ>
        </div>

        {!client ? (
          <div className="mt-4 text-xs text-muted-foreground">Choisissez le client : ses commandes en cours et leurs fournitures attendues s&apos;affichent.</div>
        ) : visibles.length === 0 ? (
          <div className="mt-4 text-xs text-muted-foreground">
            Aucune fourniture attendue pour {client}. Les lignes se créent depuis la fiche commande ou la nomenclature du modèle.{" "}
            <label className="ml-2">
              <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} /> afficher les lignes complètes
            </label>
          </div>
        ) : (
          <>
            <div className="mt-3 flex items-center gap-3 text-xs">
              <label className="flex items-center gap-1.5">
                <input type="checkbox" checked={toutes} onChange={(e) => setToutes(e.target.checked)} /> afficher aussi les lignes complètes
              </label>
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                onClick={() => setQ(Object.fromEntries(visibles.filter((l) => l.reste > 0).map((l) => [l.ligneId, String(l.reste)])))}
              >
                Tout reçu (= reste partout)
              </Button>
            </div>
            <div className="mt-2 space-y-3">
              {parCommande.map(([id, g]) => (
                <div key={id} className="rounded-lg border">
                  <div className="border-b bg-muted/30 px-3 py-1.5 text-xs">
                    <b>{g.of}</b> · {g.modele}
                    {g.couleur ? ` · ${g.couleur}` : ""}
                  </div>
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] uppercase text-muted-foreground">
                        <th className="px-3 py-1 text-left">Fourniture</th>
                        <th className="px-2 py-1 text-right">Prévu</th>
                        <th className="px-2 py-1 text-right">Déjà reçu</th>
                        <th className="px-2 py-1 text-right">Reste</th>
                        <th className="px-3 py-1 text-right">Reçu sur ce bon</th>
                      </tr>
                    </thead>
                    <tbody>
                      {g.lignes.map((l) => (
                        <tr key={l.ligneId} className="border-t">
                          <td className="px-3 py-1.5">
                            {l.designation || "—"} {l.origine === "dbs" && <StatusBadge tone="purple">DBS</StatusBadge>}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">
                            {nb.format(l.qtePrevue)} {l.unite}
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums">{nb.format(l.qteRecue)}</td>
                          <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${l.reste > 0 ? "text-[var(--danger-d)]" : "text-success-foreground"}`}>
                            {l.reste > 0 ? nb.format(l.reste) : "✓"}
                          </td>
                          <td className="px-3 py-1.5">
                            <div className="flex items-center justify-end gap-1">
                              <Input
                                value={q[l.ligneId] ?? ""}
                                disabled={!peutSaisir}
                                onChange={(e) => setQ((s) => ({ ...s, [l.ligneId]: e.target.value }))}
                                inputMode="decimal"
                                className="h-7 w-24 bg-card text-right"
                              />
                              {l.reste > 0 && peutSaisir && (
                                <button onClick={() => setQ((s) => ({ ...s, [l.ligneId]: String(l.reste) }))} className="rounded border px-1.5 py-0.5 text-[10px] font-semibold hover:bg-muted">
                                  = reste
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-end gap-2">
              <span className="text-[11px] text-muted-foreground">{saisies.length} ligne(s) renseignée(s)</span>
              <Button disabled={pending || !peutSaisir || !saisies.length} onClick={enregistrer}>
                {pending ? "Enregistrement…" : "Enregistrer le bon"}
              </Button>
            </div>
          </>
        )}
      </SectionPanel>

      <SectionPanel title={`Bons reçus (${historique.length})`} flush>
        {historique.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Aucun bon enregistré.</div>
        ) : (
          <div className="divide-y">
            {historique.map((r) => (
              <div key={r.id} className="px-3 py-2 text-xs">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono font-bold">{r.numero}</span>
                  <span className="text-muted-foreground">{dateFr(r.date)}</span>
                  <StatusBadge tone="info">{r.client || "—"}</StatusBadge>
                  {r.blClient && <span className="text-muted-foreground">BL {r.blClient}</span>}
                  <span className="text-muted-foreground">par {r.createdBy}</span>
                  {peutSaisir && (
                    <button
                      onClick={() =>
                        confirm(`Annuler le bon ${r.numero} ? Les quantités reçues seront retirées des commandes.`) &&
                        start(async () => {
                          const x = await A.supprimerReceptionFournitures(r.id);
                          if (!x.ok) toast.error(x.error);
                          else {
                            toast.success("Bon annulé");
                            router.refresh();
                          }
                        })
                      }
                      className="ml-auto rounded p-1 text-muted-foreground hover:bg-muted"
                      title="Annuler ce bon"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {r.lignes.map((l, i) => (
                    <span key={i} className="rounded border bg-muted/40 px-1.5 py-0.5">
                      {l.of} · {l.designation} · <b>{nb.format(l.qte)}</b> {l.unite}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
