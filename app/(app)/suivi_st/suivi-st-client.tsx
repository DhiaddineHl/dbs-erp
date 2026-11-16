"use client";

import { Fragment, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import * as A from "@/lib/actions/suivi-soustraitants";
import { BarresAvancement, JournalJours } from "@/components/shared/avancement-atelier";
import type { suiviSt, RapportBureau } from "@/lib/services/suivi-soustraitants";

type Vue = Awaited<ReturnType<typeof suiviSt>>;
type Motif = { value: string; label: string };
type Onglet = "valider" | "avancement" | "charge" | "tissu" | "fiabilite" | "reglages";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const eur = new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" });
const dateFr = (iso: string | null) => (/^\d{4}-\d{2}-\d{2}/.test(iso ?? "") ? iso!.slice(0, 10).split("-").reverse().join("/") : "—");
const quand = (iso: string) => (iso ? new Date(iso).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" }) : "—");
const total = (ls: { premier: number; second: number }[]) => ls.reduce((s, x) => ({ p: s.p + x.premier, s: s.s + x.second }), { p: 0, s: 0 });

export function SuiviStClient({ vue, motifsCoupe, peutValider, peutRegler }: { vue: Vue; motifsCoupe: Motif[]; peutValider: boolean; peutRegler: boolean }) {
  const rapportsAValider = vue.rapports.filter((r) => r.statut === "annonce");
  const [onglet, setOnglet] = useState<Onglet>(vue.aValider.length + rapportsAValider.length ? "valider" : "avancement");
  const alertes = vue.lignes.filter((l) => l.sansNouvelle || l.enRetard || (l.derniere?.alertes.length ?? 0) > 0).length;
  const onglets: [Onglet, string][] = [
    ["valider", `À valider (${vue.aValider.length + rapportsAValider.length})`],
    ["avancement", `Avancement déclaré${alertes ? ` · ⚠ ${alertes}` : ""}`],
    ["charge", "Charge des ateliers"],
    ["tissu", `Tissu chez les ateliers${vue.ecarts.length ? ` · ⚠ ${vue.ecarts.length}` : ""}`],
    ["fiabilite", "Fiabilité"],
    ...(peutRegler ? ([["reglages", "Réglages"]] as [Onglet, string][]) : []),
  ];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-1">
        {onglets.map(([k, l]) => (
          <Button key={k} size="sm" variant={onglet === k ? "default" : "outline"} onClick={() => setOnglet(k)}>
            {l}
          </Button>
        ))}
      </div>
      {onglet === "valider" && (
        <>
          <SectionPanel title={`Livraisons annoncées (${vue.aValider.length})`} flush>
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">N°</th>
                  <th className="px-3 py-2 text-left">Atelier</th>
                  <th className="px-3 py-2 text-left">OF</th>
                  <th className="px-3 py-2 text-left">Annoncée</th>
                  <th className="px-3 py-2 text-right">1er choix</th>
                  <th className="px-3 py-2 text-right">2e choix</th>
                  <th className="px-3 py-2 text-left">Motif</th>
                  <th className="px-3 py-2 text-right" />
                </tr>
              </thead>
              <tbody>
                {vue.aValider.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      Aucune livraison en attente.
                    </td>
                  </tr>
                )}
                {vue.aValider.map((l) => {
                  const t = total(l.lignes);
                  return (
                    <tr key={l.id} className="border-b">
                      <td className="px-3 py-2 font-bold">{l.numero}</td>
                      <td className="px-3 py-2">{l.atelier}</td>
                      <td className="px-3 py-2">
                        {l.of} · {l.modele} <span className="text-muted-foreground">{l.couleur}</span>
                      </td>
                      <td className="px-3 py-2">{quand(l.annonceeLe)}</td>
                      <td className="px-3 py-2 text-right font-bold">{t.p}</td>
                      <td className="px-3 py-2 text-right">{t.s || ""}</td>
                      <td className="px-3 py-2">{l.motif}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={`/suivi_st/livraison/${encodeURIComponent(l.numero)}`} className="inline-flex h-7 items-center rounded-md bg-primary px-3 font-semibold text-primary-foreground">
                          Recevoir
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionPanel>
          <SectionPanel title={`Rapports de coupe à valider (${rapportsAValider.length})`}>
            {rapportsAValider.length === 0 ? (
              <p className="text-xs text-muted-foreground">Aucun rapport en attente.</p>
            ) : (
              <div className="space-y-3">
                {rapportsAValider.map((r) => (
                  <Rapport key={r.id} r={r} motifs={motifsCoupe} peutValider={peutValider} />
                ))}
              </div>
            )}
          </SectionPanel>
          <SectionPanel title="Dernières livraisons traitées" flush>
            <table className="w-full text-xs">
              <tbody>
                {vue.recentes.map((l) => {
                  const a = total(l.lignes);
                  const r = total(l.recues);
                  const ecart = r.p + r.s - a.p - a.s;
                  return (
                    <tr key={l.id} className={`border-b ${l.statut === "annulee" ? "opacity-50" : ""}`}>
                      <td className="px-3 py-1.5 font-bold">
                        <Link href={`/suivi_st/livraison/${encodeURIComponent(l.numero)}`} className="underline">
                          {l.numero}
                        </Link>
                      </td>
                      <td className="px-3">{l.atelier}</td>
                      <td className="px-3">{l.of}</td>
                      <td className="px-3">{l.statut === "recue" ? `reçue ${quand(l.recueLe)}` : l.statut === "annulee" ? "retirée" : l.statut}</td>
                      <td className="px-3 text-right">{l.statut === "recue" && `${r.p} + ${r.s} (annoncé ${a.p} + ${a.s})`}</td>
                      <td className={`px-3 text-right font-bold ${ecart ? "text-amber-700" : ""}`}>{l.statut === "recue" && ecart !== 0 && (ecart > 0 ? `+${ecart}` : ecart)}</td>
                      <td className="px-3">{l.brNumero}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </SectionPanel>
        </>
      )}
      {onglet === "avancement" && <Avancement lignes={vue.lignes} />}
      {onglet === "charge" && (
        <SectionPanel title="Charge des ateliers — quand lancer la commande suivante ?" flush>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Atelier</th>
                <th className="px-3 py-2 text-right">Commandes en cours</th>
                <th className="px-3 py-2 text-right">Reste à produire</th>
                <th className="px-3 py-2 text-right">Rythme (14 j)</th>
                <th className="px-3 py-2 text-left">Libre vers le</th>
                <th className="px-3 py-2 text-left">Dernière saisie</th>
              </tr>
            </thead>
            <tbody>
              {vue.charges.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Aucun atelier avec un portail ouvert.
                  </td>
                </tr>
              )}
              {vue.charges.map((c) => (
                <tr key={c.atelier} className="border-b">
                  <td className="px-3 py-2 font-bold">{c.atelier}</td>
                  <td className="px-3 py-2 text-right">{c.enCours}</td>
                  <td className="px-3 py-2 text-right">{nb.format(c.reste)} pcs</td>
                  <td className="px-3 py-2 text-right">{c.rythme == null ? "—" : `${nb.format(c.rythme)} pcs / jour`}</td>
                  <td className="px-3 py-2">
                    {c.libreLe ? (
                      <StatusBadge tone={c.libreLe <= vue.aujourdhui ? "success" : "info"}>{c.libreLe <= vue.aujourdhui ? "libre maintenant" : dateFr(c.libreLe)}</StatusBadge>
                    ) : (
                      <span className="text-muted-foreground">pas assez de saisies</span>
                    )}
                  </td>
                  <td className="px-3 py-2">{dateFr(c.derniereSaisie)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Rythme = pièces produites par jour ouvré (lundi → samedi) sur les 14 derniers jours, d&apos;après les saisies du soir. « Libre vers le » = quand il aura fini
            ses commandes en cours à ce rythme : c&apos;est la date à partir de laquelle on peut lui lancer la suivante (à confirmer avec lui).
          </p>
        </SectionPanel>
      )}
      {onglet === "tissu" && (
        <SectionPanel title="Écarts signalés par les ateliers sur le tissu reçu (60 derniers jours)" flush>
          <table className="w-full text-xs">
            <tbody>
              {vue.ecarts.length === 0 && (
                <tr>
                  <td className="py-6 text-center text-muted-foreground">Aucun écart signalé.</td>
                </tr>
              )}
              {vue.ecarts.map((e) => (
                <tr key={e.id} className="border-b">
                  <td className="px-3 py-2">{quand(e.le)}</td>
                  <td className="px-3 py-2">{e.atelier}</td>
                  <td className="px-3 py-2 font-bold">{e.rouleau || "—"}</td>
                  <td className="px-3 py-2">{e.of}</td>
                  <td className="px-3 py-2">
                    <StatusBadge tone="warning">{e.etat === "manquant" ? "Pas reçu" : "Écart"}</StatusBadge>
                  </td>
                  <td className="px-3 py-2 text-right">
                    envoyé {nb.format(e.envoye)}
                    {e.constate != null && ` · mesuré ${nb.format(e.constate)}`}
                  </td>
                  <td className="px-3 py-2">{e.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Le stock ne bouge pas tout seul : vérifiez, puis corrigez au Magasin tissu (mouvement tracé) si l&apos;atelier a raison. Les restes à rendre sont dans « Tissu
            dehors ».
          </p>
        </SectionPanel>
      )}
      {onglet === "fiabilite" && (
        <SectionPanel title="Fiabilité des annonces (livraisons reçues, 90 derniers jours)" flush>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Atelier</th>
                <th className="px-3 py-2 text-right">Livraisons</th>
                <th className="px-3 py-2 text-right">Justes</th>
                <th className="px-3 py-2 text-right">Pièces annoncées</th>
                <th className="px-3 py-2 text-right">Écart (pièces)</th>
                <th className="px-3 py-2 text-right">Fiabilité</th>
              </tr>
            </thead>
            <tbody>
              {vue.fiabilite.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-6 text-center text-muted-foreground">
                    Pas encore de livraison reçue.
                  </td>
                </tr>
              )}
              {vue.fiabilite.map((f) => (
                <tr key={f.atelier} className="border-b">
                  <td className="px-3 py-2 font-bold">{f.atelier}</td>
                  <td className="px-3 py-2 text-right">{f.nb}</td>
                  <td className="px-3 py-2 text-right">{f.justes}</td>
                  <td className="px-3 py-2 text-right">{f.annonce}</td>
                  <td className="px-3 py-2 text-right">{f.ecartPieces}</td>
                  <td className="px-3 py-2 text-right">
                    <StatusBadge tone={f.pct == null ? "neutral" : f.pct >= 98 ? "success" : f.pct >= 90 ? "warning" : "danger"}>{f.pct == null ? "—" : `${f.pct} %`}</StatusBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionPanel>
      )}
      {onglet === "reglages" && peutRegler && <Reglages initial={vue.reglages} />}
    </div>
  );
}

function Rapport({ r, motifs, peutValider }: { r: RapportBureau; motifs: Motif[]; peutValider: boolean }) {
  const router = useRouter();
  const [motif, setMotif] = useState("");
  const [precision, setPrecision] = useState("");
  const [pending, start] = useTransition();
  const tailles = [...new Set(r.coupe.flatMap((c) => Object.keys(c.parTaille)))];
  const reste = r.rouleaux.reduce((s, x) => s + x.reste, 0);
  return (
    <div className="rounded-lg border p-3 text-xs">
      <div className="font-bold">
        {r.of} · {r.modele} — {r.atelier} <span className="font-normal text-muted-foreground">({quand(r.le)}, {r.par})</span>
      </div>
      <table className="mt-2">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            <th className="pr-3 text-left">OF</th>
            {tailles.map((t) => (
              <th key={t} className="px-2">
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {r.coupe.map((c) => (
            <tr key={c.of}>
              <td className="pr-3 font-semibold">{c.of}</td>
              {tailles.map((t) => (
                <td key={t} className="px-2 text-center">
                  {c.parTaille[t] ?? 0}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {r.rouleaux.length > 0 && (
        <div className="mt-2">
          {r.rouleaux.map((x) => (
            <span key={x.code} className="mr-3 inline-block">
              <b>{x.code}</b> : utilisé {nb.format(x.consomme)} · chute {nb.format(x.chute)} · reste {nb.format(x.reste)}
            </span>
          ))}
          {reste > 0 && <div className="mt-1 font-semibold text-amber-800">Reste à rendre : {nb.format(reste)} m</div>}
        </div>
      )}
      {r.note && <div className="mt-1 italic">« {r.note} »</div>}
      {peutValider && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={motif} onChange={(e) => setMotif(e.target.value)} className="h-8 rounded-md border bg-card px-2">
            <option value="">Motif d&apos;écart (si la coupe ne tombe pas juste)</option>
            {motifs.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
          <input value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Précision" className="h-8 rounded-md border px-2" />
          <Button
            size="sm"
            disabled={pending}
            onClick={() =>
              start(async () => {
                const res = await A.validerRapport(r.id, motif, precision);
                if (!res.ok) return void toast.error(res.error);
                toast.success(`Fiche de coupe ${res.numero} créée`);
                router.refresh();
              })
            }
          >
            ✓ Valider → fiche de coupe
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={pending}
            onClick={() => {
              const m = prompt("Que doit corriger l'atelier ?");
              if (!m) return;
              start(async () => {
                const res = await A.refuserRapport(r.id, m);
                if (!res.ok) return void toast.error(res.error);
                toast.success("Renvoyé à l'atelier");
                router.refresh();
              });
            }}
          >
            ↩ À refaire
          </Button>
        </div>
      )}
    </div>
  );
}

function Reglages({ initial }: { initial: { montrerClient: boolean; delai: number } }) {
  const router = useRouter();
  const [v, setV] = useState({ montrerClient: initial.montrerClient, delai: String(initial.delai) });
  const [pending, start] = useTransition();
  return (
    <SectionPanel title="Réglages du portail sous-traitant">
      <div className="space-y-3 text-sm">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={v.montrerClient} onChange={(e) => setV({ ...v, montrerClient: e.target.checked })} />
          Montrer le nom du client aux ateliers
        </label>
        <label className="flex items-center gap-2">
          Livré chez nous
          <input value={v.delai} onChange={(e) => setV({ ...v, delai: e.target.value.replace(/\D/g, "") })} className="h-8 w-16 rounded-md border text-center" />
          jours avant la date d&apos;export (contrôle, emballage, transport)
        </label>
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            start(async () => {
              const r = await A.enregistrerReglages({ montrerClient: v.montrerClient, delai: Number(v.delai || 0) });
              if (!r.ok) return void toast.error(r.error);
              toast.success("Réglages enregistrés");
              router.refresh();
            })
          }
        >
          Enregistrer
        </Button>
      </div>
    </SectionPanel>
  );
}

type Ligne = Vue["lignes"][number];

function Avancement({ lignes }: { lignes: Ligne[] }) {
  const [ouvert, setOuvert] = useState<number | null>(null);
  const [voirLivrees, setVoirLivrees] = useState(false);
  const enCours = lignes.filter((l) => !l.avancement.livree);
  const livrees = lignes.filter((l) => l.avancement.livree);
  const vues = voirLivrees ? [...enCours, ...livrees] : enCours;
  return (
    <SectionPanel
      title={`Avancement chez les ateliers — ${enCours.length} en cours`}
      flush
      actions={
        livrees.length > 0 && (
          <label className="flex items-center gap-1 text-[11px] font-semibold">
            <input type="checkbox" checked={voirLivrees} onChange={(e) => setVoirLivrees(e.target.checked)} /> voir les livrées ({livrees.length})
          </label>
        )
      }
    >
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
            <th className="px-3 py-2 text-left">OF</th>
            <th className="px-3 py-2 text-left">Atelier</th>
            <th className="px-3 py-2 text-right">Commandé</th>
            <th className="px-3 py-2 text-right">Coupé</th>
            <th className="px-3 py-2 text-right">Lancé</th>
            <th className="px-3 py-2 text-left">Produit / commandé</th>
            <th className="px-3 py-2 text-right">Livré (reçu)</th>
            <th className="px-3 py-2 text-left">À livrer / fin estimée</th>
            <th className="px-3 py-2 text-right">Dû (façon)</th>
            <th className="px-3 py-2 text-left">Alertes</th>
          </tr>
        </thead>
        <tbody>
          {vues.length === 0 && (
            <tr>
              <td colSpan={10} className="py-6 text-center text-muted-foreground">
                Aucune commande en cours chez un atelier qui a son portail (Portails extérieurs → Sous-traitant).
              </td>
            </tr>
          )}
          {vues.map((l) => {
            const a = l.avancement;
            const pct = a.qte > 0 ? Math.min(100, Math.round((a.produit / a.qte) * 100)) : 0;
            return (
              <Fragment key={l.commandeId}>
                <tr className={`cursor-pointer border-b align-top hover:bg-muted/30 ${a.livree ? "opacity-60" : ""}`} onClick={() => setOuvert(ouvert === l.commandeId ? null : l.commandeId)}>
                  <td className="px-3 py-2">
                    {ouvert === l.commandeId ? "▾" : "▸"} <b>{l.of}</b> · {l.modele}
                    <div className="text-muted-foreground">
                      {l.client} · {l.couleur}
                    </div>
                  </td>
                  <td className="px-3 py-2">{l.atelier}</td>
                  <td className="px-3 py-2 text-right">{nb.format(a.qte)}</td>
                  <td className="px-3 py-2 text-right">{a.coupe ? nb.format(a.coupe) : "—"}</td>
                  <td className="px-3 py-2 text-right">{l.derniere ? nb.format(a.lance) : "—"}</td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="h-2 w-20 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full bg-emerald-600" style={{ width: `${pct}%` }} />
                      </span>
                      <b>{nb.format(a.produit)}</b> <span className="text-muted-foreground">({pct} %)</span>
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right">
                    {nb.format(a.recu)}
                    {a.livree ? <div className="text-emerald-700">✅ livrée</div> : a.recu > 0 && <div className="text-muted-foreground">reste {nb.format(a.reste)}</div>}
                  </td>
                  <td className="px-3 py-2">
                    {dateFr(l.aLivrerLe)} / <span className={l.enRetard ? "font-bold text-red-700" : ""}>{dateFr(l.finEstimee)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{l.montantDu ? eur.format(l.montantDu) : ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {l.sansNouvelle && <StatusBadge tone="warning">Sans nouvelle{l.derniere ? ` depuis le ${dateFr(l.derniere.jour)}` : ""}</StatusBadge>}
                      {l.enRetard && <StatusBadge tone="danger">Fin estimée après la date à livrer</StatusBadge>}
                      {(l.derniere?.alertes ?? []).map((x, i) => (
                        <StatusBadge key={i} tone="warning">
                          {x}
                        </StatusBadge>
                      ))}
                    </div>
                  </td>
                </tr>
                {ouvert === l.commandeId && (
                  <tr className="border-b bg-muted/20">
                    <td colSpan={10} className="px-4 py-3">
                      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.3fr)]">
                        <BarresAvancement a={a} />
                        <JournalJours journal={a.journal} />
                      </div>
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
        </tbody>
      </table>
      <p className="px-3 py-2 text-[11px] text-muted-foreground">
        Cliquez une ligne pour le jour par jour (coupé, lancé, produit, livré). Lancé / produit sont des DÉCLARATIONS de l&apos;atelier : elles ne comptent pas comme
        production ; la production avance quand une livraison est reçue et validée (BR). Une commande passe en « livrée » quand tout est reçu, ou quand la dernière
        livraison reçue n&apos;annonçait pas de suite. « Dû » = 1er choix reçus × prix de façon.
      </p>
    </SectionPanel>
  );
}
