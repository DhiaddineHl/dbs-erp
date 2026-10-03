"use client";

import { Fragment, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Scissors } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/shared/page-header";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { CommandeAval, CoupeRow } from "@/lib/services/aval";
import type { FicheResume } from "@/lib/services/coupe";
import * as A from "@/lib/actions/aval";
import { majSeuilEcart } from "@/lib/actions/coupe";
import { BasculeRangees, PastilleCloture } from "@/components/shared/bascule-rangees";
import Link from "next/link";
import { BoutonAction, Kpi, Tuiles } from "../aval/ui";

type EtatPlanCoupe = "pret" | "estime" | "ordre";
const PLAN_LABEL: Record<EtatPlanCoupe, { label: string; tone: "success" | "warning" | "neutral" }> = {
  pret: { label: "Plan prêt", tone: "success" },
  estime: { label: "Plan (longueurs estimées)", tone: "warning" },
  ordre: { label: "Plan sans tracés", tone: "neutral" },
};

const nb = new Intl.NumberFormat("fr-FR");
const auj = () => new Date().toISOString().slice(0, 10);
const dateFr = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso || "—");

type Filtre = "tous" | "a_couper" | "en_cours" | "coupees";

const FILTRES: { value: Filtre; label: string }[] = [
  { value: "tous", label: "Toutes" },
  { value: "a_couper", label: "À couper" },
  { value: "en_cours", label: "Coupe en cours" },
  { value: "coupees", label: "Coupées" },
];

/** L'avancement de coupe se lit sur la commande ; le détail, sur ses lâchers. */
function etat(c: CommandeAval): { cle: Filtre; label: string; tone: "neutral" | "warning" | "success" } {
  if (c.coupeQte <= 0) return { cle: "a_couper", label: "À couper", tone: "neutral" };
  if (c.coupeQte < c.qte) return { cle: "en_cours", label: "En cours", tone: "warning" };
  return { cle: "coupees", label: "✓ Coupée", tone: "success" };
}

export function CoupeClient({
  commandes: toutes,
  coupes,
  plans,
  fiches,
  seuil,
  peutSaisir,
  peutReglerSeuil,
}: {
  commandes: CommandeAval[];
  coupes: CoupeRow[];
  plans: Record<number, EtatPlanCoupe>;
  fiches: FicheResume[];
  seuil: number;
  peutSaisir: boolean;
  peutReglerSeuil: boolean;
}) {
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<Filtre>("tous");
  const [ouvert, setOuvert] = useState<number | null>(null);
  /* Commandes déjà livrées ou facturées : rangées par défaut (même règle que
     la nomenclature et les magasins). */
  const [voirRangees, setVoirRangees] = useState(false);
  const nbRangees = toutes.filter((c) => c.cloture).length;
  const commandes = useMemo(() => (voirRangees ? toutes : toutes.filter((c) => !c.cloture)), [toutes, voirRangees]);
  const porteurDe = useMemo(() => new Map(toutes.map((c) => [c.id, c.parentId ?? c.id])), [toutes]);
  const ofDe = useMemo(() => new Map(toutes.map((c) => [c.id, c.of])), [toutes]);

  const parCommande = useMemo(() => {
    const m = new Map<number, CoupeRow[]>();
    for (const c of coupes) {
      const g = m.get(c.commandeId);
      if (g) g.push(c);
      else m.set(c.commandeId, [c]);
    }
    return m;
  }, [coupes]);

  const filtrees = useMemo(() => {
    const n = q.trim().toLowerCase();
    return commandes.filter((c) => {
      if (filtre !== "tous" && etat(c).cle !== filtre) return false;
      return !n || `${c.of} ${c.modele} ${c.client} ${c.refArticle}`.toLowerCase().includes(n);
    });
  }, [commandes, q, filtre]);

  const stats = useMemo(() => {
    const parEtat = { a_couper: 0, en_cours: 0, coupees: 0 };
    for (const c of commandes) parEtat[etat(c).cle as keyof typeof parEtat]++;
    return { ...parEtat, pieces: commandes.reduce((s, c) => s + c.coupeQte, 0) };
  }, [commandes]);

  return (
    <>
      <PageHeader
        icon={Scissors}
        title="Service coupe"
        description="Lâchers de coupe par commande — la production ne peut pas dépasser ce qui est coupé"
      />

      <Tuiles>
        <Kpi label="À couper" valeur={String(stats.a_couper)} tone="neutral" />
        <Kpi label="Coupe en cours" valeur={String(stats.en_cours)} tone="warning" />
        <Kpi label="Coupées" valeur={String(stats.coupees)} tone="success" />
        <Kpi label="Pièces coupées" valeur={nb.format(stats.pieces)} tone="brand" />
      </Tuiles>

      <SectionPanel
        title="Avancement de coupe"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <BasculeRangees nombre={nbRangees} visibles={voirRangees} onChange={setVoirRangees} />
            {peutReglerSeuil && <ReglageSeuil seuil={seuil} />}
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="OF, modèle, client…"
              className="h-8 w-52 bg-card"
            />
            <select
              value={filtre}
              onChange={(e) => setFiltre(e.target.value as Filtre)}
              className="h-8 rounded-md border border-input bg-card px-2 text-xs"
            >
              {FILTRES.map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
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
                <th className="px-3 py-2 text-left">OF</th>
                <th className="px-3 py-2 text-left">Modèle / Client</th>
                <th className="px-3 py-2 text-right">Commandé</th>
                <th className="px-3 py-2 text-right">Coupé</th>
                <th className="px-3 py-2 text-right">Reste</th>
                <th className="px-3 py-2 text-right">Produit</th>
                <th className="px-3 py-2 text-left">État</th>
                <th className="px-3 py-2 text-left">Plan de coupe</th>
                <th className="px-3 py-2 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-muted-foreground">
                    Aucune commande.
                  </td>
                </tr>
              ) : (
                filtrees.map((c) => {
                  const e = etat(c);
                  const lignes = parCommande.get(c.id) ?? [];
                  const porteur = porteurDe.get(c.id) ?? c.id;
                  const plan = plans[porteur];
                  const fichesCmd = fiches.filter((f) => f.commandeId === porteur);
                  const deplie = ouvert === c.id;
                  const reste = Math.max(0, c.qte - c.coupeQte);
                  // Produire plus que ce qui est coupé est impossible : on le signale ici aussi.
                  const incoherent = c.coupeQte > 0 && c.produit > c.coupeQte;
                  return (
                    <Fragment key={c.id}>
                      <tr className="border-b last:border-0">
                        <td className="px-3 py-2">
                          <button
                            className="font-bold text-brand hover:underline"
                            onClick={() => setOuvert(deplie ? null : c.id)}
                          >
                            {deplie ? "▾" : "▸"} {c.of}
                          </button>
                          <PastilleCloture cloture={c.cloture} />
                        </td>
                        <td className="px-3 py-2">
                          <b>{c.modele}</b>
                          <div className="text-[10px] text-muted-foreground">
                            {c.client}
                            {c.couleur && ` · ${c.couleur}`}
                          </div>
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">{nb.format(c.qte)}</td>
                        <td className="px-3 py-2 text-right font-semibold tabular-nums">{nb.format(c.coupeQte)}</td>
                        <td className="px-3 py-2 text-right tabular-nums text-muted-foreground">
                          {nb.format(reste)}
                        </td>
                        <td
                          className={`px-3 py-2 text-right tabular-nums ${incoherent ? "font-bold text-[var(--danger-d)]" : ""}`}
                          title={incoherent ? "Plus de pièces produites que coupées" : undefined}
                        >
                          {nb.format(c.produit)}
                          {incoherent && " ⚠"}
                        </td>
                        <td className="px-3 py-2">
                          <StatusBadge tone={e.tone}>{e.label}</StatusBadge>
                        </td>
                        <td className="px-3 py-2">
                          {plan ? (
                            <StatusBadge tone={PLAN_LABEL[plan].tone}>{PLAN_LABEL[plan].label}</StatusBadge>
                          ) : (
                            <Link href={`/modelisme/${porteur}/plan`} className="text-[11px] text-muted-foreground underline">
                              pas de plan
                            </Link>
                          )}
                          {porteur !== c.id && <div className="text-[10px] text-muted-foreground">via {ofDe.get(porteur)}</div>}
                        </td>
                        <td className="px-3 py-2 text-right">
                          <div className="flex justify-end gap-1.5">
                            {peutSaisir && plan && (
                              <Link
                                href={`/coupe/nouvelle?commande=${porteur}`}
                                className="inline-flex h-8 items-center rounded-md bg-primary px-2.5 text-[11px] font-semibold text-primary-foreground hover:opacity-90"
                              >
                                ✂ Couper depuis le plan
                              </Link>
                            )}
                            <Button variant="outline" size="sm" onClick={() => setOuvert(deplie ? null : c.id)}>
                              {fichesCmd.length ? `${fichesCmd.length} fiche${fichesCmd.length > 1 ? "s" : ""}` : `${lignes.length} lâcher${lignes.length > 1 ? "s" : ""}`}
                            </Button>
                          </div>
                        </td>
                      </tr>
                      {deplie && (
                        <tr className="border-b bg-muted/25 last:border-0">
                          <td colSpan={9} className="px-3 py-3">
                            {fichesCmd.length > 0 && <Fiches fiches={fichesCmd} />}
                            <Lachers
                              commande={c}
                              lignes={lignes}
                              peutSaisir={peutSaisir}
                              resteDefaut={reste || c.qte}
                              aUnPlan={!!plan}
                            />
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
    </>
  );
}

function Lachers({
  commande,
  lignes,
  peutSaisir,
  resteDefaut,
  aUnPlan,
}: {
  commande: CommandeAval;
  lignes: CoupeRow[];
  peutSaisir: boolean;
  resteDefaut: number;
  aUnPlan: boolean;
}) {
  const router = useRouter();
  const [date, setDate] = useState(auj());
  const [qte, setQte] = useState("");
  const [taille, setTaille] = useState("");
  const [type, setType] = useState("interne");
  const [note, setNote] = useState("");
  const [pending, start] = useTransition();

  return (
    <div className="space-y-3">
      {lignes.length === 0 ? (
        <p className="text-[11px] text-muted-foreground">Aucun lâcher enregistré.</p>
      ) : (
        <table className="w-full text-[11px]">
          <thead>
            <tr className="text-[10px] uppercase text-muted-foreground">
              <th className="py-1 text-left">Date</th>
              <th className="py-1 text-right">Quantité</th>
              <th className="py-1 text-left">Taille</th>
              <th className="py-1 text-left">Type</th>
              <th className="py-1 text-left">Note</th>
              <th className="py-1" />
            </tr>
          </thead>
          <tbody>
            {lignes.map((l) => (
              <tr key={l.id} className={`border-t border-border/60 ${l.ficheAnnulee ? "text-muted-foreground line-through" : ""}`}>
                <td className="py-1 tabular-nums">{dateFr(l.date)}</td>
                <td className="py-1 text-right font-semibold tabular-nums">{nb.format(l.qte)}</td>
                <td className="py-1">{l.taille || "toutes"}</td>
                <td className="py-1 text-muted-foreground">{l.type}</td>
                <td className="py-1 text-muted-foreground">{l.note || "—"}</td>
                <td className="py-1 text-right">
                  {l.fiche ? (
                    <Link href={`/coupe/fiche/${encodeURIComponent(l.fiche)}`} className="font-mono text-[10.5px] text-brand hover:underline">
                      {l.fiche}
                      {l.qtePrevue != null && ` · prévu ${nb.format(l.qtePrevue)}`}
                    </Link>
                  ) : peutSaisir && (
                    <BoutonAction
                      variant="ghost"
                      onRun={() => A.supprimerCoupe(l.id)}
                      confirmer="Supprimer ce lâcher de coupe ?"
                      succes="Lâcher supprimé"
                    >
                      🗑
                    </BoutonAction>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {peutSaisir && aUnPlan && (
        <p className="text-[11px] text-muted-foreground">
          Cette commande a un plan de coupe : la coupe se saisit depuis le plan (« ✂ Couper depuis le plan »), pour que les tailles et quantités ne soient jamais retapées.
        </p>
      )}
      {peutSaisir && !aUnPlan && (
        <div className="flex flex-wrap items-end gap-2 rounded-lg border bg-card px-3 py-2">
          <span className="w-full text-[10.5px] font-semibold text-warning-foreground">
            Saisie libre (exception) : cette commande n&apos;a pas de plan de coupe. Préférez faire préparer le plan par le Bureau modélisme.
          </span>
          <Cellule label="Date">
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="rounded border border-input bg-card px-1.5 py-1 text-[11px]"
            />
          </Cellule>
          <Cellule label="Quantité">
            <input
              type="number"
              value={qte}
              onChange={(e) => setQte(e.target.value)}
              placeholder={String(resteDefaut)}
              className="w-24 rounded border border-input bg-card px-1.5 py-1 text-right text-[11px]"
            />
          </Cellule>
          <Cellule label="Taille">
            <input
              value={taille}
              onChange={(e) => setTaille(e.target.value)}
              placeholder="toutes"
              className="w-24 rounded border border-input bg-card px-1.5 py-1 text-[11px]"
            />
          </Cellule>
          <Cellule label="Type">
            <select
              value={type}
              onChange={(e) => setType(e.target.value)}
              className="rounded border border-input bg-card px-1.5 py-1 text-[11px]"
            >
              <option value="interne">Interne</option>
              <option value="soustraite">Sous-traitée</option>
            </select>
          </Cellule>
          <Cellule label="Note">
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="w-44 rounded border border-input bg-card px-1.5 py-1 text-[11px]"
            />
          </Cellule>
          <Button
            size="sm"
            disabled={pending || !qte}
            onClick={() =>
              start(async () => {
                const r = await A.ajouterCoupe({ commandeId: commande.id, date, qte, taille, type, note });
                if (!r.ok) {
                  toast.error(r.error);
                  return;
                }
                toast.success(`${nb.format(Number(qte))} pcs coupées`);
                setQte("");
                setTaille("");
                setNote("");
                router.refresh();
              })
            }
          >
            + Enregistrer le lâcher
          </Button>
        </div>
      )}
    </div>
  );
}

function Fiches({ fiches }: { fiches: FicheResume[] }) {
  return (
    <div className="mb-3 rounded-lg border bg-card">
      <div className="border-b px-3 py-1.5 text-[10.5px] font-bold uppercase text-muted-foreground">Fiches de coupe (depuis le plan)</div>
      <div className="divide-y text-[11.5px]">
        {fiches.map((f) => (
          <div key={f.id} className={`flex flex-wrap items-center gap-3 px-3 py-1.5 ${f.statut === "annulee" ? "text-muted-foreground line-through" : ""}`}>
            <Link href={`/coupe/fiche/${encodeURIComponent(f.numero)}`} className="font-mono font-bold text-brand hover:underline">
              {f.numero}
            </Link>
            <span>{dateFr(f.date)}</span>
            <span className="tabular-nums">
              coupé <b>{nb.format(f.pieces)}</b> / prévu {nb.format(f.prevu)}
            </span>
            {f.statut === "annulee" && <StatusBadge tone="danger">annulée</StatusBadge>}
            {f.pv ? (
              <Link href={`/coupe/pv/${encodeURIComponent(f.pv)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                🖨 {f.pv} v{f.pvVersion}
              </Link>
            ) : (
              f.statut === "validee" && (
                <Link href={`/coupe/fiche/${encodeURIComponent(f.numero)}`} className="ml-auto text-muted-foreground hover:underline">
                  PV à générer →
                </Link>
              )
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Seuil d'écart (% par taille) au-delà duquel un motif est exigé. */
function ReglageSeuil({ seuil }: { seuil: number }) {
  const router = useRouter();
  const [v, setV] = useState(String(seuil));
  return (
    <label className="flex items-center gap-1 text-[11px] text-muted-foreground" title="Écart prévu / coupé (par taille) au-delà duquel un motif est obligatoire">
      Motif si écart &gt;
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        onBlur={async () => {
          if (v === String(seuil)) return;
          const r = await majSeuilEcart(v);
          if (!r.ok) return void toast.error(r.error);
          toast.success(`Seuil d'écart : ${v} %`);
          router.refresh();
        }}
        inputMode="decimal"
        className="h-8 w-12 rounded border border-input bg-card px-1 text-center"
      />
      %
    </label>
  );
}

function Cellule({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase text-muted-foreground">{label}</div>
      {children}
    </div>
  );
}
