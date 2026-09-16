"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { prochainIdentifiant } from "@/lib/domain/tissu";
import type { ReceptionRow } from "@/lib/services/tissu";
import { creerReception, supprimerReception, type SaisieLot } from "@/lib/actions/tissu";

const UNITES = ["m", "kg", "pcs", "rouleau"];
const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

type LigneLot = SaisieLot & { cle: number };
let compteur = 1;
const lotVide = (): LigneLot => ({ cle: compteur++, unite: "m" });

/* Bon de réception tissu — le point d'entrée physique du tissu.
 *
 * On peut saisir plusieurs lots d'un coup (réception globale : Aubergine +
 * Marine). L'identifiant de chaque lot est proposé automatiquement à partir de
 * la couleur (AUBER-01…) pour éviter les doublons, mais reste modifiable. */
export function ReceptionTissu({
  receptions,
  identifiantsExistants,
}: {
  receptions: ReceptionRow[];
  identifiantsExistants: string[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [fournisseur, setFournisseur] = useState("");
  const [client, setClient] = useState("");
  const [observations, setObservations] = useState("");
  const [lots, setLots] = useState<LigneLot[]>([lotVide()]);

  // Aperçu des identifiants qui seront attribués (couleur → AUBER-01…), en
  // tenant compte des lots déjà saisis dans ce même formulaire.
  const apercuIds = useMemo(() => {
    const pris = [...identifiantsExistants];
    return lots.map((l) => {
      if ((l.identifiant ?? "").trim()) {
        pris.push(l.identifiant!.trim().toUpperCase());
        return l.identifiant!.trim().toUpperCase();
      }
      const id = prochainIdentifiant(l.couleur ?? "", pris);
      pris.push(id);
      return id;
    });
  }, [lots, identifiantsExistants]);

  const setLot = (cle: number, champ: keyof SaisieLot, val: string) =>
    setLots((s) => s.map((l) => (l.cle === cle ? { ...l, [champ]: val } : l)));

  const enregistrer = () =>
    start(async () => {
      const r = await creerReception({ date, fournisseur, client, observations, lots });
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Bon de réception créé");
      setFournisseur("");
      setClient("");
      setObservations("");
      setLots([lotVide()]);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <SectionPanel title="Nouveau bon de réception tissu">
        <div className="grid gap-3 sm:grid-cols-4">
          <Champ label="Date de réception">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="bg-card" />
          </Champ>
          <Champ label="Fournisseur">
            <Input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Fournisseur tissu" className="bg-card" />
          </Champ>
          <Champ label="Client / donneur d'ordre">
            <Input value={client} onChange={(e) => setClient(e.target.value)} placeholder="Si tissu fourni par le client" className="bg-card" />
          </Champ>
          <Champ label="Observations">
            <Input value={observations} onChange={(e) => setObservations(e.target.value)} placeholder="Note libre" className="bg-card" />
          </Champ>
        </div>

        <div className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase text-muted-foreground">Lots reçus</span>
            <Button size="sm" variant="outline" onClick={() => setLots((s) => [...s, lotVide()])}>
              <Plus className="size-3.5" /> Ajouter un lot
            </Button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/30 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">Identifiant lot</th>
                  <th className="px-2 py-1.5 text-left">Couleur</th>
                  <th className="px-2 py-1.5 text-left">Référence</th>
                  <th className="px-2 py-1.5 text-center">Laize (cm)</th>
                  <th className="px-2 py-1.5 text-center">Quantité</th>
                  <th className="px-2 py-1.5 text-center">Unité</th>
                  <th className="px-2 py-1.5 text-center">Rouleaux</th>
                  <th className="px-2 py-1.5 text-left">Saison</th>
                  <th className="w-8" />
                </tr>
              </thead>
              <tbody>
                {lots.map((l, i) => (
                  <tr key={l.cle} className="border-b align-top">
                    <td className="px-2 py-1.5">
                      <Input
                        value={l.identifiant ?? ""}
                        onChange={(e) => setLot(l.cle, "identifiant", e.target.value)}
                        placeholder={apercuIds[i]}
                        className="h-8 bg-card font-mono"
                      />
                      {!(l.identifiant ?? "").trim() && (
                        <div className="mt-0.5 text-[10px] text-muted-foreground">auto : {apercuIds[i]}</div>
                      )}
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.couleur ?? ""} onChange={(e) => setLot(l.cle, "couleur", e.target.value)} placeholder="Aubergine" className="h-8 bg-card" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.reference ?? ""} onChange={(e) => setLot(l.cle, "reference", e.target.value)} placeholder="Réf." className="h-8 bg-card" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.laize ?? ""} onChange={(e) => setLot(l.cle, "laize", e.target.value)} inputMode="decimal" className="h-8 bg-card text-center" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.quantiteRecue ?? ""} onChange={(e) => setLot(l.cle, "quantiteRecue", e.target.value)} inputMode="decimal" placeholder="0" className="h-8 bg-card text-center font-semibold" />
                    </td>
                    <td className="px-2 py-1.5">
                      <select
                        value={l.unite ?? "m"}
                        onChange={(e) => setLot(l.cle, "unite", e.target.value)}
                        className="h-8 w-full rounded-md border border-input bg-card px-1 text-xs"
                      >
                        {UNITES.map((u) => (
                          <option key={u}>{u}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.nbRouleaux ?? ""} onChange={(e) => setLot(l.cle, "nbRouleaux", e.target.value)} inputMode="numeric" className="h-8 bg-card text-center" />
                    </td>
                    <td className="px-2 py-1.5">
                      <Input value={l.saison ?? ""} onChange={(e) => setLot(l.cle, "saison", e.target.value)} placeholder="PE26" className="h-8 bg-card" />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {lots.length > 1 && (
                        <button
                          type="button"
                          onClick={() => setLots((s) => s.filter((x) => x.cle !== l.cle))}
                          className="rounded p-1 text-muted-foreground hover:bg-muted"
                          title="Retirer ce lot"
                        >
                          <Trash2 className="size-3.5" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-3 flex items-center justify-end gap-2">
            <span className="text-[11px] text-muted-foreground">
              Chaque lot devient un stock identifiable et traçable.
            </span>
            <Button disabled={pending} onClick={enregistrer}>
              {pending ? "Enregistrement…" : "Enregistrer la réception"}
            </Button>
          </div>
        </div>
      </SectionPanel>

      {/* Historique des réceptions */}
      <SectionPanel title={`Réceptions récentes (${receptions.length})`} flush>
        {receptions.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">Aucune réception enregistrée.</div>
        ) : (
          <div className="divide-y">
            {receptions.slice(0, 25).map((r) => (
              <div key={r.id} className="px-3 py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-mono text-xs font-bold">{r.numero}</span>
                  <span className="text-xs text-muted-foreground">{dateFr(r.date)}</span>
                  {r.fournisseur && <span className="text-xs">· {r.fournisseur}</span>}
                  {r.client && <StatusBadge tone="info">{r.client}</StatusBadge>}
                  <span className="ml-auto text-xs text-muted-foreground">{r.lots.length} lot(s)</span>
                  <button
                    type="button"
                    onClick={() =>
                      start(async () => {
                        if (!confirm(`Supprimer le bon ${r.numero} et ses lots ?`)) return;
                        const res = await supprimerReception(r.id);
                        if (!res.ok) toast.error(res.error);
                        else {
                          toast.success("Réception supprimée");
                          router.refresh();
                        }
                      })
                    }
                    className="rounded p-1 text-muted-foreground hover:bg-muted"
                    title="Supprimer"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
                {r.lots.length > 0 && (
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {r.lots.map((l) => (
                      <span key={l.id} className="rounded-md border bg-muted/40 px-2 py-0.5 text-[11px]">
                        <b className="font-mono">{l.identifiant}</b> · {l.couleur || "—"} · {q2.format(l.quantiteRecue)} {l.unite}
                      </span>
                    ))}
                  </div>
                )}
                {r.observations && <div className="mt-1 text-[11px] text-muted-foreground">{r.observations}</div>}
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
