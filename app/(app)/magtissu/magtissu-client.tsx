"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { dashboardTissu, totauxRouleaux, type GroupeReliquats, type RouleauControle } from "@/lib/domain/tissu";
import type { LotRow } from "@/lib/services/tissu";
import type { MatiereCommandeRow } from "@/lib/services/matiere-tissu";
import * as A from "@/lib/actions/tissu";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}/.test(iso) ? iso.slice(0, 10).split("-").reverse().join("/") : iso || "—");
const dateHeure = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
};

type Choix = { id: number; label: string };
export type OngletTissu = "commandes" | "lots" | "reliquats" | "dashboard";

const CONTROLES = [
  { value: "", label: "Non contrôlé", tone: "neutral" as const },
  { value: "conforme", label: "✓ Conforme", tone: "success" as const },
  { value: "reserve", label: "Sous réserve", tone: "warning" as const },
  { value: "refuse", label: "✗ Refusé", tone: "danger" as const },
];
const controleDe = (v: string) => CONTROLES.find((c) => c.value === v) ?? CONTROLES[0];

const NIVEAUX: Record<MatiereCommandeRow["etat"]["niveau"], { label: string; tone: "danger" | "warning" | "success" | "neutral" }> = {
  manque: { label: "🔴 À demander au client", tone: "danger" },
  stock: { label: "🟠 Couvrable en stock", tone: "warning" },
  couvert: { label: "🟢 Couvert", tone: "success" },
  sans_besoin: { label: "Nomenclature absente", tone: "neutral" },
};

/* Magasin tissu — la matière du client, du bon de livraison jusqu'au retour
 * des reliquats :
 *   Par commande : a-t-on assez pour lancer ? sinon, quel lot affecter, ou
 *                  quoi demander au client ;
 *   Lots         : réception contrôlée contre le BL, affectation, sorties ;
 *   Reliquats    : ce qui reste chez nous et doit être rendu. */
export function MagasinTissu({
  lots,
  parCommande,
  reliquats,
  bonsRetour,
  commandes,
  peutSaisir,
  ongletInitial,
  rechercheInitiale,
}: {
  lots: LotRow[];
  parCommande: MatiereCommandeRow[];
  reliquats: GroupeReliquats[];
  bonsRetour: { numero: string; date: string; lignes: number }[];
  commandes: Choix[];
  peutSaisir: boolean;
  ongletInitial: OngletTissu;
  rechercheInitiale: string;
}) {
  const [onglet, setOnglet] = useState<OngletTissu>(ongletInitial);
  const [q, setQ] = useState(rechercheInitiale);

  const d = useMemo(
    () => dashboardTissu(lots.map((l) => ({ quantiteRecue: l.quantiteRecue, bilan: l.bilan, statutKind: l.statut.kind }))),
    [lots],
  );
  const aReclamer = lots.filter((l) => l.ecarts.aReclamer && l.bilan.consomme <= 0).length;
  const nonControles = lots.filter((l) => !l.controle && l.bilan.disponible > 0).length;
  const aDemander = parCommande.filter((c) => c.etat.niveau === "manque");
  const couvrables = parCommande.filter((c) => c.etat.niveau === "stock").length;
  const nbReliquats = reliquats.reduce((s, g) => s + g.lots.length, 0);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">Magasin tissu</h1>
        <span className="text-xs text-muted-foreground">matière fournie par le client</span>
        <Link href="/magtissu/reception" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand bg-brand px-2.5 text-[11px] font-semibold text-white hover:opacity-90">
          📦 Réception tissu
        </Link>
        <Link href="/magtissu/inventaire" target="_blank" className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted">
          🖨 Inventaire
        </Link>
        <Link
          href={`/magtissu/etiquettes?ids=${lots.filter((l) => l.bilan.disponible > 0).map((l) => l.id).join(",")}`}
          target="_blank"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
        >
          🏷 Étiquettes QR des lots
        </Link>
      </div>

      <div className="grid grid-cols-[repeat(auto-fit,minmax(170px,1fr))] gap-3">
        <Kpi label="Commandes à demander au client" val={String(aDemander.length)} tone={aDemander.length ? "danger" : "success"} onClick={() => setOnglet("commandes")} />
        <Kpi label="Manques couvrables en stock" val={String(couvrables)} tone={couvrables ? "warning" : "neutral"} onClick={() => setOnglet("commandes")} />
        <Kpi label="Lots à réclamer (écart BL)" val={String(aReclamer)} tone={aReclamer ? "danger" : "success"} onClick={() => setOnglet("lots")} />
        <Kpi label="Lots non contrôlés" val={String(nonControles)} tone={nonControles ? "warning" : "success"} onClick={() => setOnglet("lots")} />
        <Kpi label="Reliquats à rendre" val={String(nbReliquats)} tone={nbReliquats ? "info" : "neutral"} onClick={() => setOnglet("reliquats")} />
      </div>

      <div className="flex flex-wrap items-center gap-1 text-xs">
        {(
          [
            ["commandes", "Besoin par commande"],
            ["lots", "Lots en magasin"],
            ["reliquats", "Reliquats client"],
            ["dashboard", "Tableau de bord"],
          ] as const
        ).map(([k, l]) => (
          <button key={k} onClick={() => setOnglet(k)} className={`rounded-md px-3 py-1.5 font-semibold ${onglet === k ? "bg-foreground text-background" : "hover:bg-muted"}`}>
            {l}
          </button>
        ))}
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="OF, client, lot, couleur…" className="ml-auto h-8 w-56 bg-card" />
      </div>

      {onglet === "dashboard" ? (
        <Dashboard d={d} />
      ) : onglet === "commandes" ? (
        <OngletCommandes rows={parCommande} q={q} peutSaisir={peutSaisir} />
      ) : onglet === "reliquats" ? (
        <OngletReliquats groupes={reliquats} bons={bonsRetour} q={q} peutSaisir={peutSaisir} />
      ) : (
        <OngletLots lots={lots} q={q} commandes={commandes} peutSaisir={peutSaisir} />
      )}
    </div>
  );
}

/* ═══════════ besoin par commande ═══════════ */

function OngletCommandes({ rows, q, peutSaisir }: { rows: MatiereCommandeRow[]; q: string; peutSaisir: boolean }) {
  const run = useRunner();
  const n = q.trim().toLowerCase();
  const vus = rows.filter((r) => !n || `${r.of} ${r.client} ${r.modele} ${r.couleur} ${r.refArticle} ${r.lots.join(" ")}`.toLowerCase().includes(n));
  const clientsADemander = [...new Set(rows.filter((r) => r.etat.aDemander > 0).map((r) => r.client).filter(Boolean))];

  return (
    <SectionPanel
      title={`Tissu par commande (${vus.length})`}
      flush
      actions={
        clientsADemander.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <span className="font-semibold text-muted-foreground">📨 Demande de complément :</span>
            {clientsADemander.map((c) => (
              <Link key={c} href={`/magtissu/complement?client=${encodeURIComponent(c)}`} target="_blank" className="rounded-md border border-[var(--danger)] px-2 py-1 font-semibold text-[var(--danger-d)] hover:bg-[var(--danger-l)]">
                {c}
              </Link>
            ))}
          </div>
        )
      }
    >
      <div className="border-b px-3 py-2 text-[11px] text-muted-foreground">
        Besoin = conso client × pièces × (1 + chute), depuis la Nomenclature · Affecté = tissu réservé depuis les lots ·
        les lots proposés sont ceux du <b>même client</b>, même référence et même couleur, encore libres.
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
              <th className="px-3 py-2 text-left">OF / Client</th>
              <th className="px-3 py-2 text-left">Modèle</th>
              <th className="px-3 py-2 text-left">Export</th>
              <th className="px-3 py-2 text-right">Besoin</th>
              <th className="px-3 py-2 text-right">Affecté</th>
              <th className="px-3 py-2 text-right">Consommé</th>
              <th className="px-3 py-2 text-right">Manque</th>
              <th className="px-3 py-2 text-left">État</th>
              <th className="px-3 py-2 text-left">Affecter depuis le stock</th>
              <th className="px-3 py-2" />
            </tr>
          </thead>
          <tbody>
            {vus.length === 0 ? (
              <tr>
                <td colSpan={10} className="py-10 text-center text-muted-foreground">
                  Aucune commande en attente de tissu.
                </td>
              </tr>
            ) : (
              vus.map((r) => {
                const niv = NIVEAUX[r.etat.niveau];
                const urgent = !r.lancee && r.joursExport != null && r.joursExport <= 30 && r.etat.manque > 0;
                return (
                  <tr key={r.id} className={`border-b align-top ${urgent ? "bg-[var(--danger-l)]/40" : ""}`}>
                    <td className="px-3 py-2">
                      <b>{r.of}</b>
                      <div className="text-[10px] text-muted-foreground">{r.client}</div>
                      {r.lancee && <StatusBadge tone="purple">lancée</StatusBadge>}
                    </td>
                    <td className="px-3 py-2">
                      {r.modele}
                      <div className="text-[10px] text-muted-foreground">
                        {[r.refArticle, r.couleur].filter(Boolean).join(" · ")} · {q2.format(r.qte)} pcs
                      </div>
                    </td>
                    <td className="px-3 py-2 tabular-nums">
                      {dateFr(r.dateExport)}
                      {r.joursExport != null && (
                        <div className={`text-[10px] ${r.joursExport < 0 ? "text-[var(--danger-d)]" : "text-muted-foreground"}`}>
                          {r.joursExport < 0 ? `dépassé de ${-r.joursExport} j` : `dans ${r.joursExport} j`}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.etat.besoin ? `${q2.format(r.etat.besoin)} m` : "—"}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {q2.format(r.etat.affecte)} m
                      {r.lots.length > 0 && <div className="text-[10px] text-muted-foreground">{r.lots.join(", ")}</div>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{r.etat.consomme ? `${q2.format(r.etat.consomme)} m` : "—"}</td>
                    <td className={`px-3 py-2 text-right font-bold tabular-nums ${r.etat.manque > 0 ? "text-[var(--danger-d)]" : ""}`}>
                      {r.etat.manque > 0 ? `${q2.format(r.etat.manque)} m` : "—"}
                      {r.etat.aDemander > 0 && r.etat.aDemander !== r.etat.manque && (
                        <div className="text-[10px] font-normal">dont {q2.format(r.etat.aDemander)} m à demander</div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <StatusBadge tone={niv.tone}>{niv.label}</StatusBadge>
                    </td>
                    <td className="px-3 py-2">
                      {r.propositions.length === 0 ? (
                        <span className="text-[10px] text-muted-foreground">{r.etat.manque > 0 ? "aucun lot libre de ce client" : "—"}</span>
                      ) : (
                        <div className="flex flex-col gap-1">
                          {r.propositions.map((p) => (
                            <div key={p.lotId} className="flex items-center gap-1.5">
                              <span className="font-mono text-[11px] font-bold">{p.identifiant}</span>
                              <span className="text-[10px] text-muted-foreground" title={p.raison}>
                                libre {q2.format(p.libre)} {p.unite}
                                {!p.controle && " · non contrôlé"}
                              </span>
                              {peutSaisir && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-6 px-2 text-[10.5px]"
                                  onClick={() => run(() => A.affecter({ lotId: p.lotId, commandeId: r.id, quantite: String(p.proposee) }), `${q2.format(p.proposee)} ${p.unite} affectés à ${r.of}`)}
                                >
                                  Affecter {q2.format(p.proposee)}
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right">
                      <Link href={`/magtissu/bilan/${r.id}`} target="_blank" className="whitespace-nowrap text-[11px] font-semibold text-brand hover:underline">
                        🖨 Bilan matière
                      </Link>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </SectionPanel>
  );
}

/* ═══════════ lots ═══════════ */

function OngletLots({ lots, q, commandes, peutSaisir }: { lots: LotRow[]; q: string; commandes: Choix[]; peutSaisir: boolean }) {
  const [filtre, setFiltre] = useState<"stock" | "reclamer" | "controle" | "tous">("stock");
  const n = q.trim().toLowerCase();
  const vus = lots.filter((l) => {
    if (n && !`${l.identifiant} ${l.couleur} ${l.reference} ${l.saison} ${l.client} ${l.blClient}`.toLowerCase().includes(n)) return false;
    if (filtre === "stock") return l.bilan.disponible > 0.001;
    if (filtre === "reclamer") return l.ecarts.aReclamer;
    if (filtre === "controle") return !l.controle && l.bilan.disponible > 0.001;
    return true;
  });
  return (
    <SectionPanel
      title={`Lots (${vus.length})`}
      flush
      actions={
        <div className="flex gap-1 text-[11px]">
          {(
            [
              ["stock", "En stock"],
              ["controle", "À contrôler"],
              ["reclamer", "Écart BL / défauts"],
              ["tous", "Tous"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} onClick={() => setFiltre(k)} className={`rounded-full px-2.5 py-1 font-semibold ${filtre === k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent"}`}>
              {l}
            </button>
          ))}
        </div>
      }
    >
      {vus.length === 0 ? (
        <div className="py-10 text-center text-xs text-muted-foreground">Aucun lot. Créez une réception tissu pour commencer.</div>
      ) : (
        <div className="divide-y">
          {vus.map((l) => (
            <LigneLot key={l.id} lot={l} commandes={commandes} peutSaisir={peutSaisir} />
          ))}
        </div>
      )}
    </SectionPanel>
  );
}

function LigneLot({ lot: l, commandes, peutSaisir }: { lot: LotRow; commandes: Choix[]; peutSaisir: boolean }) {
  const run = useRunner();
  const [ouvert, setOuvert] = useState(false);
  const b = l.bilan;
  const ctl = controleDe(l.controle);
  return (
    <div>
      <button onClick={() => setOuvert((v) => !v)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40">
        {ouvert ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-mono text-sm font-bold">{l.identifiant}</span>
        <span className="text-sm">{l.couleur || "—"}</span>
        {l.reference && <span className="text-xs text-muted-foreground">réf. {l.reference}</span>}
        {l.client && <StatusBadge tone="info">{l.client}</StatusBadge>}
        <StatusBadge tone={ctl.tone}>{ctl.label}</StatusBadge>
        {l.ecarts.aReclamer && <StatusBadge tone="danger">⚠ {l.ecarts.manque > 0 ? `manque ${q2.format(l.ecarts.manque)} ${l.unite}` : "écart BL"}</StatusBadge>}
        <StatusBadge tone={l.statut.tone}>{l.statut.label}</StatusBadge>
        <span className="ml-auto flex gap-3 text-xs tabular-nums">
          <span title="Reçu (mesuré)">Reçu <b>{q2.format(b.recu)}</b></span>
          <span title="Affecté" className="text-warning-foreground">Aff. <b>{q2.format(b.affecte)}</b></span>
          <span title="Consommé">Cons. <b>{q2.format(b.consomme)}</b></span>
          {b.rendu > 0 && <span title="Rendu au client">Rendu <b>{q2.format(b.rendu)}</b></span>}
          <span title="Disponible physique" className="text-success-foreground">Dispo <b>{q2.format(b.disponible)}</b></span>
        </span>
      </button>

      {ouvert && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {/* ── contrôle à réception ── */}
          <div className="rounded-lg border bg-card p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="text-[11px] font-bold uppercase text-muted-foreground">Contrôle à réception</span>
              {l.blClient && <span className="text-[11px] text-muted-foreground">BL client {l.blClient}</span>}
              <div className="ml-auto flex gap-1">
                {CONTROLES.map((c) => (
                  <button
                    key={c.value}
                    disabled={!peutSaisir}
                    onClick={() => run(() => A.majLot(l.id, "controle", c.value), `Contrôle : ${c.label}`)}
                    className={`rounded-full border px-2.5 py-1 text-[11px] font-semibold disabled:opacity-60 ${
                      l.controle === c.value ? "border-foreground bg-foreground text-background" : "bg-card hover:bg-muted"
                    }`}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid gap-2 sm:grid-cols-5">
              <ChampLot label={`Annoncé BL (${l.unite})`} valeur={l.quantiteAnnoncee != null ? String(l.quantiteAnnoncee) : ""} actif={peutSaisir} onSave={(v) => A.majLot(l.id, "quantiteAnnoncee", v)} />
              <Lecture label={`Mesuré (${l.unite})`} valeur={q2.format(l.quantiteRecue)} aide="corrigé par un ajustement" />
              <ChampLot label="Laize annoncée (cm)" valeur={l.laizeAnnoncee != null ? String(l.laizeAnnoncee) : ""} actif={peutSaisir} onSave={(v) => A.majLot(l.id, "laizeAnnoncee", v)} />
              <ChampLot label="Laize réelle (cm)" valeur={l.laize != null ? String(l.laize) : ""} actif={peutSaisir} onSave={(v) => A.majLot(l.id, "laize", v)} />
              <ChampLot label="Défauts constatés" valeur={l.defauts} actif={peutSaisir} onSave={(v) => A.majLot(l.id, "defauts", v)} />
            </div>
            {l.ecarts.aReclamer ? (
              <div className="mt-2 rounded-md border border-[var(--danger)] bg-[var(--danger-l)] px-3 py-2 text-xs text-[var(--danger-d)]">
                <b>À réclamer au client avant la coupe :</b>
                <ul className="ml-4 list-disc">
                  {l.ecarts.motifs.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
                <Link href={`/magtissu/reclamation/${l.receptionId}`} target="_blank" className="mt-1 inline-block font-semibold underline">
                  🧾 Imprimer la réclamation client
                </Link>
              </div>
            ) : l.ecarts.annonce != null ? (
              <div className="mt-2 text-[11px] text-success-foreground">✓ Conforme au bon de livraison du client (écart dans la tolérance).</div>
            ) : (
              <div className="mt-2 text-[11px] text-muted-foreground">Saisissez le métrage annoncé sur le BL client pour contrôler l&apos;écart.</div>
            )}
            <FicheRouleaux lot={l} actif={peutSaisir} />
          </div>

          {/* ── descriptif ── */}
          {peutSaisir && (
            <div className="grid gap-2 sm:grid-cols-4">
              <ChampLot label="Identifiant" valeur={l.identifiant} actif onSave={(v) => A.majLot(l.id, "identifiant", v)} />
              <ChampLot label="Référence" valeur={l.reference} actif onSave={(v) => A.majLot(l.id, "reference", v)} />
              <ChampLot label="Couleur" valeur={l.couleur} actif onSave={(v) => A.majLot(l.id, "couleur", v)} />
              <ChampLot label="Saison" valeur={l.saison} actif onSave={(v) => A.majLot(l.id, "saison", v)} />
            </div>
          )}

          <div className="grid grid-cols-2 gap-2 text-center text-xs sm:grid-cols-6">
            {[
              ["Reçu", b.recu, ""],
              ["Affecté", b.affecte, "text-warning-foreground"],
              ["Consommé", b.consomme, ""],
              ["Rendu client", b.rendu, ""],
              ["Disponible", b.disponible, "text-success-foreground"],
              ["Libre", b.libre, "text-brand"],
            ].map(([lib, v, cls]) => (
              <div key={lib as string} className="rounded border bg-card px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">{lib}</div>
                <div className={`text-base font-bold tabular-nums ${cls}`}>
                  {q2.format(v as number)} {l.unite}
                </div>
              </div>
            ))}
          </div>

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Affectations (réservé)</div>
            {l.affectations.length === 0 ? (
              <div className="text-xs text-muted-foreground">Aucune affectation.</div>
            ) : (
              <div className="space-y-1">
                {l.affectations.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{a.commandeLabel || "—"}</span>
                    <b className="tabular-nums">
                      {q2.format(a.quantite)} {l.unite}
                    </b>
                    {peutSaisir && (
                      <button onClick={() => run(() => A.supprimerAffectation(a.id), "Affectation retirée")} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {peutSaisir && <FormAffecter lotId={l.id} libre={b.libre} unite={l.unite} commandes={commandes} />}
          </div>

          {peutSaisir && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormSortie lotId={l.id} dispo={b.disponible} unite={l.unite} commandes={commandes} />
              <FormAjuster lotId={l.id} unite={l.unite} />
            </div>
          )}

          <div>
            <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Historique des mouvements ({l.mouvements.length})</div>
            {l.mouvements.length === 0 ? (
              <div className="text-xs text-muted-foreground">Aucun mouvement.</div>
            ) : (
              <div className="max-h-52 space-y-0.5 overflow-y-auto text-[11px]">
                {l.mouvements.map((m) => (
                  <div key={m.id} className="flex items-center gap-2">
                    <span className="w-20 shrink-0 text-muted-foreground">{dateHeure(m.date)}</span>
                    <SensBadge sens={m.sens} />
                    <span className="font-semibold tabular-nums">
                      {q2.format(m.quantite)} {l.unite}
                    </span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {m.commandeLabel && `→ ${m.commandeLabel} `}
                      {m.sens === "rendu" ? (
                        <Link href={`/magtissu/retour/${encodeURIComponent(m.motif)}`} target="_blank" className="underline">
                          {m.motif}
                        </Link>
                      ) : (
                        m.motif
                      )}
                      {m.createdBy && ` · ${m.createdBy}`}
                    </span>
                    {peutSaisir && m.sens !== "entree" && (
                      <button onClick={() => run(() => A.supprimerMouvement(m.id), "Mouvement supprimé")} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                        <Trash2 className="size-3" />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted-foreground">
            <span>
              Reçu le {dateFr(l.receptionDate)} · bon {l.receptionNumero}
              {l.fournisseur ? ` · ${l.fournisseur}` : ""}
              {l.note ? ` · ${l.note}` : ""}
            </span>
            <span className="flex gap-3">
              <Link href={`/magtissu/etiquettes?ids=${l.id}`} target="_blank" className="font-semibold text-brand hover:underline">
                🏷 Étiquette QR
              </Link>
              {peutSaisir && b.consomme <= 0 && b.affecte <= 0 && (
                <button onClick={() => run(() => A.supprimerLot(l.id), "Lot supprimé", `Supprimer le lot ${l.identifiant} ?`)} className="text-[var(--danger-d)] hover:underline">
                  Supprimer ce lot
                </button>
              )}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}

/** Contrôle rouleau par rouleau : n°, métrage étiqueté, mesuré, laize, défauts. */
function FicheRouleaux({ lot: l, actif }: { lot: LotRow; actif: boolean }) {
  const run = useRunner();
  const [ouvert, setOuvert] = useState(l.rouleaux.length > 0);
  const [lignes, setLignes] = useState<{ n: string; annonce: string; mesure: string; laize: string; defauts: string }[]>(
    l.rouleaux.map((r) => ({ n: r.n, annonce: r.annonce?.toString() ?? "", mesure: r.mesure?.toString() ?? "", laize: r.laize?.toString() ?? "", defauts: r.defauts })),
  );
  const tot = totauxRouleaux(
    lignes.map((r) => ({ n: r.n, annonce: r.annonce ? Number(r.annonce.replace(",", ".")) : null, mesure: r.mesure ? Number(r.mesure.replace(",", ".")) : null, laize: null, defauts: "" })) as RouleauControle[],
  );
  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="mt-2 text-[11px] font-semibold text-brand hover:underline">
        + Contrôle rouleau par rouleau
      </button>
    );
  }
  const set = (i: number, k: keyof (typeof lignes)[number], v: string) => setLignes((s) => s.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  return (
    <div className="mt-3">
      <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Rouleaux ({lignes.length})</div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            <th className="w-16 text-left">N°</th>
            <th className="text-left">Étiqueté ({l.unite})</th>
            <th className="text-left">Mesuré ({l.unite})</th>
            <th className="text-left">Laize (cm)</th>
            <th className="text-left">Défauts</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {lignes.map((r, i) => (
            <tr key={i}>
              {(["n", "annonce", "mesure", "laize", "defauts"] as const).map((k) => (
                <td key={k} className="py-0.5 pr-1">
                  <Input value={r[k]} disabled={!actif} onChange={(e) => set(i, k, e.target.value)} inputMode={k === "defauts" || k === "n" ? "text" : "decimal"} className="h-7 bg-card" />
                </td>
              ))}
              <td>
                {actif && (
                  <button onClick={() => setLignes((s) => s.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                    <Trash2 className="size-3" />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-1 flex flex-wrap items-center gap-2 text-[11px]">
        {actif && (
          <>
            <Button size="sm" variant="outline" className="h-7" onClick={() => setLignes((s) => [...s, { n: String(s.length + 1), annonce: "", mesure: "", laize: l.laize?.toString() ?? "", defauts: "" }])}>
              + Rouleau
            </Button>
            <Button size="sm" className="h-7" onClick={() => run(() => A.majLot(l.id, "rouleaux", JSON.stringify(lignes)), "Fiche rouleaux enregistrée")}>
              Enregistrer les rouleaux
            </Button>
            {tot.annonce != null && l.quantiteAnnoncee == null && (
              <Button size="sm" variant="ghost" className="h-7" onClick={() => run(() => A.majLot(l.id, "quantiteAnnoncee", String(tot.annonce)), "Métrage annoncé repris des rouleaux")}>
                Reporter l&apos;étiqueté ({q2.format(tot.annonce)}) comme annoncé
              </Button>
            )}
          </>
        )}
        <span className="text-muted-foreground">
          Total étiqueté <b>{tot.annonce != null ? q2.format(tot.annonce) : "—"}</b> · mesuré <b>{tot.mesure != null ? q2.format(tot.mesure) : "—"}</b> {l.unite}
          {tot.mesure != null && Math.abs(tot.mesure - l.quantiteRecue) > 0.5 && (
            <span className="text-warning-foreground"> — différent du reçu du lot ({q2.format(l.quantiteRecue)}) : corrigez par un ajustement</span>
          )}
        </span>
      </div>
    </div>
  );
}

/* ═══════════ reliquats ═══════════ */

function OngletReliquats({
  groupes,
  bons,
  q,
  peutSaisir,
}: {
  groupes: GroupeReliquats[];
  bons: { numero: string; date: string; lignes: number }[];
  q: string;
  peutSaisir: boolean;
}) {
  const router = useRouter();
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [pending, setPending] = useState(false);
  const n = q.trim().toLowerCase();
  const vus = groupes
    .map((g) => ({ ...g, lots: g.lots.filter((l) => !n || `${g.client} ${g.saison} ${l.identifiant} ${l.couleur} ${l.reference}`.toLowerCase().includes(n)) }))
    .filter((g) => g.lots.length);

  const rendre = async (ids: number[]) => {
    if (!ids.length) return;
    if (!confirm(`Rendre au client tout le disponible de ${ids.length} lot(s) ? Un bon de retour sera créé.`)) return;
    setPending(true);
    const r = await A.rendreAuClient({ lots: ids.map((lotId) => ({ lotId })) });
    setPending(false);
    if (!r.ok) return void toast.error(r.error);
    toast.success(`Bon de retour ${r.numero} créé`);
    setCoches(new Set());
    window.open(`/magtissu/retour/${encodeURIComponent(r.numero)}`, "_blank");
    router.refresh();
  };

  return (
    <div className="space-y-4">
      <SectionPanel title="Reliquats non rendus — par client et par saison">
        <p className="mb-3 text-xs text-muted-foreground">
          Tissu encore en magasin alors que la coupe des commandes qu&apos;il servait est terminée (ou lot jamais affecté depuis plus de
          60 jours). C&apos;est la matière du client : à lui rendre, ou à garder avec son accord pour une prochaine commande.
        </p>
        {vus.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">Aucun reliquat en attente. ✓</div>
        ) : (
          <div className="space-y-3">
            {vus.map((g) => {
              const ids = g.lots.map((l) => l.id);
              const choisis = ids.filter((id) => coches.has(id));
              return (
                <div key={`${g.client}-${g.saison}`} className="rounded-lg border">
                  <div className="flex flex-wrap items-center gap-2 border-b bg-muted/30 px-3 py-2">
                    <b>{g.client}</b>
                    <StatusBadge tone="neutral">{g.saison}</StatusBadge>
                    <span className="text-xs text-muted-foreground">
                      {Object.entries(g.totalParUnite)
                        .map(([u, v]) => `${q2.format(v)} ${u}`)
                        .join(" · ")}
                    </span>
                    {peutSaisir && (
                      <Button size="sm" variant="outline" className="ml-auto h-7" disabled={pending} onClick={() => rendre(choisis.length ? choisis : ids)}>
                        ↩ Rendre au client {choisis.length ? `(${choisis.length} lot(s))` : "(tout)"}
                      </Button>
                    )}
                  </div>
                  <table className="w-full text-xs">
                    <tbody>
                      {g.lots.map((l) => (
                        <tr key={l.id} className="border-b last:border-0">
                          <td className="w-8 px-3 py-1.5">
                            {peutSaisir && (
                              <input
                                type="checkbox"
                                checked={coches.has(l.id)}
                                onChange={(e) =>
                                  setCoches((s) => {
                                    const x = new Set(s);
                                    if (e.target.checked) x.add(l.id);
                                    else x.delete(l.id);
                                    return x;
                                  })
                                }
                              />
                            )}
                          </td>
                          <td className="px-2 py-1.5 font-mono font-bold">{l.identifiant}</td>
                          <td className="px-2 py-1.5">{l.couleur}</td>
                          <td className="px-2 py-1.5 text-muted-foreground">{l.reference}</td>
                          <td className="px-3 py-1.5 text-right font-semibold tabular-nums">
                            {q2.format(l.disponible)} {l.unite}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              );
            })}
          </div>
        )}
      </SectionPanel>

      {bons.length > 0 && (
        <SectionPanel title={`Bons de retour émis (${bons.length})`} flush>
          <div className="divide-y text-xs">
            {bons.map((b) => (
              <div key={b.numero} className="flex items-center gap-3 px-3 py-2">
                <span className="font-mono font-bold">{b.numero}</span>
                <span className="text-muted-foreground">{dateFr(b.date)}</span>
                <span className="text-muted-foreground">{b.lignes} lot(s)</span>
                <Link href={`/magtissu/retour/${encodeURIComponent(b.numero)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                  🖨 Réimprimer
                </Link>
              </div>
            ))}
          </div>
        </SectionPanel>
      )}
    </div>
  );
}

/* ═══════════ tableau de bord ═══════════ */

function Dashboard({ d }: { d: ReturnType<typeof dashboardTissu> }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Lots en magasin" val={String(d.nbLots)} />
        <Kpi label="Tissu reçu (total)" val={`${q2.format(d.totalRecu)} m`} />
        <Kpi label="Réservé (affecté)" val={`${q2.format(d.totalAffecte)} m`} tone="warning" />
        <Kpi label="Disponible physique" val={`${q2.format(d.totalDisponible)} m`} tone="success" />
      </div>
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Consommé" val={`${q2.format(d.totalConsomme)} m`} />
        <Kpi label="Libre (réservable)" val={`${q2.format(d.totalLibre)} m`} tone="info" />
        <Kpi label="Lots sans affectation" val={String(d.lotsSansAffectation)} tone={d.lotsSansAffectation ? "info" : "neutral"} />
        <Kpi label="Affectés non consommés" val={String(d.lotsAffectesNonConsommes)} tone={d.lotsAffectesNonConsommes ? "warning" : "neutral"} />
      </div>
      <div className="grid grid-cols-3 gap-3">
        <Kpi label="Lots libres" val={String(d.lotsLibres)} tone="info" />
        <Kpi label="Entièrement réservés" val={String(d.lotsReserves)} tone="warning" />
        <Kpi label="Épuisés" val={String(d.lotsEpuises)} tone="neutral" />
      </div>
    </div>
  );
}

/* ═══════════ éléments partagés ═══════════ */

function Kpi({
  label,
  val,
  tone = "neutral",
  onClick,
}: {
  label: string;
  val: string;
  tone?: "neutral" | "success" | "warning" | "danger" | "info";
  onClick?: () => void;
}) {
  const cls = {
    neutral: "text-foreground",
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    danger: "text-[var(--danger-d)]",
    info: "text-brand",
  }[tone];
  return (
    <button type="button" onClick={onClick} disabled={!onClick} className="rounded-lg border bg-card px-3 py-2.5 text-left enabled:hover:bg-accent/40">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`text-2xl font-extrabold tabular-nums ${cls}`}>{val}</div>
    </button>
  );
}

function SensBadge({ sens }: { sens: string }) {
  const map: Record<string, { l: string; t: "success" | "danger" | "info" | "warning" | "neutral" | "purple" }> = {
    entree: { l: "Entrée", t: "success" },
    sortie: { l: "Sortie", t: "danger" },
    retour: { l: "Retour", t: "info" },
    rendu: { l: "Rendu client", t: "purple" },
    ajustement: { l: "Ajust.", t: "warning" },
  };
  const m = map[sens] ?? { l: sens, t: "neutral" as const };
  return <StatusBadge tone={m.t}>{m.l}</StatusBadge>;
}

function FormAffecter({ lotId, libre, unite, commandes }: { lotId: number; libre: number; unite: string; commandes: Choix[] }) {
  const run = useRunner();
  const [cmd, setCmd] = useState("");
  const [qte, setQte] = useState("");
  return (
    <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
      <select value={cmd} onChange={(e) => setCmd(e.target.value)} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
        <option value="">— commande —</option>
        {commandes.map((c) => (
          <option key={c.id} value={c.id}>
            {c.label}
          </option>
        ))}
      </select>
      <Input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" placeholder={`≤ ${q2.format(libre)} ${unite}`} className="h-8 w-28 bg-card" />
      <Button size="sm" variant="outline" onClick={() => run(() => A.affecter({ lotId, commandeId: cmd ? Number(cmd) : null, quantite: qte }), "Tissu affecté").then(() => setQte(""))}>
        Affecter
      </Button>
    </div>
  );
}

function FormSortie({ lotId, dispo, unite, commandes }: { lotId: number; dispo: number; unite: string; commandes: Choix[] }) {
  const run = useRunner();
  const [cmd, setCmd] = useState("");
  const [qte, setQte] = useState("");
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Sortie vers la coupe / consommation</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={cmd} onChange={(e) => setCmd(e.target.value)} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
          <option value="">— commande —</option>
          {commandes.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
        <Input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" placeholder={`≤ ${q2.format(dispo)} ${unite}`} className="h-8 w-28 bg-card" />
        <Button size="sm" onClick={() => run(() => A.sortir({ lotId, commandeId: cmd ? Number(cmd) : null, quantite: qte }), "Sortie enregistrée").then(() => setQte(""))}>
          Sortir
        </Button>
      </div>
    </div>
  );
}

function FormAjuster({ lotId, unite }: { lotId: number; unite: string }) {
  const run = useRunner();
  const [ecart, setEcart] = useState("");
  return (
    <div className="rounded-lg border bg-card p-2">
      <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Ajustement d&apos;inventaire</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <Input value={ecart} onChange={(e) => setEcart(e.target.value)} inputMode="decimal" placeholder={`écart ± ${unite}`} className="h-8 w-28 bg-card" />
        <Button size="sm" variant="outline" onClick={() => run(() => A.ajuster({ lotId, ecart }), "Ajustement enregistré").then(() => setEcart(""))}>
          Ajuster
        </Button>
        <span className="text-[10px] text-muted-foreground">+ ajoute, − retire</span>
      </div>
    </div>
  );
}

function Lecture({ label, valeur, aide }: { label: string; valeur: string; aide?: string }) {
  return (
    <div className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground" title={aide}>
      {label}
      <div className="flex h-8 items-center rounded-md border bg-muted/40 px-2 font-normal text-foreground">{valeur}</div>
    </div>
  );
}

/* Champ éditable d'un lot : sauvegarde à la validation (Entrée ou perte de
 * focus), sans réécrire si rien n'a changé. */
function ChampLot({ label, valeur, onSave, actif }: { label: string; valeur: string; onSave: (v: string) => Promise<A.Result>; actif: boolean }) {
  const run = useRunner();
  const [v, setV] = useState(valeur);
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Input
        value={v}
        disabled={!actif}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== valeur && run(() => onSave(v), `${label} enregistré`)}
        onKeyDown={(e) => {
          if (e.key === "Enter") (e.target as HTMLInputElement).blur();
        }}
        className="h-8 bg-card font-normal"
      />
    </label>
  );
}

/* Exécuteur d'action partagé : confirme si besoin, toast, refresh. */
function useRunner() {
  const router = useRouter();
  return (fn: () => Promise<A.Result>, succes: string, confirmer?: string): Promise<void> => {
    if (confirmer && !confirm(confirmer)) return Promise.resolve();
    return fn().then((r) => {
      if (!r.ok) toast.error(r.error);
      else {
        toast.success(succes);
        router.refresh();
      }
    });
  };
}

