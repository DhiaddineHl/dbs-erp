"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AchatFournisseur, DemandeClient } from "@/lib/domain/fournitures";
import type { Relance } from "@/lib/services/fournitures";
import * as A from "@/lib/actions/fournitures";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");

const NIVEAU = {
  retard: { label: "Export dépassé", tone: "danger" as const },
  urgent: { label: "À relancer", tone: "danger" as const },
  bientot: { label: "Bientôt", tone: "warning" as const },
};

export function ManquesClient({
  jours,
  relances,
  demandes,
  achats,
  peutSaisir,
}: {
  jours: number;
  relances: Relance[];
  demandes: DemandeClient[];
  achats: AchatFournisseur[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [j, setJ] = useState(String(jours));
  const nbRelances = relances.reduce((s, r) => s + r.commandes.length, 0);

  return (
    <div className="space-y-4">
      <SectionPanel
        title={`⏰ Relances — fournitures encore manquantes à moins de ${jours} jours de l'export (${nbRelances})`}
        actions={
          peutSaisir && (
            <div className="flex items-center gap-1.5 text-[11px]">
              Alerte à
              <Input value={j} onChange={(e) => setJ(e.target.value)} inputMode="numeric" className="h-7 w-14 bg-card text-center" />
              jours
              <Button
                size="sm"
                variant="outline"
                className="h-7"
                disabled={pending || j === String(jours)}
                onClick={() =>
                  start(async () => {
                    const r = await A.majJoursAlerte(j);
                    if (!r.ok) toast.error(r.error);
                    else {
                      toast.success("Délai d'alerte enregistré");
                      router.refresh();
                    }
                  })
                }
              >
                OK
              </Button>
            </div>
          )
        }
      >
        {relances.length === 0 ? (
          <div className="py-4 text-center text-xs text-muted-foreground">Rien à relancer : les commandes proches de l&apos;export ont leurs fournitures. ✓</div>
        ) : (
          <div className="space-y-3">
            {relances.map((r) => (
              <div key={r.client} className="rounded-lg border">
                <div className="flex items-center gap-2 border-b bg-muted/30 px-3 py-1.5 text-xs">
                  <b>{r.client}</b>
                  <span className="text-muted-foreground">{r.commandes.length} commande(s)</span>
                  <Link href={`/magfour/demande?client=${encodeURIComponent(r.client)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                    📨 Demande de complément
                  </Link>
                </div>
                <table className="w-full text-xs">
                  <tbody>
                    {r.commandes.map((c) => {
                      const niv = c.niveau ? NIVEAU[c.niveau] : null;
                      return (
                        <tr key={c.id} className="border-b align-top last:border-0">
                          <td className="w-40 px-3 py-1.5">
                            <b>{c.of}</b>
                            <div className="text-[10px] text-muted-foreground">{c.modele}</div>
                          </td>
                          <td className="w-36 px-2 py-1.5">
                            export {dateFr(c.dateExport)}
                            <div className="text-[10px] text-muted-foreground">
                              {c.joursRestants == null ? "" : c.joursRestants < 0 ? `dépassé de ${-c.joursRestants} j` : `dans ${c.joursRestants} j`}
                            </div>
                          </td>
                          <td className="w-28 px-2 py-1.5">{niv && <StatusBadge tone={niv.tone}>{niv.label}</StatusBadge>}</td>
                          <td className="px-2 py-1.5">
                            {c.manques.map((m, i) => (
                              <span key={i} className="mr-1.5 inline-block rounded border px-1.5 py-0.5">
                                {m.designation || "—"} : <b>{nb.format(m.manque)}</b> {m.unite}
                                {m.origine === "dbs" && " (achat DBS)"}
                              </span>
                            ))}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      <div className="grid gap-4 lg:grid-cols-2">
        <SectionPanel title={`📨 Fourni client — à demander (${demandes.length} client(s))`}>
          {demandes.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Aucun manque sur les fournitures des clients.</div>
          ) : (
            <div className="divide-y text-xs">
              {demandes.map((d) => (
                <div key={d.client} className="flex items-center gap-2 py-2">
                  <b>{d.client}</b>
                  <span className="text-muted-foreground">
                    {d.lignes.length} ligne(s) · {new Set(d.lignes.map((l) => l.of)).size} commande(s)
                  </span>
                  <Link href={`/magfour/demande?client=${encodeURIComponent(d.client)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                    🖨 Demande de complément
                  </Link>
                </div>
              ))}
            </div>
          )}
        </SectionPanel>

        <SectionPanel
          title={`🛒 Acheté DBS — liste d'achat (${achats.length} fournisseur(s))`}
          actions={
            achats.length > 0 && (
              <Link href="/magfour/achats" target="_blank" className="text-[11px] font-semibold text-brand hover:underline">
                🖨 Imprimer la liste d&apos;achat
              </Link>
            )
          }
        >
          {achats.length === 0 ? (
            <div className="py-4 text-center text-xs text-muted-foreground">Rien à acheter : aucune ligne « acheté DBS » en manque.</div>
          ) : (
            <div className="space-y-2 text-xs">
              {achats.map((f) => (
                <div key={f.fournisseur}>
                  <div className="font-bold">{f.fournisseur}</div>
                  {f.articles.map((a) => (
                    <div key={`${a.designation}-${a.unite}`} className="flex gap-2 pl-3">
                      <span className="flex-1">{a.designation}</span>
                      <b className="tabular-nums">
                        {nb.format(a.qte)} {a.unite}
                      </b>
                      <span className="w-40 truncate text-muted-foreground">{a.ofs.join(", ")}</span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </SectionPanel>
      </div>
    </div>
  );
}
