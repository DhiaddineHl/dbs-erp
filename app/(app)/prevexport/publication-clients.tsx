"use client";

import { Fragment, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { CHANGEMENTS, ETATS_EXPORT, type Changement, type EtatExport } from "@/lib/domain/prevision-client";
import type { Brouillon } from "@/lib/services/prevision-client";
import * as A from "@/lib/actions/prevision-client";

/* Publier, chaque week-end, la prévision d'export des deux semaines à venir
 * aux clients (onglet « Prévision d'export » de leur portail). */

type Historique = { id: number; debut: string; fin: string; version: number; publieLe: string; publiePar: string; lignes: number; clients: number }[];
const fr = (iso: string | null) => (iso ? iso.slice(0, 10).split("-").reverse().join("/") : "—");
const quand = (iso: string) => new Date(iso).toLocaleString("fr-FR", { weekday: "long", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const TON: Record<Changement, "neutral" | "success" | "warning" | "danger" | "info"> = {
  nouvelle: "info",
  inchangee: "neutral",
  avancee: "success",
  reportee: "warning",
  quantite: "warning",
  retiree: "danger",
};

export function PublicationClients({ b, historique, peutPublier, weekEnd }: { b: Brouillon; historique: Historique; peutPublier: boolean; weekEnd: boolean }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [exclus, setExclus] = useState<number[]>([]);
  const [qtes, setQtes] = useState<Record<string, string>>({});
  const [commentaires, setCommentaires] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();
  const dejaPubliee = historique.find((h) => h.debut === b.debut);
  const nbLignes = b.clients.reduce((s, c) => s + c.lignes.filter((l) => l.changement !== "retiree").length, 0);

  return (
    <SectionPanel
      title={`📣 Prévision d'export aux clients — du ${fr(b.debut)} au ${fr(b.fin)}`}
      actions={
        <Button size="sm" variant={ouvert ? "outline" : "default"} onClick={() => setOuvert(!ouvert)}>
          {ouvert ? "Fermer" : dejaPubliee ? "Revoir / republier" : "Préparer la publication"}
        </Button>
      }
    >
      <div className="flex flex-wrap items-center gap-2 text-xs">
        {dejaPubliee ? (
          <StatusBadge tone="success">
            Publiée {quand(dejaPubliee.publieLe)} par {dejaPubliee.publiePar} (v{dejaPubliee.version})
          </StatusBadge>
        ) : (
          <StatusBadge tone={weekEnd ? "warning" : "neutral"}>{weekEnd ? "À publier ce week-end" : "Pas encore publiée"}</StatusBadge>
        )}
        <span className="text-muted-foreground">
          {`${nbLignes} commande(s) pour ${b.clients.length} client(s), d'après l'échéancier ci-dessous (date prévue, sinon contractuelle)`}
          {b.precedente ? ` · changements comparés à la publication du ${fr(b.precedente.debut)}.` : "."}
        </span>
      </div>

      {ouvert && (
        <div className="mt-3 space-y-4">
          {b.clients.length === 0 && <p className="text-xs text-muted-foreground">Aucune commande prévue à l&apos;export sur ces deux semaines.</p>}
          {b.clients.map((c) => (
            <div key={c.clientId} className="rounded-lg border">
              <div className="border-b bg-muted/40 px-3 py-2 text-sm font-black">{c.client}</div>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10.5px] uppercase text-muted-foreground">
                    <th className="w-8 px-2 py-1" />
                    <th className="px-2 py-1 text-left">Commande</th>
                    <th className="px-2 py-1 text-left">Date prévue</th>
                    <th className="px-2 py-1 text-right">Qté qui part</th>
                    <th className="px-2 py-1 text-left">État</th>
                    <th className="px-2 py-1 text-left">Changement</th>
                  </tr>
                </thead>
                <tbody>
                  {c.lignes.map((l) => {
                    const retiree = l.changement === "retiree";
                    const exclue = exclus.includes(l.commandeId);
                    return (
                      <tr key={`${l.commandeId}-${l.changement}`} className={`border-t ${exclue ? "opacity-40" : ""}`}>
                        <td className="px-2 py-1 text-center">
                          {!retiree && (
                            <input
                              type="checkbox"
                              title="Inclure dans la publication"
                              checked={!exclue}
                              onChange={(e) => setExclus(e.target.checked ? exclus.filter((x) => x !== l.commandeId) : [...exclus, l.commandeId])}
                            />
                          )}
                        </td>
                        <td className="px-2 py-1">
                          <b>{l.of}</b> · {l.modele} <span className="text-muted-foreground">{[l.reference, l.couleur].filter(Boolean).join(" · ")}</span>
                        </td>
                        <td className="px-2 py-1">{retiree ? <span className="text-muted-foreground">était le {fr(l.dateAvant)}</span> : fr(l.date)}</td>
                        <td className="px-2 py-1 text-right">
                          {retiree ? (
                            "—"
                          ) : (
                            <>
                              <input
                                inputMode="numeric"
                                value={qtes[l.commandeId] ?? String(l.qte)}
                                disabled={exclue}
                                onChange={(e) => setQtes({ ...qtes, [l.commandeId]: e.target.value.replace(/\D/g, "") })}
                                className="h-7 w-20 rounded-md border text-right font-bold"
                              />
                              <span className="text-muted-foreground"> / {l.qteCommande}</span>
                            </>
                          )}
                        </td>
                        <td className="px-2 py-1">{l.etat ? ETATS_EXPORT[l.etat as EtatExport] : ""}</td>
                        <td className="px-2 py-1">
                          <StatusBadge tone={TON[l.changement]}>
                            {CHANGEMENTS[l.changement]}
                            {l.changement === "reportee" || l.changement === "avancee" ? ` (était le ${fr(l.dateAvant)})` : ""}
                            {l.changement === "quantite" ? ` (était ${l.qteAvant})` : ""}
                          </StatusBadge>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              <div className="border-t px-3 py-2">
                <input
                  value={commentaires[c.clientId] ?? ""}
                  onChange={(e) => setCommentaires({ ...commentaires, [c.clientId]: e.target.value })}
                  placeholder="Votre mot pour ce client (facultatif) — ex. transport groupé vendredi"
                  className="h-8 w-full rounded-md border px-2 text-xs"
                />
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <span className="text-[11px] text-muted-foreground">
              Pour changer une DATE, modifiez la prévision dans l&apos;échéancier ci-dessous (elle reste la seule source), puis rouvrez ce panneau.
            </span>
            <Button
              disabled={pending || !peutPublier || b.clients.length === 0}
              onClick={() => {
                if (!confirm(`Publier la prévision du ${fr(b.debut)} au ${fr(b.fin)} aux clients ? Ils la verront sur leur portail.`)) return;
                start(async () => {
                  const r = await A.publierPrevision({
                    exclus,
                    qtes: Object.fromEntries(Object.entries(qtes).map(([k, v]) => [k, Number(v || 0)])),
                    commentaires: Object.fromEntries(Object.entries(commentaires).map(([k, v]) => [k, v])),
                  });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`Publiée : ${r.lignes} ligne(s) pour ${r.clients} client(s)`);
                  setOuvert(false);
                  router.refresh();
                });
              }}
            >
              📣 Publier aux clients
            </Button>
          </div>
          {!peutPublier && <p className="text-right text-[11px] text-muted-foreground">Publication réservée au responsable de production et à l&apos;administrateur.</p>}
        </div>
      )}

      {historique.length > 0 && (
        <details className="mt-3 text-xs">
          <summary className="cursor-pointer font-semibold text-muted-foreground">Publications précédentes ({historique.length})</summary>
          <table className="mt-1 w-full">
            <tbody>
              {historique.map((h) => (
                <Fragment key={h.id}>
                  <tr className="border-t">
                    <td className="py-1">
                      du {fr(h.debut)} au {fr(h.fin)} · v{h.version}
                    </td>
                    <td>{quand(h.publieLe)}</td>
                    <td>{h.publiePar}</td>
                    <td className="text-right">
                      {h.lignes} ligne(s) · {h.clients} client(s)
                    </td>
                  </tr>
                </Fragment>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </SectionPanel>
  );
}
