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
import { dashboardTissu } from "@/lib/domain/tissu";
import type { LotRow } from "@/lib/services/tissu";
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

export function MagasinTissu({
  lots,
  commandes,
  peutSaisir,
}: {
  lots: LotRow[];
  commandes: Choix[];
  peutSaisir: boolean;
}) {
  const [onglet, setOnglet] = useState<"inventaire" | "dashboard">("inventaire");
  const [q, setQ] = useState("");

  const filtres = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (!n) return lots;
    return lots.filter((l) => `${l.identifiant} ${l.couleur} ${l.reference} ${l.saison}`.toLowerCase().includes(n));
  }, [lots, q]);

  const d = useMemo(
    () => dashboardTissu(lots.map((l) => ({ quantiteRecue: l.quantiteRecue, bilan: l.bilan, statutKind: l.statut.kind }))),
    [lots],
  );

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-lg font-bold">Magasin tissu</h1>
        <Link
          href="/magtissu/reception"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand bg-brand px-2.5 text-[11px] font-semibold text-white hover:opacity-90"
        >
          📦 Réception tissu
        </Link>
        <Link
          href="/magtissu/inventaire"
          target="_blank"
          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
        >
          🖨 Inventaire
        </Link>
        <div className="ml-auto flex gap-1 text-xs">
          {(
            [
              ["inventaire", "Inventaire par lot"],
              ["dashboard", "Tableau de bord"],
            ] as const
          ).map(([k, l]) => (
            <button
              key={k}
              onClick={() => setOnglet(k)}
              className={`rounded-md px-3 py-1.5 font-semibold ${onglet === k ? "bg-foreground text-background" : "hover:bg-muted"}`}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {onglet === "dashboard" ? (
        <Dashboard d={d} />
      ) : (
        <SectionPanel
          title={`Lots en magasin (${filtres.length})`}
          actions={
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Identifiant, couleur, réf…" className="h-8 w-56 bg-card" />
          }
          flush
        >
          {filtres.length === 0 ? (
            <div className="py-10 text-center text-xs text-muted-foreground">
              Aucun lot. Créez une réception tissu pour commencer.
            </div>
          ) : (
            <div className="divide-y">
              {filtres.map((l) => (
                <LigneLot key={l.id} lot={l} commandes={commandes} peutSaisir={peutSaisir} />
              ))}
            </div>
          )}
        </SectionPanel>
      )}
    </div>
  );
}

function Dashboard({ d }: { d: ReturnType<typeof dashboardTissu> }) {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
        <Kpi label="Lots en magasin" val={String(d.nbLots)} />
        <Kpi label="Tissu reçu (total)" val={`${q2.format(d.totalRecu)} m`} />
        <Kpi label="Réservé (affecté)" val={`${q2.format(d.totalAffecte)} m`} tone="warning" />
        <Kpi label="Disponible physique" val={`${q2.format(d.totalDisponible)} m`} tone="success" gros />
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

function Kpi({ label, val, tone = "neutral", gros }: { label: string; val: string; tone?: "neutral" | "success" | "warning" | "danger" | "info"; gros?: boolean }) {
  const cls = {
    neutral: "text-foreground",
    success: "text-success-foreground",
    warning: "text-warning-foreground",
    danger: "text-[var(--danger-d)]",
    info: "text-brand",
  }[tone];
  return (
    <div className="rounded-lg border bg-card px-3 py-2.5">
      <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={`${gros ? "text-3xl" : "text-2xl"} font-extrabold tabular-nums ${cls}`}>{val}</div>
    </div>
  );
}

function LigneLot({ lot: l, commandes, peutSaisir }: { lot: LotRow; commandes: Choix[]; peutSaisir: boolean }) {
  const run = useRunner();
  const [ouvert, setOuvert] = useState(false);
  const b = l.bilan;
  return (
    <div>
      <button onClick={() => setOuvert((v) => !v)} className="flex w-full flex-wrap items-center gap-2 px-3 py-2.5 text-left hover:bg-accent/40">
        {ouvert ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        <span className="font-mono text-sm font-bold">{l.identifiant}</span>
        <span className="text-sm">{l.couleur || "—"}</span>
        {l.reference && <span className="text-xs text-muted-foreground">réf. {l.reference}</span>}
        {l.laize != null && <span className="text-xs text-muted-foreground">laize {q2.format(l.laize)} cm</span>}
        <StatusBadge tone={l.statut.tone}>{l.statut.label}</StatusBadge>
        <span className="ml-auto flex gap-3 text-xs tabular-nums">
          <span title="Reçu">Reçu <b>{q2.format(b.recu)}</b></span>
          <span title="Affecté" className="text-warning-foreground">Aff. <b>{q2.format(b.affecte)}</b></span>
          <span title="Consommé">Cons. <b>{q2.format(b.consomme)}</b></span>
          <span title="Disponible physique" className="text-success-foreground">Dispo <b>{q2.format(b.disponible)}</b></span>
        </span>
      </button>

      {ouvert && (
        <div className="space-y-3 border-t bg-muted/20 px-4 py-3">
          {/* Champs descriptifs éditables — dont l'identifiant, pour renommer un
              lot repris « MIGR-… » en un vrai code (point 4). */}
          {peutSaisir && (
            <div className="grid gap-2 sm:grid-cols-4">
              <ChampLot label="Identifiant" valeur={l.identifiant} onSave={(v) => A.majLot(l.id, "identifiant", v)} />
              <ChampLot label="Référence" valeur={l.reference} onSave={(v) => A.majLot(l.id, "reference", v)} />
              <ChampLot label="Couleur" valeur={l.couleur} onSave={(v) => A.majLot(l.id, "couleur", v)} />
              <ChampLot
                label="Laize (cm)"
                valeur={l.laize != null ? String(l.laize) : ""}
                onSave={(v) => A.majLot(l.id, "laize", v)}
              />
            </div>
          )}
          {/* résumé chiffré */}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 text-center text-xs">
            {[
              ["Reçu", b.recu, ""],
              ["Affecté", b.affecte, "text-warning-foreground"],
              ["Consommé", b.consomme, ""],
              ["Disponible", b.disponible, "text-success-foreground"],
              ["Libre", b.libre, "text-brand"],
            ].map(([lib, v, cls]) => (
              <div key={lib as string} className="rounded border bg-card px-2 py-1.5">
                <div className="text-[10px] uppercase text-muted-foreground">{lib}</div>
                <div className={`text-base font-bold tabular-nums ${cls}`}>{q2.format(v as number)} {l.unite}</div>
              </div>
            ))}
          </div>

          {/* affectations */}
          <div>
            <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Affectations (réservé)</div>
            {l.affectations.length === 0 ? (
              <div className="text-xs text-muted-foreground">Aucune affectation.</div>
            ) : (
              <div className="space-y-1">
                {l.affectations.map((a) => (
                  <div key={a.id} className="flex items-center gap-2 text-xs">
                    <span className="flex-1">{a.commandeLabel || "—"}</span>
                    <b className="tabular-nums">{q2.format(a.quantite)} {l.unite}</b>
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

          {/* sortie / consommation + ajustement */}
          {peutSaisir && (
            <div className="grid gap-3 sm:grid-cols-2">
              <FormSortie lotId={l.id} dispo={b.disponible} unite={l.unite} commandes={commandes} />
              <FormAjuster lotId={l.id} unite={l.unite} />
            </div>
          )}

          {/* journal des mouvements */}
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
                    <span className="tabular-nums font-semibold">{q2.format(m.quantite)} {l.unite}</span>
                    <span className="flex-1 truncate text-muted-foreground">
                      {m.commandeLabel && `→ ${m.commandeLabel} `}
                      {m.motif}
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

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span>
              Reçu le {dateFr(l.receptionDate)} · bon {l.receptionNumero}
              {l.fournisseur ? ` · ${l.fournisseur}` : ""}
              {l.note ? ` · ${l.note}` : ""}
            </span>
            {peutSaisir && b.consomme <= 0 && b.affecte <= 0 && (
              <button onClick={() => run(() => A.supprimerLot(l.id), "Lot supprimé", `Supprimer le lot ${l.identifiant} ?`)} className="text-[var(--danger-d)] hover:underline">
                Supprimer ce lot
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SensBadge({ sens }: { sens: string }) {
  const map: Record<string, { l: string; t: "success" | "danger" | "info" | "warning" | "neutral" }> = {
    entree: { l: "Entrée", t: "success" },
    sortie: { l: "Sortie", t: "danger" },
    retour: { l: "Retour", t: "info" },
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
          <option key={c.id} value={c.id}>{c.label}</option>
        ))}
      </select>
      <Input value={qte} onChange={(e) => setQte(e.target.value)} inputMode="decimal" placeholder={`≤ ${q2.format(libre)} ${unite}`} className="h-8 w-28 bg-card" />
      <Button
        size="sm"
        variant="outline"
        onClick={() =>
          run(
            () => A.affecter({ lotId, commandeId: cmd ? Number(cmd) : null, quantite: qte }),
            "Tissu affecté",
          ).then(() => setQte(""))
        }
      >
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
      <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Sortie / consommation</div>
      <div className="flex flex-wrap items-center gap-1.5">
        <select value={cmd} onChange={(e) => setCmd(e.target.value)} className="h-8 rounded-md border border-input bg-card px-1 text-xs">
          <option value="">— commande —</option>
          {commandes.map((c) => (
            <option key={c.id} value={c.id}>{c.label}</option>
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

/* Champ éditable d'un lot : sauvegarde à la validation (Entrée ou perte de
 * focus), sans réécrire si rien n'a changé. */
function ChampLot({ label, valeur, onSave }: { label: string; valeur: string; onSave: (v: string) => Promise<A.Result> }) {
  const run = useRunner();
  const [v, setV] = useState(valeur);
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Input
        value={v}
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
