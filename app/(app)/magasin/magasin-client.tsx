"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Warehouse } from "lucide-react";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { aEntrerInterne, CONTROLES_BR, ETATS_MAGASIN, type EtatMagasin } from "@/lib/domain/aval";
import type { BrRow, CommandeAval, MouvementRow } from "@/lib/services/aval";
import * as A from "@/lib/actions/aval";
import { BoutonAction, Kpi, Tuiles } from "../aval/ui";
import { DialogEntreeInterne, DialogNc, DialogReceptionSt } from "./dialogs";

export type Onglet = "stock" | "receptions" | "mouvements";

const nb = new Intl.NumberFormat("fr-FR");
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso);

const QC: Record<string, { label: string; tone: "success" | "warning" | "danger" | "neutral" }> = {
  accepte: { label: "QC ✓", tone: "success" },
  reserve: { label: "QC réserve", tone: "warning" },
  refuse: { label: "QC ✗ refusé", tone: "danger" },
  "": { label: "sans QC final", tone: "neutral" },
};

/* Magasin produits finis — un seul module pour tout le flux de sortie :
 *   entrées  : production interne (proposée depuis la GPAO), réceptions
 *              façonniers (BR avec contrôle), NC réintégrées après retouche ;
 *   sorties  : bons de livraison envoyés (livraison en plusieurs fois) ;
 *   journal  : chaque mouvement daté, avec son document. */
export function MagasinClient({
  commandes,
  brs,
  mouvements,
  peutSaisir,
  ongletInitial,
}: {
  commandes: CommandeAval[];
  brs: BrRow[];
  mouvements: MouvementRow[];
  peutSaisir: boolean;
  ongletInitial: Onglet;
}) {
  const [onglet, setOnglet] = useState<Onglet>(ongletInitial);
  const [receptionSt, setReceptionSt] = useState<{ c: CommandeAval | null } | null>(null);
  const [entree, setEntree] = useState<CommandeAval | null>(null);

  const stats = useMemo(() => {
    const actives = commandes.filter((c) => c.etatMagasin !== "expedie");
    const recu = brs.reduce((s, b) => s + b.qteRecue, 0);
    const nc = brs.reduce((s, b) => s + b.qteNc, 0);
    return {
      stock: commandes.reduce((s, c) => s + c.stockQte, 0),
      aExpedier: actives.filter((c) => c.stockQte > 0).length,
      ncAttente: brs.reduce((s, b) => s + b.ncAttente, 0),
      tauxNc: recu > 0 ? Math.round((nc / recu) * 1000) / 10 : 0,
      aEntrer: commandes.reduce((s, c) => s + aEntrerInterne(c), 0),
    };
  }, [commandes, brs]);

  const ONGLETS: { id: Onglet; label: string }[] = [
    { id: "stock", label: "📦 Stock & expéditions" },
    { id: "receptions", label: `📥 Réceptions façonniers (${brs.length})` },
    { id: "mouvements", label: "🧾 Mouvements" },
  ];

  return (
    <>
      <PageHeader
        icon={Warehouse}
        title="Magasin produits finis"
        description="Entrées (production interne, façonniers, retouches), stock, expéditions — un seul écran"
        actions={
          peutSaisir && (
            <div className="flex gap-2">
              <Link href="/magasin/qr" className={buttonVariants({ size: "sm", variant: "outline" })} title="Affiche à coller au magasin : saisie des réceptions au téléphone">
                📱 QR saisie mobile
              </Link>
              <Button size="sm" variant="outline" onClick={() => setReceptionSt({ c: null })}>
                📥 Réception façonnier
              </Button>
              <Link href="/bl" className={buttonVariants({ size: "sm" })}>
                🚚 Bon de livraison
              </Link>
            </div>
          )
        }
      />

      <Tuiles>
        <Kpi label="Pièces en stock" valeur={nb.format(stats.stock)} tone="success" sub="entré − expédié" />
        <Kpi label="Commandes avec du stock à expédier" valeur={String(stats.aExpedier)} tone="warning" />
        <Kpi
          label="Produit en GPAO, pas encore entré"
          valeur={nb.format(stats.aEntrer)}
          tone={stats.aEntrer ? "brand" : "neutral"}
          sub="production interne à réceptionner"
        />
        <Kpi
          label="Non conformes en attente"
          valeur={nb.format(stats.ncAttente)}
          tone={stats.ncAttente ? "danger" : "success"}
          sub={`taux NC façonniers ${stats.tauxNc} %`}
        />
      </Tuiles>

      <div className="mb-3 flex flex-wrap gap-1 border-b">
        {ONGLETS.map((o) => (
          <button
            key={o.id}
            onClick={() => setOnglet(o.id)}
            className={`-mb-px border-b-2 px-3 py-2 text-xs font-semibold ${
              onglet === o.id ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>

      {onglet === "stock" && (
        <OngletStock commandes={commandes} peutSaisir={peutSaisir} onEntree={setEntree} onReceptionSt={(c) => setReceptionSt({ c })} />
      )}
      {onglet === "receptions" && <OngletReceptions brs={brs} peutSaisir={peutSaisir} />}
      {onglet === "mouvements" && <OngletMouvements mouvements={mouvements} />}

      {receptionSt && <DialogReceptionSt commandes={commandes} initiale={receptionSt.c} onFermer={() => setReceptionSt(null)} />}
      {entree && <DialogEntreeInterne commande={entree} onFermer={() => setEntree(null)} />}
    </>
  );
}

/* ─────────── stock & expéditions ─────────── */

type Filtre = "actives" | "stock" | "entrer" | "nc" | "toutes";

function OngletStock({
  commandes,
  peutSaisir,
  onEntree,
  onReceptionSt,
}: {
  commandes: CommandeAval[];
  peutSaisir: boolean;
  onEntree: (c: CommandeAval) => void;
  onReceptionSt: (c: CommandeAval) => void;
}) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("actives");
  const [etat, setEtat] = useState<EtatMagasin | "">("");

  const lignes = useMemo(() => {
    const n = q.trim().toLowerCase();
    return commandes.filter((c) => {
      if (n && !`${c.of} ${c.modele} ${c.client} ${c.source}`.toLowerCase().includes(n)) return false;
      if (etat && c.etatMagasin !== etat) return false;
      switch (filtre) {
        case "actives":
          // Ce qui demande une action : en cours de production, en stock, ou à expédier.
          return c.etatMagasin !== "expedie" && (c.produit > 0 || c.magasinQte > 0 || c.ncAttente > 0);
        case "stock":
          return c.stockQte > 0;
        case "entrer":
          return aEntrerInterne(c) > 0;
        case "nc":
          return c.ncAttente > 0;
        default:
          return true;
      }
    });
  }, [commandes, q, filtre, etat]);

  return (
    <SectionPanel
      title="Stock par commande"
      actions={
        <div className="flex flex-wrap items-center gap-2">
          <select value={filtre} onChange={(e) => setFiltre(e.target.value as Filtre)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
            <option value="actives">À traiter (en cours, en stock, à expédier)</option>
            <option value="stock">Avec du stock</option>
            <option value="entrer">Production GPAO à entrer</option>
            <option value="nc">Non conformes en attente</option>
            <option value="toutes">Toutes les commandes</option>
          </select>
          <select value={etat} onChange={(e) => setEtat(e.target.value as EtatMagasin | "")} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
            <option value="">Tous les états</option>
            {Object.entries(ETATS_MAGASIN).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, modèle, client…" className="h-8 w-48 bg-card" />
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
              <th className="px-3 py-2 text-right">Cmd</th>
              <th className="px-3 py-2 text-right" title="Production interne (GPAO) + conformes façonniers + retouches">Produit</th>
              <th className="px-3 py-2 text-right">Entré</th>
              <th className="px-3 py-2 text-right">Expédié</th>
              <th className="px-3 py-2 text-right">En stock</th>
              <th className="px-3 py-2 text-left">Qualité</th>
              <th className="px-3 py-2 text-left">État</th>
              <th className="px-3 py-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {lignes.length === 0 ? (
              <tr>
                <td colSpan={11} className="py-10 text-center text-muted-foreground">
                  Aucune commande pour ce filtre.
                </td>
              </tr>
            ) : (
              lignes.map((c) => {
                const e = ETATS_MAGASIN[c.etatMagasin];
                const interne = !c.faconnier;
                const aEntrer = aEntrerInterne(c);
                const qc = QC[c.qcFinal] ?? QC[""];
                const pct = c.qte > 0 ? Math.min(100, Math.round((c.expedieQte / c.qte) * 100)) : 0;
                return (
                  <tr key={c.id} className="border-b last:border-0">
                    <td className="px-3 py-2 font-bold text-brand">{c.of}</td>
                    <td className="px-3 py-2">
                      <b>{c.modele}</b>
                      <div className="text-[10px] text-muted-foreground">{c.client}</div>
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{c.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.qte)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {nb.format(c.produit)}
                      {aEntrer > 0 && <div className="text-[10px] font-semibold text-brand">+{nb.format(aEntrer)} à entrer</div>}
                      {c.gpaoExcedent > 0 && (
                        <div
                          className="text-[10px] font-semibold text-warning-foreground"
                          title="La GPAO a compté plus de pièces que cette commande et ses OF frères (même client, même modèle) n'en demandent. Ces pièces ne sont pas proposées à l'entrée : vérifiez la saisie GPAO ou le rattachement du modèle."
                        >
                          ⚠ production GPAO en trop : {nb.format(c.gpaoExcedent)} pcs, à vérifier
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.magasinQte)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {nb.format(c.expedieQte)}
                      {c.expedieQte > 0 && <div className="text-[10px] text-muted-foreground">{pct} %</div>}
                    </td>
                    <td className="px-3 py-2 text-right text-[13px] font-bold tabular-nums">{nb.format(c.stockQte)}</td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={qc.tone}>{qc.label}</StatusBadge>
                      {c.ncAttente > 0 && <div className="mt-0.5 text-[10px] font-semibold text-[var(--danger-d)]">{nb.format(c.ncAttente)} NC en attente</div>}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      {peutSaisir && (
                        <div className="flex flex-wrap justify-end gap-1.5">
                          {c.etatMagasin !== "expedie" &&
                            (interne ? (
                              <Button variant={aEntrer > 0 ? "default" : "outline"} size="sm" onClick={() => onEntree(c)}>
                                📥 Entrée
                              </Button>
                            ) : (
                              <Button variant="outline" size="sm" onClick={() => onReceptionSt(c)}>
                                📥 Réception
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
                            <BoutonAction
                              variant="ghost"
                              onRun={() => A.marquerExpedie(c.id, false)}
                              confirmer="Rouvrir cette commande (annuler le solde) ?"
                              succes="Commande rouverte"
                            >
                              ↺ Rouvrir
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
      <div className="border-t px-3 py-2 text-[11px] text-muted-foreground">
        Produit = sorties des chaînes (GPAO) + conformes reçues des façonniers + NC retouchées. En stock = entré − parti
        sur des bons de livraison envoyés : une commande peut être livrée en plusieurs fois.
      </div>
    </SectionPanel>
  );
}

/* ─────────── réceptions façonniers ─────────── */

function OngletReceptions({ brs, peutSaisir }: { brs: BrRow[]; peutSaisir: boolean }) {
  const [q, setQ] = useState("");
  const [seulementNc, setSeulementNc] = useState(false);
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
