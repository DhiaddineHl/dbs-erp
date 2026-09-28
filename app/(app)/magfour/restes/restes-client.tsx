"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { STATUTS_RESTE, type StatutReste } from "@/lib/domain/fournitures";
import type { LigneOuverte, ResteRow } from "@/lib/services/fournitures";
import * as A from "@/lib/actions/fournitures";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string | null) => (iso && /^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");
const cle = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

export function RestesClient({
  restes,
  clients,
  lignesOuvertes,
  peutSaisir,
}: {
  restes: ResteRow[];
  clients: string[];
  lignesOuvertes: LigneOuverte[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const enStock = restes.filter((r) => r.statut === "en_stock");
  const sortis = restes.filter((r) => r.statut !== "en_stock");
  const parClient = useMemo(() => {
    const m = new Map<string, ResteRow[]>();
    for (const r of enStock) m.set(r.client || "—", [...(m.get(r.client || "—") ?? []), r]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [enStock]);

  const executer = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, succes: string, apres?: () => void) =>
    start(async () => {
      const r = await fn();
      if (!r.ok) return void toast.error(r.error);
      toast.success(succes);
      apres?.();
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <SectionPanel title={`Restes en stock (${enStock.length})`}>
        {parClient.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Aucun reste. Sur la fiche d&apos;une commande, un excédent (reçu &gt; prévu) part en restes avec « → restes client ».
          </div>
        ) : (
          <div className="space-y-3">
            {parClient.map(([client, rs]) => {
              const choisis = rs.filter((r) => coches.has(r.id)).map((r) => r.id);
              return (
                <div key={client} className="rounded-lg border">
                  <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
                    <b>{client}</b>
                    <span className="text-muted-foreground">{rs.length} reste(s)</span>
                    {peutSaisir && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="ml-auto h-7"
                        disabled={pending}
                        onClick={() => {
                          const ids = choisis.length ? choisis : rs.map((r) => r.id);
                          if (!confirm(`Rendre ${ids.length} reste(s) à ${client} ? Un bon de retour sera créé.`)) return;
                          start(async () => {
                            const r = await A.rendreRestes(ids);
                            if (!r.ok) return void toast.error(r.error);
                            toast.success(`Bon de retour ${r.numero} créé`);
                            setCoches(new Set());
                            window.open(`/magfour/retour/${encodeURIComponent(r.numero)}`, "_blank");
                            router.refresh();
                          });
                        }}
                      >
                        ↩ Rendre au client {choisis.length ? `(${choisis.length})` : "(tout)"}
                      </Button>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {rs.map((r) => (
                        <LigneReste
                          key={r.id}
                          r={r}
                          coche={coches.has(r.id)}
                          onCoche={(v) =>
                            setCoches((s) => {
                              const x = new Set(s);
                              if (v) x.add(r.id);
                              else x.delete(r.id);
                              return x;
                            })
                          }
                          destinations={lignesOuvertes.filter((l) => cle(l.designation) === cle(r.designation) && l.unite === r.unite)}
                          autresDestinations={lignesOuvertes}
                          peutSaisir={peutSaisir}
                          executer={executer}
                        />
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
        {peutSaisir && <NouveauReste clients={clients} executer={executer} />}
      </SectionPanel>

      <SectionPanel title={`Historique (${sortis.length})`} flush>
        {sortis.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Rien de réutilisé ni rendu pour l&apos;instant.</div>
        ) : (
          <table className="w-full text-xs">
            <tbody>
              {sortis.map((r) => (
                <tr key={r.id} className="border-b last:border-0">
                  <td className="px-3 py-1.5">{dateFr(r.dateSortie)}</td>
                  <td className="px-2 py-1.5">{r.client}</td>
                  <td className="px-2 py-1.5">{r.designation}</td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {nb.format(r.qte)} {r.unite}
                  </td>
                  <td className="px-2 py-1.5">
                    <StatusBadge tone={r.statut === "rendu" ? "purple" : "success"}>{STATUTS_RESTE[r.statut as StatutReste] ?? r.statut}</StatusBadge>
                  </td>
                  <td className="px-3 py-1.5">
                    {r.statut === "rendu" ? (
                      <Link href={`/magfour/retour/${encodeURIComponent(r.destination)}`} target="_blank" className="font-semibold text-brand hover:underline">
                        {r.destination}
                      </Link>
                    ) : (
                      `→ ${r.destination}`
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </SectionPanel>
    </div>
  );
}

type Executer = (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, succes: string, apres?: () => void) => void;

function LigneReste({
  r,
  coche,
  onCoche,
  destinations,
  autresDestinations,
  peutSaisir,
  executer,
}: {
  r: ResteRow;
  coche: boolean;
  onCoche: (v: boolean) => void;
  destinations: LigneOuverte[];
  autresDestinations: LigneOuverte[];
  peutSaisir: boolean;
  executer: Executer;
}) {
  const [dest, setDest] = useState(destinations[0] ? String(destinations[0].ligneId) : "");
  const [qte, setQte] = useState(String(r.qte));
  const liste = destinations.length ? destinations : autresDestinations;
  return (
    <tr className="border-b align-middle last:border-0">
      <td className="w-8 px-3 py-1.5">{peutSaisir && <input type="checkbox" checked={coche} onChange={(e) => onCoche(e.target.checked)} />}</td>
      <td className="px-2 py-1.5">
        <b>{r.designation}</b>
        <div className="text-[10px] text-muted-foreground">
          de {r.origineOf || "—"} · {dateFr(r.date)}
          {r.note ? ` · ${r.note}` : ""}
        </div>
      </td>
      <td className="px-2 py-1.5 text-right font-semibold tabular-nums">
        {nb.format(r.qte)} {r.unite}
      </td>
      <td className="px-3 py-1.5">
        {peutSaisir && (
          <div className="flex flex-wrap items-center justify-end gap-1">
            <select value={dest} onChange={(e) => setDest(e.target.value)} className="h-7 max-w-64 rounded-md border border-input bg-card px-1 text-[11px]">
              <option value="">Réutiliser sur…</option>
              {liste.map((l) => (
                <option key={l.ligneId} value={l.ligneId}>
                  {l.of} · {l.designation} (manque {nb.format(l.reste)})
                </option>
              ))}
            </select>
            <Input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" className="h-7 w-20 bg-card text-right" />
            <Button size="sm" variant="outline" className="h-7" disabled={!dest} onClick={() => executer(() => A.reutiliserReste(r.id, Number(dest), qte), "Reste réutilisé")}>
              Réutiliser
            </Button>
            <button onClick={() => confirm("Supprimer ce reste (erreur de saisie) ?") && executer(() => A.supprimerReste(r.id), "Reste supprimé")} className="rounded p-1 text-muted-foreground hover:bg-muted">
              <Trash2 className="size-3.5" />
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

function NouveauReste({ clients, executer }: { clients: string[]; executer: Executer }) {
  const vide = { client: "", designation: "", unite: "pcs", qte: "", origineOf: "", note: "" };
  const [v, setV] = useState(vide);
  const set = (p: Partial<typeof v>) => setV((x) => ({ ...x, ...p }));
  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t pt-3 text-xs">
      <span className="font-semibold text-muted-foreground">+ Reste trouvé en magasin :</span>
      <input list="clients-restes" value={v.client} onChange={(e) => set({ client: e.target.value })} placeholder="Client" className="h-8 w-40 rounded-md border border-input bg-card px-2" />
      <datalist id="clients-restes">
        {clients.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <Input value={v.designation} onChange={(e) => set({ designation: e.target.value })} placeholder="Fourniture" className="h-8 w-48 bg-card" />
      <Input value={v.qte} onChange={(e) => set({ qte: e.target.value })} inputMode="decimal" placeholder="Qté" className="h-8 w-20 bg-card" />
      <Input value={v.unite} onChange={(e) => set({ unite: e.target.value })} className="h-8 w-16 bg-card" />
      <Input value={v.origineOf} onChange={(e) => set({ origineOf: e.target.value })} placeholder="OF d'origine" className="h-8 w-28 bg-card" />
      <Button size="sm" disabled={!v.client || !v.designation || !v.qte} onClick={() => executer(() => A.creerReste(v), "Reste enregistré", () => setV(vide))}>
        Ajouter
      </Button>
    </div>
  );
}
