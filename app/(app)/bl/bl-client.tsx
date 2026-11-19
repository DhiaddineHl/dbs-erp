"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Truck } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { STATUTS_BL, type StatutBl } from "@/lib/domain/aval";
import type { BlRow, CommandeAval as CommandeAvalBase } from "@/lib/services/aval";
import type { StockTaille } from "@/lib/domain/stock-taille";

/** Commande livrable, avec son stock par taille quand on le connaît. */
type CommandeAval = CommandeAvalBase & { tailles?: string[]; stockTaille?: StockTaille };
import * as A from "@/lib/actions/aval";
import { BoutonAction, Kpi, SelectAction, Tuiles } from "../aval/ui";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const auj = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

const OPTIONS_STATUT = (Object.keys(STATUTS_BL) as StatutBl[]).map((k) => ({
  value: k,
  label: STATUTS_BL[k].label,
}));

export function BlClient({
  bls,
  commandes,
  peutSaisir,
}: {
  bls: BlRow[];
  commandes: CommandeAval[];
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [creation, setCreation] = useState(false);
  const [ouvert, setOuvert] = useState<number | null>(null);

  const filtres = useMemo(() => {
    const n = q.trim().toLowerCase();
    return bls.filter(
      (b) =>
        (!statut || b.statut === statut) &&
        (!n || `${b.numero} ${b.clientNom} ${b.transporteur}`.toLowerCase().includes(n)),
    );
  }, [bls, q, statut]);

  const stats = useMemo(
    () => ({
      total: bls.length,
      brouillons: bls.filter((b) => b.statut === "draft").length,
      envoyes: bls.filter((b) => b.statut === "sent").length,
      pieces: bls.reduce((s, b) => s + b.totalQte, 0),
    }),
    [bls],
  );

  return (
    <>
      <PageHeader
        icon={Truck}
        title="Bons de livraison"
        description="Émission, suivi et impression des BL clients"
        actions={
          peutSaisir && (
            <Button size="sm" onClick={() => setCreation(true)}>
              + Nouveau bon de livraison
            </Button>
          )
        }
      />

      <Tuiles>
        <Kpi label="Bons de livraison" valeur={String(stats.total)} />
        <Kpi label="Brouillons" valeur={String(stats.brouillons)} tone="warning" />
        <Kpi label="Envoyés" valeur={String(stats.envoyes)} tone="purple" />
        <Kpi label="Pièces livrées" valeur={nb.format(stats.pieces)} tone="success" />
      </Tuiles>

      <SectionPanel
        title="Historique"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="N° BL, client, transporteur…"
              className="h-8 w-56 bg-card"
            />
            <select
              value={statut}
              onChange={(e) => setStatut(e.target.value)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            >
              <option value="">Tous les statuts</option>
              {OPTIONS_STATUT.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
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
                <th className="px-3 py-2 text-left">N° BL</th>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Client</th>
                <th className="px-3 py-2 text-left">Transporteur</th>
                <th className="px-3 py-2 text-right">Lignes</th>
                <th className="px-3 py-2 text-right">Pièces</th>
                <th className="px-3 py-2 text-right">Montant HT</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Aucun bon de livraison.
                  </td>
                </tr>
              ) : (
                filtres.map((b) => {
                  const s = STATUTS_BL[b.statut as StatutBl] ?? STATUTS_BL.draft;
                  const deplie = ouvert === b.id;
                  return (
                    <Fragment key={b.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <button
                            className="font-bold text-brand hover:underline"
                            onClick={() => setOuvert(deplie ? null : b.id)}
                          >
                            {deplie ? "▾" : "▸"} {b.numero}
                          </button>
                        </td>
                        <td className="px-3 py-2 tabular-nums">{dateFr(b.date)}</td>
                        <td className="px-3 py-2 font-semibold">{b.clientNom}</td>
                        <td className="px-3 py-2 text-muted-foreground">
                          {b.transporteur || "—"}
                          {b.suivi && <div className="font-mono text-[10.5px]">{b.suivi}</div>}
                          {peutSaisir && (
                            <button
                              className="text-[10.5px] font-semibold text-brand underline"
                              onClick={async () => {
                                const t = prompt("Transporteur (DHL, UPS…) :", b.transporteur || "DHL");
                                if (t == null) return;
                                const n = prompt("N° de suivi du colis (le client le verra sur son portail) :", b.suivi);
                                if (n == null) return;
                                const r = await A.majSuiviBl(b.id, t, n);
                                if (!r.ok) toast.error(r.error);
                                else router.refresh();
                              }}
                            >
                              {b.suivi ? "modifier le suivi" : "+ n° de suivi"}
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{b.lignes.length}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{nb.format(b.totalQte)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{eur.format(b.totalHt)} €</td>
                        <td className="px-3 py-2">
                          {peutSaisir ? (
                            <SelectAction
                              valeur={b.statut}
                              options={OPTIONS_STATUT}
                              onSave={(v) => A.majStatutBl(b.id, v)}
                            />
                          ) : (
                            <StatusBadge tone={s.tone}>{s.label}</StatusBadge>
                          )}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex justify-end gap-1.5">
                            <Button variant="outline" size="sm" render={<Link href={`/bl/${b.id}/imprimer`} />}>
                              🖨 Imprimer
                            </Button>
                            {peutSaisir && (
                              <BoutonAction
                                variant="ghost"
                                onRun={() => A.supprimerBl(b.id)}
                                confirmer={`Supprimer le bon de livraison ${b.numero} ?`}
                                succes="Bon de livraison supprimé"
                              >
                                🗑
                              </BoutonAction>
                            )}
                          </div>
                        </td>
                      </tr>
                      {deplie && (
                        <tr className="border-b bg-muted/25 last:border-0">
                          <td colSpan={9} className="px-3 py-3">
                            <table className="w-full text-[11px]">
                              <thead>
                                <tr className="text-[10px] uppercase text-muted-foreground">
                                  <th className="py-1 text-left">OF</th>
                                  <th className="py-1 text-left">Modèle</th>
                                  <th className="py-1 text-left">Référence</th>
                                  <th className="py-1 text-left">Couleur</th>
                                  <th className="py-1 text-right">Qté</th>
                                  <th className="py-1 text-right">PU</th>
                                  <th className="py-1 text-right">Montant</th>
                                </tr>
                              </thead>
                              <tbody>
                                {b.lignes.map((l) => (
                                  <tr key={l.id} className="border-t border-border/60">
                                    <td className="py-1 font-semibold">{l.of}</td>
                                    <td className="py-1">{l.modele}</td>
                                    <td className="py-1 text-muted-foreground">{l.refArticle || "—"}</td>
                                    <td className="py-1 text-muted-foreground">{l.couleur || "—"}</td>
                                    <td className="py-1 text-right tabular-nums">{nb.format(l.qteLivree)}</td>
                                    <td className="py-1 text-right tabular-nums">{eur.format(l.prixUnitaire)} €</td>
                                    <td className="py-1 text-right font-semibold tabular-nums">
                                      {eur.format(l.montant)} €
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                            {b.note && <p className="mt-2 text-[11px] text-muted-foreground">Note : {b.note}</p>}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {creation && <DialogCreation commandes={commandes} onFermer={() => setCreation(false)} />}
    </>
  );
}

/* ─────────── création ─────────── */

function DialogCreation({ commandes, onFermer }: { commandes: CommandeAval[]; onFermer: () => void }) {
  const router = useRouter();
  const [date, setDate] = useState(auj());
  const [client, setClient] = useState("");
  const [transporteur, setTransporteur] = useState("");
  const [suivi, setSuivi] = useState("");
  const [adresse, setAdresse] = useState("");
  const [note, setNote] = useState("");
  const [qtes, setQtes] = useState<Record<number, string>>({});
  /** Tailles livrées par ligne (facultatif ; pré-rempli quand on livre tout le stock rangé par taille). */
  const [tl, setTl] = useState<Record<number, Record<string, string>>>({});
  const [pending, start] = useTransition();

  // Un BL ne concerne qu'un client : on livre à une adresse à la fois.
  const clients = useMemo(
    () => [...new Set(commandes.map((c) => c.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")),
    [commandes],
  );

  const lignes = useMemo(
    () => commandes.filter((c) => c.client === client && !c.magasinExpedie),
    [commandes, client],
  );

  const choisir = (c: CommandeAval) => {
    const dedans = qtes[c.id] !== undefined;
    setQtes((p) => {
      const n = { ...p };
      if (dedans) delete n[c.id];
      else n[c.id] = String(c.livrable);
      return n;
    });
    // Tout le stock part et il est rangé par taille : les tailles sont reprises.
    const st = c.stockTaille;
    setTl((p) => {
      const n = { ...p };
      if (dedans) delete n[c.id];
      else if (st && st.nonVentile === 0 && Object.keys(st.parTaille).length && st.total === c.livrable)
        n[c.id] = Object.fromEntries(Object.entries(st.parTaille).map(([t, q]) => [t, String(q)]));
      return n;
    });
  };
  const sommeTl = (id: number) => Object.values(tl[id] ?? {}).reduce((s, x) => s + (Number(x) || 0), 0);

  const selection = lignes
    .filter((c) => qtes[c.id] !== undefined)
    .map((c) => ({ c, qte: sommeTl(c.id) > 0 ? sommeTl(c.id) : Math.max(0, Math.round(Number(qtes[c.id]) || 0)) }));
  const totalQte = selection.reduce((s, l) => s + l.qte, 0);
  const totalHt = selection.reduce((s, l) => s + l.qte * (l.c.prixVente ?? 0), 0);

  const clientId = lignes.find((c) => c.clientId !== null)?.clientId ?? null;

  return (
    <Dialog open onOpenChange={(o) => !o && onFermer()}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>🚚 Nouveau bon de livraison</DialogTitle>
        </DialogHeader>

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date *">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="Client *">
            <select
              value={client}
              onChange={(e) => {
                setClient(e.target.value);
                setQtes({});
              }}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            >
              <option value="">— Choisir —</option>
              {clients.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Champ>
          <Champ label="Transporteur">
            <input
              value={transporteur}
              onChange={(e) => setTransporteur(e.target.value)}
              placeholder="Transporteur, immatriculation…"
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="N° de suivi (DHL…)">
            <input
              value={suivi}
              onChange={(e) => setSuivi(e.target.value)}
              placeholder="Visible par le client sur son portail"
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
          <Champ label="Adresse de livraison">
            <input
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            />
          </Champ>
        </div>

        <div className="mt-1 max-h-72 overflow-y-auto rounded-lg border">
          {!client ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Choisissez un client pour voir ses commandes livrables.
            </p>
          ) : lignes.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">
              Aucune commande livrable pour ce client.
            </p>
          ) : (
            <table className="w-full text-[11px]">
              <thead className="sticky top-0 bg-muted/70 backdrop-blur">
                <tr className="text-[10px] uppercase text-muted-foreground">
                  <th className="px-2 py-1.5 text-left">OF / Modèle</th>
                  <th className="px-2 py-1.5 text-right">Commandé</th>
                  <th className="px-2 py-1.5 text-right">En stock</th>
                  <th className="px-2 py-1.5 text-right">PU</th>
                  <th className="px-2 py-1.5 text-right">Qté à livrer</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((c) => {
                  const coche = qtes[c.id] !== undefined;
                  return (
                    <Fragment key={c.id}>
                    <tr className={`border-t ${coche ? "bg-primary/5" : ""}`}>
                      <td className="px-2 py-1.5">
                        <label className="flex items-center gap-2">
                          <input type="checkbox" checked={coche} onChange={() => choisir(c)} />
                          <span>
                            <b className="text-brand">{c.of}</b> · {c.modele}
                            {c.couleur && <span className="text-muted-foreground"> · {c.couleur}</span>}
                            {/* Avertissement qualité (ne bloque pas) : dernier contrôle final. */}
                            {c.qcFinal === "refuse" && <span className="ml-1 rounded bg-[var(--danger-l)] px-1 text-[9.5px] font-bold text-[var(--danger-d)]">QC final refusé</span>}
                            {c.qcFinal === "reserve" && <span className="ml-1 rounded bg-warning-muted px-1 text-[9.5px] font-bold">QC sous réserve</span>}
                            {c.qcFinal === "" && <span className="ml-1 text-[9.5px] text-muted-foreground">(sans QC final)</span>}
                            {c.expedieQte > 0 && <span className="ml-1 text-[9.5px] text-muted-foreground">· déjà livré {nb.format(c.expedieQte)}</span>}
                          </span>
                        </label>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{nb.format(c.qte)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{nb.format(c.stockQte)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">
                        {c.prixVente == null ? "—" : `${eur.format(c.prixVente)} €`}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          value={sommeTl(c.id) > 0 ? String(sommeTl(c.id)) : (qtes[c.id] ?? "")}
                          disabled={!coche || sommeTl(c.id) > 0}
                          onChange={(e) => setQtes((p) => ({ ...p, [c.id]: e.target.value }))}
                          className="w-24 rounded border border-input bg-card px-1.5 py-1 text-right tabular-nums disabled:opacity-40"
                        />
                      </td>
                    </tr>
                    {coche && (c.tailles?.length ?? 0) > 0 && (
                      <tr className="bg-primary/5">
                        <td colSpan={5} className="px-2 pb-2">
                          <div className="flex flex-wrap items-end gap-1.5 pl-6">
                            <span className="pb-1 text-[10px] font-semibold text-muted-foreground">Par taille :</span>
                            {[...new Set([...(c.tailles ?? []), ...Object.keys(c.stockTaille?.parTaille ?? {})])].map((t) => (
                              <label key={t} className="flex flex-col items-center text-[10px] font-bold">
                                {t}
                                {c.stockTaille?.parTaille[t] != null && <span className="font-normal text-muted-foreground">stock {c.stockTaille.parTaille[t]}</span>}
                                <input
                                  inputMode="numeric"
                                  value={tl[c.id]?.[t] ?? ""}
                                  onChange={(e) => setTl((p) => ({ ...p, [c.id]: { ...(p[c.id] ?? {}), [t]: e.target.value.replace(/\D/g, "") } }))}
                                  className="h-7 w-12 rounded border border-input bg-card text-center"
                                />
                              </label>
                            ))}
                            <span className="pb-1 text-[10px] text-muted-foreground">facultatif — vide : ligne « sans taille »</span>
                          </div>
                        </td>
                      </tr>
                    )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <Champ label="Observations">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs"
          />
        </Champ>

        <div className="rounded-lg bg-muted px-3 py-2 text-xs">
          {selection.length} ligne(s) · <b>{nb.format(totalQte)}</b> pièces ·{" "}
          <b>{eur.format(Math.round(totalHt * 100) / 100)} €</b> HT
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button
            disabled={pending || !client || totalQte <= 0}
            onClick={() =>
              start(async () => {
                const r = await A.creerBl({
                  date,
                  clientId,
                  clientNom: client,
                  transporteur,
                  suivi,
                  adresseLivraison: adresse,
                  note,
                  lignes: selection.map((l) => ({ commandeId: l.c.id, qteLivree: l.qte, tailles: tl[l.c.id] ?? {} })),
                });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`Bon de livraison ${r.data?.numero} créé`);
                onFermer();
                router.refresh();
              })
            }
          >
            Créer le bon de livraison
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}
