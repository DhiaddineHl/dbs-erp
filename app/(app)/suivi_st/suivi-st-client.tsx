"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import * as A from "@/lib/actions/suivi-soustraitants";
import type { suiviSt, RapportBureau } from "@/lib/services/suivi-soustraitants";

type Vue = Awaited<ReturnType<typeof suiviSt>>;
type Motif = { value: string; label: string };
type Onglet = "valider" | "avancement" | "tissu" | "fiabilite" | "reglages";

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
      {onglet === "avancement" && (
        <SectionPanel title="Ce que les ateliers déclarent (le soir)" flush>
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">OF</th>
                <th className="px-3 py-2 text-left">Atelier</th>
                <th className="px-3 py-2 text-right">Qté / coupé</th>
                <th className="px-3 py-2 text-right">Lancé</th>
                <th className="px-3 py-2 text-right">Produit</th>
                <th className="px-3 py-2 text-right">Emballé</th>
                <th className="px-3 py-2 text-right">Reçu (BR)</th>
                <th className="px-3 py-2 text-left">À livrer / fin estimée</th>
                <th className="px-3 py-2 text-right">Dû (façon)</th>
                <th className="px-3 py-2 text-left">Alertes</th>
              </tr>
            </thead>
            <tbody>
              {vue.lignes.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-6 text-center text-muted-foreground">
                    Aucune commande chez un atelier qui a son portail (Portails extérieurs → Sous-traitant).
                  </td>
                </tr>
              )}
              {vue.lignes.map((l) => (
                <tr key={l.commandeId} className="border-b align-top">
                  <td className="px-3 py-2">
                    <b>{l.of}</b> · {l.modele}
                    <div className="text-muted-foreground">
                      {l.client} · {l.couleur}
                    </div>
                  </td>
                  <td className="px-3 py-2">{l.atelier}</td>
                  <td className="px-3 py-2 text-right">
                    {l.qte} / {l.coupe || "—"}
                  </td>
                  <td className="px-3 py-2 text-right">{l.derniere?.lance ?? "—"}</td>
                  <td className="px-3 py-2 text-right font-bold">{l.derniere?.produit ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{l.derniere?.emballe ?? "—"}</td>
                  <td className="px-3 py-2 text-right">{l.recuValide}</td>
                  <td className="px-3 py-2">
                    {dateFr(l.aLivrerLe)} / <span className={l.enRetard ? "font-bold text-red-700" : ""}>{dateFr(l.finEstimee)}</span>
                  </td>
                  <td className="px-3 py-2 text-right">{l.montantDu ? eur.format(l.montantDu) : ""}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {l.sansNouvelle && <StatusBadge tone="warning">Sans nouvelle{l.derniere ? ` depuis le ${dateFr(l.derniere.jour)}` : ""}</StatusBadge>}
                      {l.enRetard && <StatusBadge tone="danger">Fin estimée après la date à livrer</StatusBadge>}
                      {(l.derniere?.alertes ?? []).map((a, i) => (
                        <StatusBadge key={i} tone="warning">
                          {a}
                        </StatusBadge>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-[11px] text-muted-foreground">
            Déclarations de l&apos;atelier : elles ne comptent PAS comme production. La production avance quand une livraison est reçue et validée (BR). « Dû » = 1er
            choix reçus × prix de façon.
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
