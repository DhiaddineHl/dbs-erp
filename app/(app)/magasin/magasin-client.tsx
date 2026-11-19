"use client";

import { Fragment, useMemo, useState } from "react";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aEntrerInterne, CONTROLES_BR, ETATS_MAGASIN } from "@/lib/domain/aval";
import { formatVentilation } from "@/lib/domain/stock-taille";
import type { BrRow, MouvementRow } from "@/lib/services/aval";
import type { CommandeMagasin, VueMagasin } from "@/lib/services/magasin-vue";
import * as A from "@/lib/actions/aval";
import { BoutonAction, Kpi, Tuiles } from "../aval/ui";
import { DialogEntreeInterne, DialogNc, DialogReceptionSt } from "./dialogs";

/* MAGASIN PRODUITS FINIS — rangé en 5 onglets, chacun répond à UNE question :
 *   Aujourd'hui   : qu'est-ce que je dois faire ?
 *   Par client    : qu'avons-nous en stock pour chaque client ?
 *   Par façonnier : qu'a-t-on reçu de chaque atelier, que reste-t-il chez lui ?
 *   Entrées       : réceptions façonniers, non conformes à décider ;
 *   Mouvements    : le journal.
 * Les chiffres et les actions sont les mêmes qu'avant (rien n'est supprimé) ;
 * le stock se lit maintenant aussi PAR TAILLE. */

export type Onglet = "aujourdhui" | "clients" | "facon" | "receptions" | "mouvements";

const nb = new Intl.NumberFormat("fr-FR");
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);
const auj = () => new Date().toISOString().slice(0, 10);
const plusJours = (n: number) => new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
const valeur = (c: CommandeMagasin) => c.stockQte * (c.prixVente ?? 0);
const sourceDe = (c: CommandeMagasin) => (c.faconnier ? c.faconnier : `Production interne${c.chaine ? ` · ${c.chaine}` : ""}`);

const QC: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  accepte: { label: "QC ✓", tone: "success" },
  reserve: { label: "QC réserve", tone: "warning" },
  refuse: { label: "QC ✗ refusé", tone: "danger" },
  "": { label: "sans QC final", tone: "neutral" },
};

type Dialogues = { onEntree: (c: CommandeMagasin) => void; onReceptionSt: (c: CommandeMagasin) => void };

export function MagasinClient({
  vue,
  peutSaisir,
  peutVoirValeur,
  ongletInitial,
}: {
  vue: VueMagasin;
  peutSaisir: boolean;
  /** Valeur du stock en € : direction seulement. */
  peutVoirValeur: boolean;
  ongletInitial: Onglet;
}) {
  const { commandes, brs, mouvements, annoncees } = vue;
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [receptionSt, setReceptionSt] = useState<{ c: CommandeMagasin | null } | null>(null);
  const [entree, setEntree] = useState<CommandeMagasin | null>(null);
  const [ncSeules, setNcSeules] = useState(false);

  const stats = useMemo(
    () => ({
      stock: commandes.reduce((s, c) => s + c.stockQte, 0),
      valeur: commandes.reduce((s, c) => s + valeur(c), 0),
      clients: new Set(commandes.filter((c) => c.stockQte > 0).map((c) => c.clientId ?? c.client)).size,
      aEntrer: commandes.reduce((s, c) => s + aEntrerInterne(c), 0),
      ncAttente: brs.reduce((s, b) => s + b.ncAttente, 0),
    }),
    [commandes, brs],
  );
  const dialogues: Dialogues = { onEntree: setEntree, onReceptionSt: (c) => setReceptionSt({ c }) };

  const ONGLETS: { id: Onglet; label: string }[] = [
    { id: "aujourdhui", label: "🏠 Aujourd'hui" },
    { id: "clients", label: "👔 Stock par client" },
    { id: "facon", label: "🧵 Par façonnier" },
    { id: "receptions", label: `📥 Entrées (${brs.length})` },
    { id: "mouvements", label: "🧾 Mouvements" },
  ];

  return (
    <>
      <PageHeader
        icon={Warehouse}
        title="Magasin produits finis"
        description="Ce qu'il y a en stock, pour qui, d'où ça vient — et ce qu'il faut faire aujourd'hui"
        actions={
          <div className="flex flex-wrap gap-2">
            <a href="/magasin/etat-stock" className={buttonVariants({ size: "sm", variant: "outline" })} title="Fichier Excel : état du stock par client, avec les tailles">
              ⬇ État du stock (Excel)
            </a>
            {peutSaisir && (
              <>
                <Link href="/magasin/qr" className={buttonVariants({ size: "sm", variant: "outline" })} title="Affiche à coller au magasin : saisie des réceptions au téléphone">
                  📱 QR saisie mobile
                </Link>
                <Button size="sm" variant="outline" onClick={() => setReceptionSt({ c: null })}>
                  📥 Réception façonnier
                </Button>
                <Link href="/bl" className={buttonVariants({ size: "sm" })}>
                  🚚 Bon de livraison
                </Link>
              </>
            )}
          </div>
        }
      />

      <Tuiles>
        <Kpi
          label="Pièces en stock"
          valeur={nb.format(stats.stock)}
          tone="success"
          sub={`${stats.clients} client(s)${peutVoirValeur && stats.valeur > 0 ? ` · ${eur.format(stats.valeur)}` : ""}`}
        />
        <Kpi label="Production interne à entrer" valeur={nb.format(stats.aEntrer)} tone={stats.aEntrer ? "brand" : "neutral"} sub="sortie des chaînes, pas encore au magasin" />
        <Kpi label="Livraisons d'ateliers annoncées" valeur={String(annoncees.length)} tone={annoncees.length ? "warning" : "neutral"} sub="à recevoir" />
        <Kpi label="Non conformes à décider" valeur={nb.format(stats.ncAttente)} tone={stats.ncAttente ? "danger" : "success"} sub="retouche ou rebut" />
      </Tuiles>

      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold ${onglet === o.id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"}`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "aujourdhui" && (
        <Aujourdhui
          vue={vue}
          peutSaisir={peutSaisir}
          dialogues={dialogues}
          versNc={() => {
            setNcSeules(true);
            setOnglet("receptions");
          }}
        />
      )}
      {onglet === "clients" && <ParClient commandes={commandes} peutSaisir={peutSaisir} peutVoirValeur={peutVoirValeur} dialogues={dialogues} />}
      {onglet === "facon" && <ParFaconnier commandes={commandes} brs={brs} peutSaisir={peutSaisir} peutVoirValeur={peutVoirValeur} dialogues={dialogues} />}
      {onglet === "receptions" && <OngletReceptions brs={brs} peutSaisir={peutSaisir} ncInitial={ncSeules} />}
      {onglet === "mouvements" && <OngletMouvements mouvements={mouvements} />}

      {receptionSt && <DialogReceptionSt commandes={commandes} initiale={receptionSt.c} onFermer={() => setReceptionSt(null)} />}
      {entree && <DialogEntreeInterne commande={entree} onFermer={() => setEntree(null)} />}
    </>
  );
}

/* ─────────── Aujourd'hui : la liste des choses à faire ─────────── */

function Aujourdhui({ vue, peutSaisir, dialogues, versNc }: { vue: VueMagasin; peutSaisir: boolean; dialogues: Dialogues; versNc: () => void }) {
  const { commandes, brs, annoncees } = vue;
  const aEntrer = commandes.filter((c) => aEntrerInterne(c) > 0);
  const nc = brs.filter((b) => b.ncAttente > 0);
  const aLivrer = commandes.filter((c) => c.magasinPrepare && c.stockQte > 0 && c.etatMagasin !== "expedie");
  const departs = commandes
    .filter((c) => c.etatMagasin !== "expedie" && c.datePlan && c.datePlan <= plusJours(7))
    .sort((a, b) => a.datePlan.localeCompare(b.datePlan));
  const rien = !aEntrer.length && !nc.length && !aLivrer.length && !departs.length && !annoncees.length;
  const Ligne = ({ children, action }: { children: React.ReactNode; action?: React.ReactNode }) => (
    <li className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2 last:border-0">
      <div className="text-xs">{children}</div>
      {action}
    </li>
  );
  return (
    <div className="space-y-4">
      {rien && (
        <SectionPanel title="Rien d'urgent">
          <p className="text-xs text-muted-foreground">Pas d&apos;entrée en attente, pas de livraison annoncée, pas de non conforme à décider, aucun départ dans les 7 jours.</p>
        </SectionPanel>
      )}
      {annoncees.length > 0 && (
        <SectionPanel title={`🚚 Livraisons annoncées par les ateliers (${annoncees.length}) — à recevoir`} flush>
          <ul>
            {annoncees.map((l) => (
              <Ligne
                key={l.numero}
                action={
                  <Link href={`/suivi_st/livraison/${encodeURIComponent(l.numero)}`} className={buttonVariants({ size: "sm" })}>
                    Recevoir
                  </Link>
                }
              >
                <b>{l.numero}</b> · {l.atelier} · {l.of} — <b>{nb.format(l.pieces)} pcs</b>
              </Ligne>
            ))}
          </ul>
        </SectionPanel>
      )}
      {aEntrer.length > 0 && (
        <SectionPanel title={`📥 Production interne à entrer au magasin (${aEntrer.length})`} flush>
          <ul>
            {aEntrer.map((c) => (
              <Ligne
                key={c.id}
                action={
                  peutSaisir && (
                    <Button size="sm" onClick={() => dialogues.onEntree(c)}>
                      📥 Entrer (par taille)
                    </Button>
                  )
                }
              >
                <b>{c.of}</b> · {c.modele} {c.couleur} · {c.client} — <b>{nb.format(aEntrerInterne(c))} pcs</b> sorties des chaînes, pas encore entrées
              </Ligne>
            ))}
          </ul>
        </SectionPanel>
      )}
      {nc.length > 0 && (
        <SectionPanel title={`⚠ Non conformes à décider (${nc.reduce((s, b) => s + b.ncAttente, 0)} pcs)`} flush>
          <ul>
            {nc.map((b) => (
              <Ligne
                key={b.id}
                action={
                  <Button size="sm" variant="outline" onClick={versNc}>
                    Décider
                  </Button>
                }
              >
                <b>{b.numero}</b> · {b.of} · {b.modele} · {b.faconnier || "interne"} — <b>{nb.format(b.ncAttente)} pcs</b> en attente (retouche ou rebut)
              </Ligne>
            ))}
          </ul>
        </SectionPanel>
      )}
      {aLivrer.length > 0 && (
        <SectionPanel title={`📦 Préparées : faire le bon de livraison (${aLivrer.length})`} flush>
          <ul>
            {aLivrer.map((c) => (
              <Ligne
                key={c.id}
                action={
                  <Link href="/bl" className={buttonVariants({ size: "sm", variant: "outline" })}>
                    🚚 Bon de livraison
                  </Link>
                }
              >
                <b>{c.of}</b> · {c.modele} {c.couleur} · {c.client} — <b>{nb.format(c.stockQte)} pcs</b> en stock
                {Object.keys(c.stockTaille.parTaille).length > 0 && <span className="text-muted-foreground"> ({formatVentilation(c.stockTaille.parTaille)})</span>}
              </Ligne>
            ))}
          </ul>
        </SectionPanel>
      )}
      {departs.length > 0 && (
        <SectionPanel title={`🗓 Départs prévus d'ici 7 jours (${departs.length})`} flush>
          <ul>
            {departs.map((c) => {
              const aPartir = Math.max(0, c.qte - c.expedieQte);
              const manque = Math.max(0, aPartir - c.stockQte);
              return (
                <Ligne key={c.id} action={<StatusBadge tone={manque ? "warning" : "success"}>{manque ? `il manque ${nb.format(manque)} pcs au stock` : "tout est en stock"}</StatusBadge>}>
                  <b className={c.datePlan < auj() ? "text-[var(--danger-d)]" : ""}>{dateFr(c.datePlan)}</b> · <b>{c.of}</b> · {c.modele} {c.couleur} · {c.client} — à partir{" "}
                  <b>{nb.format(aPartir)}</b>, en stock <b>{nb.format(c.stockQte)}</b>
                </Ligne>
              );
            })}
          </ul>
        </SectionPanel>
      )}
    </div>
  );
}

/* ─────────── filtres communs ─────────── */

type Vue = "stock" | "encours" | "toutes";
function useFiltres(commandes: CommandeMagasin[]) {
  const [q, setQ] = useState("");
  const [client, setClient] = useState("");
  const [source, setSource] = useState("");
  const [vue, setVue] = useState<Vue>("stock");
  const clients = useMemo(() => [...new Set(commandes.map((c) => c.client).filter(Boolean))].sort((a, b) => a.localeCompare(b, "fr")), [commandes]);
  const sources = useMemo(() => [...new Set(commandes.map(sourceDe))].sort((a, b) => a.localeCompare(b, "fr")), [commandes]);
  const vues = useMemo(() => {
    const n = q.trim().toLowerCase();
    return commandes.filter((c) => {
      if (n && !`${c.of} ${c.modele} ${c.refArticle} ${c.couleur} ${c.client} ${c.source}`.toLowerCase().includes(n)) return false;
      if (client && c.client !== client) return false;
      if (source && sourceDe(c) !== source) return false;
      if (vue === "stock") return c.stockQte > 0;
      if (vue === "encours") return c.etatMagasin !== "expedie";
      return true;
    });
  }, [commandes, q, client, source, vue]);
  const barre = (
    <div className="flex flex-wrap items-center gap-2">
      <select value={vue} onChange={(e) => setVue(e.target.value as Vue)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
        <option value="stock">Avec du stock</option>
        <option value="encours">Pas encore expédiées</option>
        <option value="toutes">Toutes</option>
      </select>
      <select value={client} onChange={(e) => setClient(e.target.value)} className="h-8 max-w-44 rounded-md border border-input bg-card px-2 text-xs">
        <option value="">Tous les clients</option>
        {clients.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
      <select value={source} onChange={(e) => setSource(e.target.value)} className="h-8 max-w-44 rounded-md border border-input bg-card px-2 text-xs">
        <option value="">Tous les façonniers</option>
        {sources.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
      <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, modèle, référence…" className="h-8 w-44 bg-card" />
    </div>
  );
  return { vues, barre };
}

/* ─────────── stock par client ─────────── */

function ParClient({ commandes, peutSaisir, peutVoirValeur, dialogues }: { commandes: CommandeMagasin[]; peutSaisir: boolean; peutVoirValeur: boolean; dialogues: Dialogues }) {
  const { vues, barre } = useFiltres(commandes);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const groupes = useMemo(() => {
    const m = new Map<string, CommandeMagasin[]>();
    for (const c of vues) m.set(c.client || "Sans client", [...(m.get(c.client || "Sans client") ?? []), c]);
    return [...m.entries()]
      .map(([client, cs]) => ({
        client,
        cs,
        stock: cs.reduce((s, c) => s + c.stockQte, 0),
        valeur: cs.reduce((s, c) => s + valeur(c), 0),
        prochain: cs.filter((c) => c.etatMagasin !== "expedie" && c.datePlan).map((c) => c.datePlan).sort()[0] ?? "",
        expedie: cs.reduce((s, c) => s + c.expedieQte, 0),
      }))
      .sort((a, b) => b.stock - a.stock || a.client.localeCompare(b.client, "fr"));
  }, [vues]);
  const total = groupes.reduce((s, g) => s + g.stock, 0);
  const totalValeur = groupes.reduce((s, g) => s + g.valeur, 0);
  return (
    <SectionPanel title={`Stock par client — ${nb.format(total)} pcs${peutVoirValeur && totalValeur ? ` · ${eur.format(totalValeur)}` : ""}`} actions={barre}>
      {groupes.length === 0 && <p className="py-6 text-center text-xs text-muted-foreground">Rien pour ces filtres.</p>}
      <div className="space-y-2">
        {groupes.map((g) => (
          <div key={g.client} className="rounded-lg border">
            <button onClick={() => setOuvert(ouvert === g.client ? null : g.client)} className="flex w-full flex-wrap items-center gap-x-6 gap-y-1 px-3 py-2.5 text-left hover:bg-muted/40">
              <span className="min-w-48 text-sm font-black">
                {ouvert === g.client ? "▾" : "▸"} {g.client}
              </span>
              <span className="text-xs">
                En stock <b className="text-base">{nb.format(g.stock)}</b> pcs
              </span>
              {peutVoirValeur && g.valeur > 0 && <span className="text-xs text-muted-foreground">{eur.format(g.valeur)}</span>}
              <span className="text-xs text-muted-foreground">{g.cs.length} commande(s)</span>
              <span className="text-xs text-muted-foreground">expédié {nb.format(g.expedie)} pcs</span>
              {g.prochain && <span className="text-xs">prochain départ {dateFr(g.prochain)}</span>}
              <a
                href={`/magasin/etat-stock?client=${encodeURIComponent(g.client)}`}
                onClick={(e) => e.stopPropagation()}
                className="ml-auto text-[11px] font-semibold text-brand underline"
              >
                ⬇ Excel
              </a>
            </button>
            {ouvert === g.client && <TableCommandes commandes={g.cs} peutSaisir={peutSaisir} dialogues={dialogues} />}
          </div>
        ))}
      </div>
    </SectionPanel>
  );
}

/* ─────────── par façonnier (provenance) ─────────── */

function ParFaconnier({
  commandes,
  brs,
  peutSaisir,
  peutVoirValeur,
  dialogues,
}: {
  commandes: CommandeMagasin[];
  brs: BrRow[];
  peutSaisir: boolean;
  peutVoirValeur: boolean;
  dialogues: Dialogues;
}) {
  const { vues, barre } = useFiltres(commandes);
  const [ouvert, setOuvert] = useState<string | null>(null);
  const lignes = useMemo(() => {
    const m = new Map<string, CommandeMagasin[]>();
    for (const c of vues) m.set(sourceDe(c), [...(m.get(sourceDe(c)) ?? []), c]);
    return [...m.entries()]
      .map(([source, cs]) => {
        const interne = !cs[0].faconnier;
        const ids = new Set(cs.map((c) => c.id));
        const sesBr = brs.filter((b) => ids.has(b.commandeId));
        const recu = sesBr.reduce((s, b) => s + b.qteRecue, 0);
        const ncRecu = sesBr.reduce((s, b) => s + b.qteNc, 0);
        // Encore chez l'atelier : coupé (sinon commandé) − reçu, sur ce qui n'est pas parti.
        const chezLui = interne
          ? 0
          : cs
              .filter((c) => c.etatMagasin !== "expedie")
              .reduce((s, c) => s + Math.max(0, (c.coupeQte || c.qte) - sesBr.filter((b) => b.commandeId === c.id).reduce((x, b) => x + b.qteRecue, 0)), 0);
        return {
          source,
          interne,
          cs,
          enCours: cs.filter((c) => c.etatMagasin !== "expedie").length,
          recu,
          ncAttente: sesBr.reduce((s, b) => s + b.ncAttente, 0),
          tauxNc: recu ? Math.round((ncRecu / recu) * 1000) / 10 : null,
          stock: cs.reduce((s, c) => s + c.stockQte, 0),
          valeur: cs.reduce((s, c) => s + valeur(c), 0),
          chezLui,
          aEntrer: cs.reduce((s, c) => s + aEntrerInterne(c), 0),
        };
      })
      .sort((a, b) => Number(a.interne) - Number(b.interne) || b.stock - a.stock);
  }, [vues, brs]);
  return (
    <SectionPanel title="Par façonnier — d'où vient le stock" actions={barre} flush>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
            <th className="px-3 py-2 text-left">Façonnier</th>
            <th className="px-3 py-2 text-right">Commandes en cours</th>
            <th className="px-3 py-2 text-right" title="Pièces reçues de lui (bons de réception)">Reçu de lui</th>
            <th className="px-3 py-2 text-right" title="Coupé (sinon commandé) moins reçu, sur les commandes pas encore parties">Encore chez lui</th>
            <th className="px-3 py-2 text-right">En stock chez nous</th>
            <th className="px-3 py-2 text-right">NC à décider</th>
            <th className="px-3 py-2 text-right">Taux NC</th>
          </tr>
        </thead>
        <tbody>
          {lignes.length === 0 && (
            <tr>
              <td colSpan={7} className="py-6 text-center text-muted-foreground">
                Rien pour ces filtres.
              </td>
            </tr>
          )}
          {lignes.map((l) => (
            <Fragment key={l.source}>
              <tr className="cursor-pointer border-b hover:bg-muted/30" onClick={() => setOuvert(ouvert === l.source ? null : l.source)}>
                <td className="px-3 py-2 font-bold">
                  {ouvert === l.source ? "▾" : "▸"} {l.source}
                </td>
                <td className="px-3 py-2 text-right">{l.enCours}</td>
                <td className="px-3 py-2 text-right">{l.interne ? <span className="text-muted-foreground">{l.aEntrer ? `${nb.format(l.aEntrer)} à entrer` : "—"}</span> : nb.format(l.recu)}</td>
                <td className="px-3 py-2 text-right">{l.interne ? "—" : nb.format(l.chezLui)}</td>
                <td className="px-3 py-2 text-right font-bold">
                  {nb.format(l.stock)}
                  {peutVoirValeur && l.valeur > 0 && <div className="text-[10px] font-normal text-muted-foreground">{eur.format(l.valeur)}</div>}
                </td>
                <td className={`px-3 py-2 text-right ${l.ncAttente ? "font-bold text-[var(--danger-d)]" : ""}`}>{l.ncAttente ? nb.format(l.ncAttente) : "—"}</td>
                <td className="px-3 py-2 text-right">
                  {l.tauxNc == null ? "—" : <StatusBadge tone={l.tauxNc > 5 ? "danger" : l.tauxNc > 2 ? "warning" : "success"}>{l.tauxNc} %</StatusBadge>}
                </td>
              </tr>
              {ouvert === l.source && (
                <tr className="border-b bg-muted/10">
                  <td colSpan={7} className="p-2">
                    <TableCommandes commandes={l.cs} peutSaisir={peutSaisir} dialogues={dialogues} />
                  </td>
                </tr>
              )}
            </Fragment>
          ))}
        </tbody>
      </table>
      <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Vue interne : rien de cette page n&apos;est montré aux clients. « Encore chez lui » = coupé (sinon commandé) moins ce qu&apos;on a reçu de lui, sur les commandes pas
        encore parties.
      </p>
    </SectionPanel>
  );
}

/* ─────────── la table des commandes, allégée ─────────── */

function actionPrincipale(c: CommandeMagasin): "entrer" | "recevoir" | "preparer" | "bl" | null {
  if (c.etatMagasin === "expedie") return null;
  if (!c.faconnier && aEntrerInterne(c) > 0) return "entrer";
  if (c.faconnier && c.produit < c.qte && c.stockQte === 0) return "recevoir";
  if (c.stockQte > 0 && !c.magasinPrepare) return "preparer";
  if (c.stockQte > 0 && c.magasinPrepare) return "bl";
  return null;
}

function TableCommandes({ commandes, peutSaisir, dialogues }: { commandes: CommandeMagasin[]; peutSaisir: boolean; dialogues: Dialogues }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  return (
    <div className="overflow-x-auto border-t">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/30 text-[10.5px] uppercase text-muted-foreground">
            <th className="px-3 py-1.5 text-left">Commande</th>
            <th className="px-3 py-1.5 text-right">Commandé</th>
            <th className="px-3 py-1.5 text-left">En stock (par taille)</th>
            <th className="px-3 py-1.5 text-right">Expédié</th>
            <th className="px-3 py-1.5 text-left">État</th>
            <th className="px-3 py-1.5 text-right">À faire</th>
          </tr>
        </thead>
        <tbody>
          {commandes.map((c) => {
            const e = ETATS_MAGASIN[c.etatMagasin];
            const act = actionPrincipale(c);
            const st = c.stockTaille;
            return (
              <Fragment key={c.id}>
                <tr className="cursor-pointer border-b hover:bg-muted/30" onClick={() => setOuvert(ouvert === c.id ? null : c.id)}>
                  <td className="px-3 py-2">
                    <span className="text-muted-foreground">{ouvert === c.id ? "▾" : "▸"}</span> <b className="text-brand">{c.of}</b> · <b>{c.modele}</b>{" "}
                    <span className="text-muted-foreground">{[c.refArticle, c.couleur].filter(Boolean).join(" · ")}</span>
                    <div className="text-[10px] text-muted-foreground">
                      {c.client} · {sourceDe(c)}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.qte)}</td>
                  <td className="px-3 py-2">
                    <b className="text-[13px] tabular-nums">{nb.format(c.stockQte)}</b>
                    {c.stockQte > 0 && (
                      <span className="ml-2 text-[11px] text-muted-foreground">
                        {formatVentilation(st.parTaille)}
                        {st.nonVentile > 0 && `${Object.keys(st.parTaille).length ? " · " : ""}${nb.format(st.nonVentile)} sans taille`}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.expedieQte)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(ev) => ev.stopPropagation()}>
                    {peutSaisir && act === "entrer" && (
                      <Button size="sm" onClick={() => dialogues.onEntree(c)}>
                        📥 Entrer {nb.format(aEntrerInterne(c))}
                      </Button>
                    )}
                    {peutSaisir && act === "recevoir" && (
                      <Button size="sm" variant="outline" onClick={() => dialogues.onReceptionSt(c)}>
                        📥 Réception
                      </Button>
                    )}
                    {peutSaisir && act === "preparer" && (
                      <BoutonAction onRun={() => A.marquerPrepare(c.id, true)} succes="Préparé — créez le bon de livraison">
                        📦 Préparer
                      </BoutonAction>
                    )}
                    {act === "bl" && (
                      <Link href="/bl" className={buttonVariants({ size: "sm", variant: "outline" })}>
                        🚚 Faire le BL
                      </Link>
                    )}
                  </td>
                </tr>
                {ouvert === c.id && <Detail c={c} peutSaisir={peutSaisir} dialogues={dialogues} />}
              </Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Detail({ c, peutSaisir, dialogues }: { c: CommandeMagasin; peutSaisir: boolean; dialogues: Dialogues }) {
  const qc = QC[c.qcFinal] ?? QC[""];
  const st = c.stockTaille;
  const tailles = [...new Set([...c.tailles, ...Object.keys(st.parTaille)])];
  return (
    <tr className="border-b bg-muted/20">
      <td colSpan={6} className="px-4 py-3">
        <div className="grid gap-4 text-xs lg:grid-cols-[1fr_1fr]">
          <div className="space-y-1">
            <div>
              Produit <b>{nb.format(c.produit)}</b>
              <span className="text-muted-foreground"> (chaînes GPAO + conformes des façonniers + retouches)</span>
            </div>
            <div>
              Entré au magasin <b>{nb.format(c.magasinQte)}</b> · expédié <b>{nb.format(c.expedieQte)}</b> · en stock <b>{nb.format(c.stockQte)}</b>
            </div>
            {aEntrerInterne(c) > 0 && <div className="font-semibold text-brand">+{nb.format(aEntrerInterne(c))} sorties des chaînes, à entrer</div>}
            {c.gpaoExcedent > 0 && <div className="font-semibold text-warning-foreground">⚠ production GPAO en trop : {nb.format(c.gpaoExcedent)} pcs, à vérifier</div>}
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge tone={qc.tone}>{qc.label}</StatusBadge>
              {c.ncAttente > 0 && <span className="font-semibold text-[var(--danger-d)]">{nb.format(c.ncAttente)} NC en attente</span>}
              {c.datePlan && <span>départ prévu {dateFr(c.datePlan)}</span>}
            </div>
          </div>
          <div>
            <div className="mb-1 font-semibold">Stock par taille</div>
            {c.stockQte === 0 ? (
              <span className="text-muted-foreground">Rien en stock.</span>
            ) : (
              <table className="text-xs">
                <tbody>
                  <tr>
                    {tailles.map((t) => (
                      <th key={t} className="border px-2 py-0.5">
                        {t}
                      </th>
                    ))}
                    {st.nonVentile > 0 && <th className="border px-2 py-0.5 text-muted-foreground">sans taille</th>}
                    <th className="border bg-muted px-2 py-0.5">Total</th>
                  </tr>
                  <tr>
                    {tailles.map((t) => (
                      <td key={t} className="border px-2 py-0.5 text-center tabular-nums">
                        {st.parTaille[t] ?? 0}
                      </td>
                    ))}
                    {st.nonVentile > 0 && <td className="border px-2 py-0.5 text-center text-muted-foreground">{st.nonVentile}</td>}
                    <td className="border bg-muted px-2 py-0.5 text-center font-bold">{st.total}</td>
                  </tr>
                </tbody>
              </table>
            )}
            {st.nonVentile > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground">« Sans taille » : entrées saisies avant le rangement par taille, ou sans détail.</p>
            )}
          </div>
        </div>
        {peutSaisir && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {c.etatMagasin !== "expedie" &&
              (!c.faconnier ? (
                <Button variant="outline" size="sm" onClick={() => dialogues.onEntree(c)}>
                  📥 Entrée production interne
                </Button>
              ) : (
                <Button variant="outline" size="sm" onClick={() => dialogues.onReceptionSt(c)}>
                  📥 Réception façonnier
                </Button>
              ))}
            {c.stockQte > 0 && !c.magasinPrepare && c.etatMagasin !== "expedie" && (
              <BoutonAction onRun={() => A.marquerPrepare(c.id, true)} succes="Préparé — créez le bon de livraison">
                📦 Préparer
              </BoutonAction>
            )}
            {c.etatMagasin !== "expedie" && c.expedieQte > 0 && (
              <BoutonAction
                variant="ghost"
                onRun={() => A.marquerExpedie(c.id, true)}
                confirmer={`Solder ${c.of} ? Elle sera considérée comme entièrement livrée (${nb.format(c.expedieQte)} / ${nb.format(c.qte)} pcs expédiées).`}
                succes="Commande soldée"
              >
                ✓ Solder
              </BoutonAction>
            )}
            {c.magasinExpedie && c.expedieQte < c.qte && (
              <BoutonAction variant="ghost" onRun={() => A.marquerExpedie(c.id, false)} confirmer="Rouvrir cette commande (annuler le solde) ?" succes="Commande rouverte">
                ↺ Rouvrir
              </BoutonAction>
            )}
          </div>
        )}
      </td>
    </tr>
  );
}

/* ─────────── réceptions façonniers ─────────── */

function OngletReceptions({ brs, peutSaisir, ncInitial = false }: { brs: BrRow[]; peutSaisir: boolean; ncInitial?: boolean }) {
  const [q, setQ] = useState("");
  const [seulementNc, setSeulementNc] = useState(ncInitial);
  const [nc, setNc] = useState<{ br: BrRow; decision: "retouche" | "rebut" } | null>(null);

  const filtres = useMemo(() => {
    const n = q.trim().toLowerCase();
    return brs.filter(
      (b) => (!seulementNc || b.ncAttente > 0) && (!n || `${b.numero} ${b.of} ${b.modele} ${b.faconnier} ${b.client}`.toLowerCase().includes(n)),
    );
  }, [brs, q, seulementNc]);

  const parFaconnier = useMemo(() => {
    const m = new Map<string, { recu: number; nc: number }>();
    for (const b of brs) {
      const e = m.get(b.faconnier || "—") ?? { recu: 0, nc: 0 };
      e.recu += b.qteRecue;
      e.nc += b.qteNc;
      m.set(b.faconnier || "—", e);
    }
    return [...m.entries()]
      .map(([f, v]) => ({ f, ...v, taux: v.recu ? Math.round((v.nc / v.recu) * 1000) / 10 : 0 }))
      .sort((a, b) => b.taux - a.taux);
  }, [brs]);

  return (
    <>
      {parFaconnier.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2 text-[11px]">
          <span className="font-semibold text-muted-foreground">Taux de non-conformité par façonnier :</span>
          {parFaconnier.map((f) => (
            <StatusBadge key={f.f} tone={f.taux >= 5 ? "danger" : f.taux > 0 ? "warning" : "success"}>
              {f.f} · {f.taux} % ({nb.format(f.nc)}/{nb.format(f.recu)})
            </StatusBadge>
          ))}
        </div>
      )}
      <SectionPanel
        title="Bons de réception façonniers"
        actions={
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-1 text-xs">
              <input type="checkbox" checked={seulementNc} onChange={(e) => setSeulementNc(e.target.checked)} /> NC en attente seulement
            </label>
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="BR, OF, façonnier…" className="h-8 w-56 bg-card" />
          </div>
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
                <th className="px-3 py-2 text-left">Suivi des NC</th>
                <th className="px-3 py-2 text-left">Contrôle</th>
                <th className="px-3 py-2 text-right" />
              </tr>
            </thead>
            <tbody>
              {filtres.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    Aucun bon de réception.
                  </td>
                </tr>
              ) : (
                filtres.map((b) => {
                  const c = CONTROLES_BR.find((x) => x.value === b.controle) ?? CONTROLES_BR[0];
                  return (
                    <tr key={b.id} className="border-b last:border-0">
                      <td className="px-3 py-2 font-bold text-brand">{b.numero}</td>
                      <td className="px-3 py-2">{dateFr(b.date)}</td>
                      <td className="px-3 py-2">{b.faconnier || "—"}</td>
                      <td className="px-3 py-2">
                        <b>{b.of}</b>
                        <div className="text-[10px] text-muted-foreground">{b.modele}</div>
                      </td>
                      <td className="px-3 py-2 text-right font-semibold tabular-nums">{nb.format(b.qteRecue)}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-success-foreground">{nb.format(b.qteOk)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{b.qteNc > 0 ? <b className="text-[var(--danger-d)]">{nb.format(b.qteNc)}</b> : "—"}</td>
                      <td className="px-3 py-2">
                        {b.qteNc === 0 ? (
                          <span className="text-muted-foreground">—</span>
                        ) : (
                          <div className="flex flex-col gap-1">
                            <span className="text-[10.5px]">
                              {b.ncRetouchees > 0 && <>↩ {nb.format(b.ncRetouchees)} retouchées · </>}
                              {b.ncRebut > 0 && <>🗑 {nb.format(b.ncRebut)} rebut · </>}
                              {b.ncAttente > 0 ? (
                                <b className="text-[var(--danger-d)]">{nb.format(b.ncAttente)} en attente</b>
                              ) : (
                                <b className="text-success-foreground">traitées</b>
                              )}
                            </span>
                            {peutSaisir && b.ncAttente > 0 && (
                              <span className="flex gap-1">
                                <Button size="sm" variant="outline" className="h-6 px-2 text-[10.5px]" onClick={() => setNc({ br: b, decision: "retouche" })}>
                                  ↩ Retouchées
                                </Button>
                                <Button size="sm" variant="ghost" className="h-6 px-2 text-[10.5px]" onClick={() => setNc({ br: b, decision: "rebut" })}>
                                  🗑 Rebut
                                </Button>
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-2">
                        <StatusBadge tone={c.tone}>{c.label}</StatusBadge>
                        {b.note && <div className="mt-0.5 text-[10px] text-muted-foreground">{b.note}</div>}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-1.5">
                          <Link href={`/magasin/br/${b.id}/imprimer`} className={buttonVariants({ size: "sm", variant: "ghost", className: "h-6 px-2 text-[10.5px]" })}>
                            🖨 BR
                          </Link>
                          {peutSaisir && (
                            <BoutonAction
                              variant="ghost"
                              onRun={() => A.supprimerBr(b.id)}
                              confirmer={`Supprimer le bon ${b.numero} ?\n\nLes ${nb.format(b.qteOk + b.ncRetouchees)} pièces entrées au stock seront retirées.`}
                              succes="Bon supprimé — compteurs recalculés"
                            >
                              ×
                            </BoutonAction>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
      {nc && <DialogNc br={nc.br} decision={nc.decision} onFermer={() => setNc(null)} />}
    </>
  );
}

/* ─────────── journal des mouvements ─────────── */

function OngletMouvements({ mouvements }: { mouvements: MouvementRow[] }) {
  const [q, setQ] = useState("");
  const [sens, setSens] = useState<"" | "entree" | "sortie" | "rebut">("");
  const lignes = useMemo(() => {
    const n = q.trim().toLowerCase();
    return mouvements.filter(
      (m) => (!sens || m.sens === sens) && (!n || `${m.of} ${m.modele} ${m.client} ${m.document} ${m.type}`.toLowerCase().includes(n)),
    );
  }, [mouvements, q, sens]);
  const total = (s: string) => lignes.filter((m) => m.sens === s).reduce((t, m) => t + m.qte, 0);

  return (
    <SectionPanel
      title={`Mouvements (${lignes.length}) — entrées ${nb.format(total("entree"))} · sorties ${nb.format(total("sortie"))} · rebut ${nb.format(total("rebut"))}`}
      actions={
        <div className="flex items-center gap-2">
          <select value={sens} onChange={(e) => setSens(e.target.value as typeof sens)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
            <option value="">Tous</option>
            <option value="entree">Entrées</option>
            <option value="sortie">Sorties (BL)</option>
            <option value="rebut">Rebut</option>
          </select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, document, client…" className="h-8 w-52 bg-card" />
        </div>
      }
      flush
    >
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">Date</th>
              <th className="px-3 py-2 text-left">Mouvement</th>
              <th className="px-3 py-2 text-left">Document</th>
              <th className="px-3 py-2 text-left">OF / Modèle</th>
              <th className="px-3 py-2 text-left">Client</th>
              <th className="px-3 py-2 text-right">Quantité</th>
              <th className="px-3 py-2 text-left">Note</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={7} className="py-10 text-center text-muted-foreground">
                  Aucun mouvement.
                </td>
              </tr>
            ) : (
              lignes.map((m) => (
                <tr key={m.cle} className="border-b last:border-0">
                  <td className="px-3 py-2">{dateFr(m.date)}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone={m.sens === "entree" ? "success" : m.sens === "sortie" ? "brand" : "danger"}>
                      {m.sens === "entree" ? "▲" : m.sens === "sortie" ? "▼" : "✕"} {m.type}
                    </StatusBadge>
                  </td>
                  <td className="px-3 py-2 font-semibold">{m.document || "—"}</td>
                  <td className="px-3 py-2">
                    <b>{m.of}</b> <span className="text-muted-foreground">{m.modele}</span>
                  </td>
                  <td className="px-3 py-2">{m.client}</td>
                  <td className={`px-3 py-2 text-right font-bold tabular-nums ${m.sens === "sortie" ? "text-brand" : m.sens === "rebut" ? "text-[var(--danger-d)]" : "text-success-foreground"}`}>
                    {m.sens === "entree" ? "+" : "−"}
                    {nb.format(m.qte)}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground">{m.note}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}
