"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { KpiCard } from "@/components/shared/kpi-card";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge, type Tone } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import * as A from "@/lib/actions/plan-coupe";
import * as pc from "@/lib/domain/plan-coupe";
import type { ContexteCommande } from "@/lib/services/plan-coupe";

/* L'éditeur de la fiche de matelassage.
 *
 * Tout se calcule ici, à la frappe, avec `lib/domain/plan-coupe` — le même
 * module que le serveur. C'est ce qui permet à la modéliste de voir le métrage
 * bouger pendant qu'elle règle la hauteur d'un matelas, sans qu'une deuxième
 * arithmétique vienne contredire la première au moment d'enregistrer.
 *
 * L'enregistrement est explicite : le plan part d'un bloc, comme la feuille
 * qu'il remplace. */

const nb = new Intl.NumberFormat("fr-FR");
const m2 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const m3 = new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 3, maximumFractionDigits: 3 });

const cellule = "w-full rounded-md border border-input bg-card px-1.5 py-1 text-center text-xs tabular-nums";
const th = "border border-border bg-muted px-2 py-1.5 text-[11px] font-bold text-brand";
const td = "border border-border px-1.5 py-1 text-center text-xs tabular-nums";

export function EditeurPlan({
  ctx,
  planInitial,
  existe,
  tracesFaites,
  peutModifier,
}: {
  ctx: ContexteCommande;
  planInitial: pc.Plan;
  existe: boolean;
  tracesFaites: boolean;
  peutModifier: boolean;
}) {
  const router = useRouter();
  const [plan, setPlan] = useState<pc.Plan>(planInitial);
  const [active, setActive] = useState(0);
  const [pending, start] = useTransition();
  /* `sale` : des changements ne sont pas encore en base. Les reports lisent le
   * plan ENREGISTRÉ côté serveur, donc ils doivent attendre l'enregistrement —
   * sinon on reporterait une consommation que personne n'a sauvegardée. */
  const [sale, setSale] = useState(!existe);
  /* Le plan a-t-il une existence en base ? Bascule au premier enregistrement,
     sinon l'en-tête continuerait d'annoncer « à préparer » un plan déjà rangé. */
  const [enregistre, setEnregistre] = useState(existe);

  const [dlgTailles, setDlgTailles] = useState<string | null>(null);
  const [dlgMatiere, setDlgMatiere] = useState<string | null>(null);
  const [dlgSuppr, setDlgSuppr] = useState<number | null>(null);
  const [dlgCopie, setDlgCopie] = useState(false);
  const [suites, setSuites] = useState<A.SuitesEnregistrement | null>(null);

  const matiere = plan.matieres[active] ?? plan.matieres[0];

  const calc = useMemo(() => {
    if (!matiere) return null;
    const coupe = pc.piecesParTaille(matiere, plan.sizes);
    return {
      coupe,
      ecarts: pc.ecartsParTaille(plan, matiere),
      commande: pc.totalCommande(plan),
      pieces: pc.piecesTotales(matiere, plan.sizes),
      metres: pc.consoTotale(matiere),
      estime: pc.estEstime(matiere),
      consoPiece: pc.consoReellePiece(matiere, plan.sizes),
      complet: pc.planComplet(plan),
    };
  }, [plan, matiere]);

  /* ─────────── mutations locales ─────────── */

  const modifier = (f: (p: pc.Plan) => pc.Plan) => {
    setPlan((p) => f(structuredClone(p)));
    setSale(true);
  };
  const modifierMatiere = (f: (m: pc.Matiere) => void) =>
    modifier((p) => {
      const m = p.matieres[active];
      if (m) f(m);
      return p;
    });

  const nombre = (v: string) => {
    const n = Number(v.replace(",", "."));
    return Number.isFinite(n) && n >= 0 ? n : 0;
  };

  /* ─────────── écritures serveur ─────────── */

  const enregistrer = (apres?: () => void) =>
    start(async () => {
      const res = await A.enregistrerPlan(ctx.id, plan);
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      setSale(false);
      setEnregistre(true);
      setPlan((p) => ({ ...p, par: res.data.par, date: res.data.date || null }));
      toast.success("Plan enregistré");
      if (res.data.correctionRefusee) toast.warning(res.data.correctionRefusee);
      const propose = res.data.corrigerTailles || res.data.validerTraces;
      if (propose) setSuites(res.data);
      router.refresh();
      apres?.();
    });

  const exigerEnregistre = () => {
    if (sale) {
      toast.error("Enregistrez le plan avant de le reporter sur la commande");
      return false;
    }
    return true;
  };

  const reporterConsoReelle = () =>
    exigerEnregistre() &&
    start(async () => {
      const res = await A.reporterConsoReelle(ctx.id, matiere.rang);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Consommation réelle ${m3.format(res.data)} m/pièce reportée sur la commande`);
      router.refresh();
    });

  const reporterConsoPrevue = () =>
    exigerEnregistre() &&
    start(async () => {
      const res = await A.reporterConsoPrevue(ctx.id, matiere.rang);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Consommation prévue ${m3.format(res.data)} m/pièce reportée sur la commande`);
      router.refresh();
    });

  const reporterTailles = () =>
    exigerEnregistre() &&
    start(async () => {
      const res = await A.reporterTailles(ctx.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success(`Commande corrigée : ${res.data.lignes} taille(s) · ${nb.format(res.data.total)} pcs`);
      setSuites(null);
      router.refresh();
    });

  const validerTraces = () =>
    start(async () => {
      const res = await A.validerTraces(ctx.id);
      if (!res.ok) return void toast.error(res.error);
      toast.success("Étape « Tirage des tracés » validée");
      setSuites(null);
      router.refresh();
    });

  if (!matiere || !calc) return <SectionPanel>Plan vide.</SectionPanel>;

  const besoin = pc.matierePrincipale(plan);
  const metresPrincipale = besoin ? pc.consoTotale(besoin) : 0;
  const ecartTissu = ctx.tissuRecu - metresPrincipale;
  const etat = pc.etatPlan(enregistre ? plan : null);

  return (
    <>
      {/* ═══════════ bandeau de liaison avec la commande ═══════════ */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        <StatusBadge tone="brand">
          OF {ctx.of || "—"} · {ctx.client || "—"} · {ctx.modele}
        </StatusBadge>
        {ctx.estPorteur && (
          <StatusBadge tone="purple">
            🧩 groupe : {ctx.nbMembres} OF · {nb.format(ctx.qteGroupe)} pcs
          </StatusBadge>
        )}
        <StatusBadge tone={etat.tone}>{etat.label}</StatusBadge>
        {plan.par && (
          <StatusBadge tone="neutral">
            préparé par {plan.par}
            {plan.date ? ` le ${plan.date}` : ""}
          </StatusBadge>
        )}
        <StatusBadge tone="neutral">
          conso prévue commande : {ctx.consoTheo ? `${m3.format(ctx.consoTheo)} m/pc` : "—"}
        </StatusBadge>
        <StatusBadge tone="neutral">
          conso réelle commande : {ctx.consoReel ? `${m3.format(ctx.consoReel)} m/pc` : "—"}
        </StatusBadge>
        {ctx.tissuRecu > 0 ? (
          <StatusBadge tone={ecartTissu >= 0 ? "success" : "danger"}>
            tissu reçu {m2.format(ctx.tissuRecu)} m · besoin plan {m2.format(metresPrincipale)} m ·{" "}
            {ecartTissu >= 0 ? `marge +${m2.format(ecartTissu)} m` : `MANQUE ${m2.format(-ecartTissu)} m`}
          </StatusBadge>
        ) : (
          <StatusBadge tone="neutral">tissu reçu : — (réception non saisie)</StatusBadge>
        )}
        {!peutModifier && <StatusBadge tone="warning">👁 consultation — préparation réservée au bureau modélisme</StatusBadge>}
        {sale && peutModifier && <StatusBadge tone="warning">modifications non enregistrées</StatusBadge>}
      </div>

      {/* ═══════════ laize travaillable — saisie par le magasin tissu ═══════════
          La modéliste la lit ici pour poser ses tracés, sans ouvrir l'écran
          magasin. Rien à saisir : c'est un rappel de ce que le magasin a
          renseigné. */}
      {ctx.tissuMagasin.length > 0 && (
        <div className="mb-4 rounded-lg border bg-card px-3 py-2">
          <div className="mb-1.5 text-[11px] font-bold uppercase text-muted-foreground">
            🧶 Laize travaillable (renseignée par le magasin tissu)
          </div>
          <div className="flex flex-wrap gap-2">
            {ctx.tissuMagasin.map((m, i) => (
              <div key={i} className="rounded-md border bg-muted/40 px-2.5 py-1.5 text-[11px]">
                <span className="font-semibold">{m.nom || "Matière"}</span>
                {m.reference ? <span className="text-muted-foreground"> · {m.reference}</span> : null}
                {m.couleur ? <span className="text-muted-foreground"> · {m.couleur}</span> : null}
                <span className="ml-1.5 font-bold text-brand">
                  {m.laize != null ? `laize ${m2.format(m.laize)} cm` : "laize non renseignée"}
                </span>
                {m.metrageRecu > 0 && <span className="text-muted-foreground"> · reçu {m2.format(m.metrageRecu)} m</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {ctx.tailles.length === 0 && (
        <div className="mb-4 rounded-lg border border-warning bg-warning-muted px-3 py-2 text-xs">
          ⚠ Cette commande est saisie en <b>taille unique</b>. Détaillez les vraies tailles ci-dessous, puis
          « Corriger les tailles de la commande » : c&apos;est le plan qui ventile la grille.
        </div>
      )}

      {/* ═══════════ 1 · commande à couper ═══════════ */}
      <SectionPanel
        title="1 · Commande à couper"
        actions={
          peutModifier && (
            <Button size="sm" variant="outline" onClick={() => setDlgTailles(plan.sizes.join(", "))}>
              ＋ Modifier la gamme de tailles
            </Button>
          )
        }
      >
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <tbody>
              <tr>
                <th className={`${th} text-left`}>Taille</th>
                {plan.sizes.map((s) => (
                  <th key={s} className={th}>
                    {s}
                  </th>
                ))}
                <th className={th}>Total</th>
              </tr>
              <tr>
                <td className={`${td} bg-muted text-left font-semibold`}>Qté</td>
                {plan.sizes.map((s) => (
                  <td key={s} className={td}>
                    <input
                      type="number"
                      min={0}
                      className={`${cellule} w-16`}
                      value={plan.ordre[s] ?? 0}
                      disabled={!peutModifier}
                      onChange={(e) =>
                        modifier((p) => {
                          p.ordre[s] = Math.trunc(nombre(e.target.value));
                          return p;
                        })
                      }
                    />
                  </td>
                ))}
                <td className={`${td} bg-success-muted font-bold`}>{nb.format(calc.commande)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {/* ═══════════ 2 · contraintes ═══════════ */}
      <SectionPanel title="2 · Contraintes de l'atelier">
        <div className="grid gap-3 sm:grid-cols-3">
          <ChampNombre
            label="Max pièces / tracé"
            value={plan.contraintes.maxPiecesTrace}
            disabled={!peutModifier}
            onChange={(v) => modifier((p) => ({ ...p, contraintes: { ...p.contraintes, maxPiecesTrace: v } }))}
          />
          <ChampNombre
            label="Max plis / matelas"
            value={plan.contraintes.maxPlis}
            disabled={!peutModifier}
            onChange={(v) => modifier((p) => ({ ...p, contraintes: { ...p.contraintes, maxPlis: v } }))}
          />
          <ChampNombre
            label="Surplus toléré / taille"
            value={plan.contraintes.surplusTolere}
            disabled={!peutModifier}
            onChange={(v) => modifier((p) => ({ ...p, contraintes: { ...p.contraintes, surplusTolere: v } }))}
          />
        </div>
      </SectionPanel>

      {/* ═══════════ 3 · matières et tracés ═══════════ */}
      <SectionPanel title="3 · Matières">
        <div className="mb-3 flex flex-wrap gap-1.5">
          {plan.matieres.map((m, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setActive(i)}
              className={`rounded-md border px-3 py-1.5 text-xs font-semibold ${
                i === active ? "border-brand bg-brand text-white" : "border-input bg-muted hover:bg-accent"
              }`}
            >
              {m.nom}
              {plan.matieres.length > 1 && peutModifier && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label={`Supprimer ${m.nom}`}
                  className="ml-2 opacity-70 hover:opacity-100"
                  onClick={(e) => {
                    e.stopPropagation();
                    setDlgSuppr(i);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.stopPropagation();
                      setDlgSuppr(i);
                    }
                  }}
                >
                  ✕
                </span>
              )}
            </button>
          ))}
          {peutModifier && (
            <button
              type="button"
              onClick={() => setDlgMatiere("")}
              className="rounded-md border border-dashed border-input px-3 py-1.5 text-xs font-semibold text-brand hover:bg-accent"
            >
              ＋ Matière
            </button>
          )}
        </div>

        <div className="mb-3 grid gap-3 sm:grid-cols-4">
          <ChampTexte
            label="Matière"
            value={matiere.nom}
            disabled={!peutModifier}
            onChange={(v) => modifierMatiere((m) => void (m.nom = v))}
          />
          <ChampNombre
            label="Laise (cm)"
            value={matiere.laise ?? ""}
            disabled={!peutModifier}
            onChange={(v) => modifierMatiere((m) => void (m.laise = v))}
          />
          <ChampNombre
            label="Conso prévue (m/pc)"
            step="0.001"
            value={matiere.consoPrevue ?? ""}
            disabled={!peutModifier}
            onChange={(v) => modifierMatiere((m) => void (m.consoPrevue = v))}
          />
          <ChampNombre
            label="Perte bout matelas (m)"
            step="0.01"
            value={matiere.perteBout ?? ""}
            disabled={!peutModifier}
            onChange={(v) => modifierMatiere((m) => void (m.perteBout = v))}
          />
        </div>

        {/* ── tracés ── */}
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className={`${th} text-left`}>Tracé</th>
                <th className={th}>Long. (m)</th>
                <th className={th}>Plis</th>
                {plan.sizes.map((s) => (
                  <th key={s} className={th}>
                    {s}
                  </th>
                ))}
                <th className={th}>Conso</th>
                <th className={th} />
              </tr>
            </thead>
            <tbody>
              {matiere.traces.map((t, i) => (
                <tr key={i}>
                  <td className={`${td} text-left`}>
                    <input
                      className={`${cellule} w-28 text-left`}
                      value={t.nom}
                      placeholder={`Tracé ${i + 1}`}
                      disabled={!peutModifier}
                      onChange={(e) => modifierMatiere((m) => void (m.traces[i].nom = e.target.value))}
                    />
                  </td>
                  <td className={td}>
                    <input
                      className={`${cellule} w-20 ${t.estime && t.longueur > 0 ? "border-warning bg-warning-muted italic" : ""}`}
                      value={t.longueur || ""}
                      title={t.estime ? "Longueur estimée — saisissez la vraie après placement" : ""}
                      disabled={!peutModifier}
                      onChange={(e) =>
                        modifierMatiere((m) => {
                          // Saisir une longueur, c'est l'avoir mesurée : le
                          // drapeau « estimé » tombe de lui-même.
                          m.traces[i].longueur = nombre(e.target.value);
                          m.traces[i].estime = false;
                        })
                      }
                    />
                    {t.estime && t.longueur > 0 && (
                      <div className="text-[8.5px] font-bold uppercase text-warning-foreground">estimé</div>
                    )}
                  </td>
                  <td className={td}>
                    <input
                      type="number"
                      min={0}
                      className={`${cellule} w-14`}
                      value={t.plis || ""}
                      disabled={!peutModifier}
                      onChange={(e) => modifierMatiere((m) => void (m.traces[i].plis = Math.trunc(nombre(e.target.value))))}
                    />
                  </td>
                  {plan.sizes.map((s) => (
                    <td key={s} className={td}>
                      <input
                        type="number"
                        min={0}
                        className={`${cellule} w-14`}
                        value={t.qty[s] || ""}
                        disabled={!peutModifier}
                        onChange={(e) =>
                          modifierMatiere((m) => void (m.traces[i].qty[s] = Math.trunc(nombre(e.target.value))))
                        }
                      />
                    </td>
                  ))}
                  <td className={`${td} bg-muted font-semibold`}>{m2.format(t.longueur * t.plis)}</td>
                  <td className={td}>
                    {peutModifier && (
                      <button
                        type="button"
                        aria-label={`Supprimer le tracé ${i + 1}`}
                        className="rounded bg-[var(--danger-l)] px-2 py-0.5 font-bold text-[var(--danger-d)]"
                        onClick={() => modifierMatiere((m) => void m.traces.splice(i, 1))}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              <tr className="bg-success-muted font-bold">
                <td className={`${td} text-left`}>Coupé →</td>
                <td className={td} />
                <td className={td}>{matiere.traces.reduce((a, t) => a + t.plis, 0)}</td>
                {plan.sizes.map((s) => (
                  <td key={s} className={td}>
                    {nb.format(calc.coupe[s] ?? 0)}
                  </td>
                ))}
                <td className={td}>{m2.format(calc.metres)}</td>
                <td className={td} />
              </tr>
            </tbody>
          </table>
        </div>

        {peutModifier && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => modifierMatiere((m) => void m.traces.push(pc.traceVide(plan.sizes)))}
            >
              ＋ Matelas
            </Button>
            <Button
              size="sm"
              onClick={() => {
                if (calc.commande <= 0) return void toast.error("Saisissez d'abord les quantités par taille");
                const traces = pc.proposerTraces(plan, matiere);
                modifierMatiere((m) => void (m.traces = traces));
                const surplus = plan.sizes.reduce((a, s) => {
                  const coupe = traces.reduce((x, t) => x + (t.qty[s] ?? 0) * t.plis, 0);
                  return a + Math.max(0, coupe - (plan.ordre[s] ?? 0));
                }, 0);
                toast.success(
                  `${traces.length} tracés proposés · surplus ${surplus} pièce(s)` +
                    ((matiere.consoPrevue ?? 0) > 0 ? " · longueurs estimées, à confirmer après placement" : ""),
                );
              }}
            >
              🎯 Proposer les tracés
            </Button>
            <Button size="sm" variant="outline" disabled={plan.matieres.length < 2} onClick={() => setDlgCopie(true)}>
              📋 Copier une autre matière
            </Button>
          </div>
        )}
      </SectionPanel>

      {/* ═══════════ contrôle coupé / commandé ═══════════ */}
      <SectionPanel title={`Contrôle — coupé vs commandé (${matiere.nom})`}>
        <div className="overflow-x-auto">
          <table className="border-collapse">
            <tbody>
              <tr>
                <th className={`${th} text-left`}>Taille</th>
                {plan.sizes.map((s) => (
                  <th key={s} className={th}>
                    {s}
                  </th>
                ))}
                <th className={th}>Total</th>
              </tr>
              <tr>
                <td className={`${td} bg-muted text-left font-semibold`}>Commandé</td>
                {plan.sizes.map((s) => (
                  <td key={s} className={td}>
                    {nb.format(plan.ordre[s] ?? 0)}
                  </td>
                ))}
                <td className={`${td} font-bold`}>{nb.format(calc.commande)}</td>
              </tr>
              <tr>
                <td className={`${td} bg-muted text-left font-semibold`}>Coupé</td>
                {plan.sizes.map((s) => (
                  <td key={s} className={td}>
                    {nb.format(calc.coupe[s] ?? 0)}
                  </td>
                ))}
                <td className={`${td} font-bold`}>{nb.format(calc.pieces)}</td>
              </tr>
              <tr>
                <td className={`${td} bg-muted text-left font-semibold`}>Écart</td>
                {plan.sizes.map((s) => {
                  const d = calc.ecarts[s] ?? 0;
                  const fond = d < 0 ? "bg-[var(--danger-l)] text-[var(--danger-d)]" : d > 0 ? "bg-warning-muted text-warning-foreground" : "bg-success-muted text-success-foreground";
                  return (
                    <td key={s} className={`${td} font-bold ${fond}`}>
                      {d > 0 ? "+" : ""}
                      {d}
                    </td>
                  );
                })}
                <td className={`${td} font-bold`}>
                  {calc.pieces - calc.commande > 0 ? "+" : ""}
                  {calc.pieces - calc.commande}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {/* ═══════════ KPI ═══════════ */}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard label="Commandées" value={nb.format(calc.commande)} tone="brand" />
        <KpiCard label="Coupées" value={nb.format(calc.pieces)} tone="brand" />
        <KpiCard
          label="Écart pièces"
          value={`${calc.pieces - calc.commande > 0 ? "+" : ""}${calc.pieces - calc.commande}`}
          tone={calc.pieces < calc.commande ? "danger" : "success"}
        />
        <KpiCard
          label={`Conso ${calc.estime ? "estimée" : "réelle"} / pc`}
          value={calc.consoPiece ? `${m3.format(calc.consoPiece)} m` : "—"}
          tone={ecartConsoTone(calc.estime, matiere.consoPrevue, calc.consoPiece)}
          sub={sousTitreConso(calc.estime, matiere.consoPrevue, calc.consoPiece)}
        />
        <KpiCard
          label={`Tissu total (${matiere.nom})`}
          value={`${m2.format(calc.metres)} m`}
          tone="purple"
          sub={
            (matiere.consoPrevue ?? 0) > 0 && calc.pieces > 0
              ? `prévu ≈ ${m2.format((matiere.consoPrevue ?? 0) * calc.pieces)} m`
              : undefined
          }
        />
      </div>

      {/* ═══════════ comparaison des matières ═══════════ */}
      {plan.matieres.length > 1 && (
        <SectionPanel title="Comparaison des matières">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr>
                  <th className={`${th} text-left`}>Matière</th>
                  <th className={th}>Pièces</th>
                  <th className={th}>Prévu / pc</th>
                  <th className={th}>Réel / pc</th>
                  <th className={th}>Tissu réel</th>
                </tr>
              </thead>
              <tbody>
                {plan.matieres.map((m, i) => {
                  const pieces = pc.piecesTotales(m, plan.sizes);
                  const metres = pc.consoTotale(m);
                  const reel = pc.consoReellePiece(m, plan.sizes);
                  const est = pc.estEstime(m);
                  return (
                    <tr key={i}>
                      <td className={`${td} text-left font-semibold`}>{m.nom}</td>
                      <td className={td}>{nb.format(pieces)}</td>
                      <td className={td}>{m.consoPrevue ? m3.format(m.consoPrevue) : "—"}</td>
                      <td className={td}>{reel ? `${m3.format(reel)}${est ? " (est.)" : ""}` : "—"}</td>
                      <td className={`${td} bg-muted font-semibold`}>
                        {m2.format(metres)} m{est ? " (est.)" : ""}
                      </td>
                    </tr>
                  );
                })}
                <tr className="bg-success-muted font-bold">
                  <td className={`${td} text-left`}>TOTAL</td>
                  <td className={td} />
                  <td className={td} />
                  <td className={td} />
                  <td className={td}>{m2.format(plan.matieres.reduce((a, m) => a + pc.consoTotale(m), 0))} m</td>
                </tr>
              </tbody>
            </table>
          </div>
        </SectionPanel>
      )}

      {/* ═══════════ liaison avec la commande ═══════════ */}
      <SectionPanel title="Liaison avec la commande" icon="↩">
        <p className="mb-3 text-[11px] text-muted-foreground">
          Chaque report écrit sur la fiche commande et laisse une ligne dans son journal.
          {calc.estime && " Les longueurs sont encore estimées : la consommation réelle ne peut pas être reportée."}
        </p>
        <div className="flex flex-wrap gap-2">
          {peutModifier && (
            <>
              <Button size="sm" disabled={pending} onClick={() => enregistrer()}>
                💾 Enregistrer le plan
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || calc.estime || !calc.pieces}
                title={calc.estime ? "Saisissez les longueurs réelles après placement" : undefined}
                onClick={reporterConsoReelle}
              >
                ↩ Conso réelle → commande
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={pending || !(matiere.consoPrevue ?? 0)}
                onClick={reporterConsoPrevue}
              >
                ↩ Conso prévue → commande
              </Button>
              <Button size="sm" variant="outline" disabled={pending} onClick={reporterTailles}>
                ↩ Corriger les tailles de la commande
              </Button>
              {calc.complet && !tracesFaites && (
                <Button size="sm" variant="outline" disabled={pending} onClick={validerTraces}>
                  ✅ Valider « Tirage des tracés »
                </Button>
              )}
            </>
          )}
          <Link
            href={`/modelisme/${ctx.id}/plan/imprimer`}
            className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
          >
            <Printer className="size-3.5" /> Fiche matelassage
          </Link>
        </div>
      </SectionPanel>

      {/* ═══════════ dialogues ═══════════ */}

      <DialogSaisie
        open={dlgTailles !== null}
        titre="Gamme de tailles"
        aide="Séparez les tailles par des virgules. Les quantités déjà saisies sont conservées."
        valeur={dlgTailles ?? ""}
        onFermer={() => setDlgTailles(null)}
        onValider={(v) => {
          const sizes = [...new Set(v.split(",").map((x) => x.trim()).filter(Boolean))];
          if (!sizes.length) return void toast.error("Indiquez au moins une taille");
          modifier((p) => pc.changerTailles(p, sizes));
          setDlgTailles(null);
        }}
      />

      <DialogSaisie
        open={dlgMatiere !== null}
        titre="Nouvelle matière"
        aide="Thermocollant, doublure, passepoil… chaque matière a sa laise et ses propres tracés."
        valeur={dlgMatiere ?? ""}
        onFermer={() => setDlgMatiere(null)}
        onValider={(v) => {
          modifier((p) => {
            p.matieres.push(pc.matiereVide(p.sizes, p.matieres.length, v.trim() || `Matière ${p.matieres.length + 1}`));
            return p;
          });
          setActive(plan.matieres.length);
          setDlgMatiere(null);
        }}
      />

      <Dialog open={dlgSuppr !== null} onOpenChange={(o) => !o && setDlgSuppr(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Supprimer la matière</DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Supprimer « {dlgSuppr !== null ? plan.matieres[dlgSuppr]?.nom : ""} » et tous ses tracés ?
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgSuppr(null)}>
              Annuler
            </Button>
            <Button
              onClick={() => {
                const i = dlgSuppr!;
                modifier((p) => {
                  p.matieres.splice(i, 1);
                  p.matieres.forEach((m, k) => (m.rang = k));
                  return p;
                });
                setActive((a) => Math.max(0, Math.min(a, plan.matieres.length - 2)));
                setDlgSuppr(null);
              }}
            >
              Supprimer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dlgCopie} onOpenChange={setDlgCopie}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copier la structure d&apos;une autre matière</DialogTitle>
          </DialogHeader>
          <p className="mb-2 text-xs text-muted-foreground">
            Les tailles et la hauteur des matelas sont reprises ; les longueurs restent à mesurer, car la laise
            diffère.
          </p>
          <div className="flex flex-col gap-1.5">
            {plan.matieres.map((m, i) =>
              i === active ? null : (
                <Button
                  key={i}
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const traces = pc.copierStructure(m);
                    modifierMatiere((cible) => void (cible.traces = traces));
                    setDlgCopie(false);
                    toast.success(`Structure copiée depuis « ${m.nom} »`);
                  }}
                >
                  {m.nom} · {m.traces.length} tracé(s)
                </Button>
              ),
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDlgCopie(false)}>
              Annuler
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Les suites de l'enregistrement — les deux automatismes de PilotPro,
          proposés seulement quand le serveur les a jugés applicables. */}
      <Dialog open={suites !== null} onOpenChange={(o) => !o && setSuites(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Le plan peut mettre la commande à jour</DialogTitle>
          </DialogHeader>
          {suites?.corrigerTailles && (
            <div className="rounded-lg border p-3 text-xs">
              <div className="mb-1 font-bold">Le plan détaille la commande par taille</div>
              <div className="text-muted-foreground">Avant : {suites.corrigerTailles.avant}</div>
              <div className="text-muted-foreground">Après : {suites.corrigerTailles.apres}</div>
              <div className="mt-1">
                Quantité totale : <b>{nb.format(ctx.qte)}</b> → <b>{nb.format(suites.corrigerTailles.total)}</b>
              </div>
              <Button size="sm" className="mt-2" disabled={pending} onClick={reporterTailles}>
                Mettre à jour la commande {ctx.of}
              </Button>
            </div>
          )}
          {suites?.validerTraces && (
            <div className="rounded-lg border p-3 text-xs">
              <div className="mb-1 font-bold">Le plan est complet</div>
              <div className="text-muted-foreground">
                Longueurs réelles saisies et commande couverte — l&apos;étape « Tirage des tracés » peut être
                validée.
              </div>
              <Button size="sm" className="mt-2" disabled={pending} onClick={validerTraces}>
                Valider « Tirage des tracés »
              </Button>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setSuites(null)}>
              Plus tard
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

/* ─────────── petits champs ─────────── */

function ChampTexte({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  disabled?: boolean;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Input value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className="h-8 text-sm" />
    </label>
  );
}

function ChampNombre({
  label,
  value,
  step,
  disabled,
  onChange,
}: {
  label: string;
  value: number | string;
  step?: string;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-[11px] font-semibold text-muted-foreground">
      {label}
      <Input
        type="number"
        min={0}
        step={step}
        value={value}
        disabled={disabled}
        onChange={(e) => {
          const n = Number(e.target.value.replace(",", "."));
          onChange(Number.isFinite(n) && n >= 0 ? n : 0);
        }}
        className="h-8 text-sm tabular-nums"
      />
    </label>
  );
}

function DialogSaisie({
  open,
  titre,
  aide,
  valeur,
  onFermer,
  onValider,
}: {
  open: boolean;
  titre: string;
  aide: string;
  valeur: string;
  onFermer: () => void;
  onValider: (v: string) => void;
}) {
  const [v, setV] = useState(valeur);
  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) setV(valeur);
        else onFermer();
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{titre}</DialogTitle>
        </DialogHeader>
        <p className="text-xs text-muted-foreground">{aide}</p>
        <Input
          value={v}
          autoFocus
          onChange={(e) => setV(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && onValider(v)}
        />
        <DialogFooter>
          <Button variant="outline" onClick={onFermer}>
            Annuler
          </Button>
          <Button onClick={() => onValider(v)}>Valider</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────── mise en forme de l'écart de consommation ─────────── */

function ecartConsoTone(estime: boolean, prevue: number | null, reelle: number | null): Tone {
  if (estime || !prevue || !reelle) return "brand";
  return reelle - prevue <= 0.0001 ? "success" : "danger";
}

function sousTitreConso(estime: boolean, prevue: number | null, reelle: number | null): string | undefined {
  if (estime) return prevue ? `estimée — prévu ${m3.format(prevue)} m` : "estimée — vraie conso après placement";
  if (!prevue || !reelle) return undefined;
  const e = reelle - prevue;
  const pct = (e / prevue) * 100;
  return `prévu ${m3.format(prevue)} m · ${e > 0 ? "+" : ""}${m3.format(e)} m (${pct > 0 ? "+" : ""}${pct.toFixed(1)} %)`;
}
