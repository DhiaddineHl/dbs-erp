"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as R from "@/lib/actions/rouleaux";
import { STATUTS_ROULEAU, filtrerRouleaux, statutLabel, type IndicateursRouleaux } from "@/lib/domain/rouleau";
import type { RouleauRow } from "@/lib/services/rouleaux";
import type { LotRow } from "@/lib/services/tissu";

const q2 = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const lire = (s: string) => Number(String(s).replace(",", ".")) || 0;
const r2 = (n: number) => Math.round(n * 100) / 100;

export type IndicateursAffiches = IndicateursRouleaux & { total: number; ecartsInventaire: number | null; dernierInventaire: { numero: string; statut: string } | null };

/* ═══════════ indicateurs rouleaux ═══════════ */

export function KpisRouleaux({ i, onFiltre }: { i: IndicateursAffiches; onFiltre?: (f: { statut?: string; sansEmplacement?: boolean }) => void }) {
  const cartes: { l: string; v: string; tone?: string; f?: { statut?: string; sansEmplacement?: boolean } }[] = [
    { l: "Rouleaux en stock", v: String(i.enStock), f: { statut: "en_stock" } },
    { l: "Métrage disponible", v: `${q2.format(i.metrageDisponible)} m`, tone: "text-success-foreground" },
    { l: "À réceptionner (scan)", v: String(i.enAttente), tone: i.enAttente ? "text-warning-foreground" : "", f: { statut: "en_attente" } },
    { l: "À mesurer (scan)", v: String(i.aMesurer), tone: i.aMesurer ? "text-warning-foreground" : "", f: { statut: "a_mesurer" } },
    { l: "Sans emplacement", v: String(i.sansEmplacement), tone: i.sansEmplacement ? "text-warning-foreground" : "", f: { sansEmplacement: true } },
    { l: "Sortis non soldés", v: `${i.sortisNonConsommes} · ${q2.format(i.metrageEnCoupe)} m`, tone: i.sortisNonConsommes ? "text-brand" : "", f: { statut: "sorti" } },
    { l: "Métrage sorti", v: `${q2.format(i.metrageSorti)} m` },
    { l: "Consommé", v: `${q2.format(i.metrageConsomme)} m` },
    { l: "Chute", v: `${q2.format(i.metrageChute)} m` },
    { l: "Retours en stock", v: `${q2.format(i.metrageRetour)} m` },
    {
      l: i.dernierInventaire ? `Écarts inventaire ${i.dernierInventaire.numero}` : "Écarts d'inventaire",
      v: i.ecartsInventaire == null ? "—" : String(i.ecartsInventaire),
      tone: i.ecartsInventaire ? "text-[var(--danger-d)]" : "",
    },
  ];
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-3">
      {cartes.map((c) => (
        <button
          key={c.l}
          type="button"
          disabled={!c.f || !onFiltre}
          onClick={() => c.f && onFiltre?.(c.f)}
          className="rounded-lg border bg-card px-3 py-2.5 text-left enabled:hover:bg-accent/40"
        >
          <div className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{c.l}</div>
          <div className={`text-xl font-extrabold tabular-nums ${c.tone ?? ""}`}>{c.v}</div>
        </button>
      ))}
    </div>
  );
}

/* ═══════════ onglet Rouleaux : recherche, sélection, étiquettes ═══════════ */

const ROULEAUX_FINIS = new Set(["epuise", "rendu", "retourne", "annule"]);
const fini = (r: RouleauRow) => r.lot.archive || ROULEAUX_FINIS.has(r.statut);

export type BonSortieResume = { numero: string; date: string; lieu: string; commande: string; rouleaux: number; metrage: number };
export type RecapResume = { numero: string; date: string; lieu: string; rouleaux: number; metrage: number; bons: string[] };

export function OngletRouleaux({
  rouleaux,
  indicateurs,
  q,
  peutSaisir,
  bons = [],
  recaps = [],
}: {
  rouleaux: RouleauRow[];
  indicateurs: IndicateursAffiches;
  q: string;
  peutSaisir: boolean;
  bons?: BonSortieResume[];
  recaps?: RecapResume[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [statut, setStatut] = useState("");
  const [emplacement, setEmplacement] = useState("");
  const [fournisseur, setFournisseur] = useState("");
  const [sansEmplacement, setSansEmplacement] = useState(false);
  const [coches, setCoches] = useState<Set<number>>(new Set());
  const [sansBon, setSansBon] = useState(false);
  /* Rouleaux finis (épuisés, rendus, retournés) et rouleaux des lots archivés :
     masqués par défaut — sauf si l'on filtre expressément sur ce statut. */
  const [voirFinis, setVoirFinis] = useState(false);
  const nbFinis = useMemo(() => rouleaux.filter(fini).length, [rouleaux]);
  const vus = useMemo(
    () =>
      filtrerRouleaux(rouleaux, { q, statut, emplacement, fournisseur, sansEmplacement })
        .filter((r) => voirFinis || statut || !fini(r))
        .filter((r) => !sansBon || (r.chez && !r.bonSortie))
        .reverse(),
    [rouleaux, q, statut, emplacement, fournisseur, sansEmplacement, sansBon, voirFinis],
  );
  const affiches = vus.slice(0, 400);
  const choisis = [...coches];

  const retourFournisseur = () => {
    const sel = rouleaux.filter((r) => coches.has(r.id));
    const motif = prompt(`Retour au fournisseur de ${sel.length} rouleau(x) (tout leur disponible).\nMotif (obligatoire) :`);
    if (!motif?.trim()) return;
    start(async () => {
      const r = await R.retourFournisseur({ rouleaux: sel.map((x) => ({ code: x.code })), motif });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Bon ${r.numero} créé`);
      setCoches(new Set());
      window.open(`/magtissu/retour/${encodeURIComponent(r.numero)}`, "_blank");
      router.refresh();
    });
  };

  /* Un seul bon pour les rouleaux cochés déjà partis (sortis un par un au
     scan) : même destinataire obligatoire, voir R.bonPourRouleaux. */
  const selSortis = rouleaux.filter((r) => coches.has(r.id) && (r.chez || r.bonSortie || r.statut === "sorti"));
  const bonDeSortie = () => {
    const sel = rouleaux.filter((r) => coches.has(r.id));
    start(async () => {
      const r = await R.bonPourRouleaux(sel.map((x) => x.code));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.nouveau ? `Bon ${r.numero} établi pour ${r.n} rouleau(x)` : `Déjà sur le bon ${r.numero} : réimpression`);
      window.open(`/magtissu/sortie/${encodeURIComponent(r.numero)}`, "_blank");
      router.refresh();
    });
  };

  /* Bon RÉCAPITULATIF : un seul document pour des rouleaux déjà partis chez le
     même destinataire, même s'ils ont chacun leur bon (R.bonRecapitulatif). */
  const recapitulatif = () => {
    const sel = rouleaux.filter((r) => coches.has(r.id));
    start(async () => {
      const r = await R.bonRecapitulatif(sel.map((x) => x.code));
      if (!r.ok) return void toast.error(r.error);
      toast.success(r.nouveau ? `Bon récapitulatif ${r.numero} établi pour ${r.n} rouleau(x)` : `Déjà récapitulé sur ${r.numero} : réimpression`);
      window.open(`/magtissu/recap/${encodeURIComponent(r.numero)}`, "_blank");
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <KpisRouleaux
        i={indicateurs}
        onFiltre={(f) => {
          setStatut(f.statut ?? "");
          setSansEmplacement(!!f.sansEmplacement);
        }}
      />
      <SectionPanel
        title={`Rouleaux (${vus.length}${vus.length > affiches.length ? `, ${affiches.length} affichés` : ""})`}
        flush
        actions={
          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
            <select value={statut} onChange={(e) => setStatut(e.target.value)} className="h-7 rounded-md border border-input bg-card px-1">
              <option value="">Tous statuts</option>
              {Object.entries(STATUTS_ROULEAU).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </select>
            <Input value={emplacement} onChange={(e) => setEmplacement(e.target.value)} placeholder="Emplacement" className="h-7 w-24 bg-card text-[11px]" />
            <Input value={fournisseur} onChange={(e) => setFournisseur(e.target.value)} placeholder="Fournisseur" className="h-7 w-28 bg-card text-[11px]" />
            <label className="flex items-center gap-1">
              <input type="checkbox" checked={sansEmplacement} onChange={(e) => setSansEmplacement(e.target.checked)} /> sans emplacement
            </label>
            <label className="flex items-center gap-1" title="Rouleaux dehors (coupe, sous-traitant) dont la sortie n'est sur aucun bon : cochez-les puis « Bon de sortie »">
              <input type="checkbox" checked={sansBon} onChange={(e) => setSansBon(e.target.checked)} /> 🚚 sortis sans bon
            </label>
            {nbFinis > 0 && (
              <label className="flex items-center gap-1 text-muted-foreground" title="Rouleaux épuisés, rendus, retournés au fournisseur, ou de lots archivés">
                <input type="checkbox" checked={voirFinis} onChange={(e) => setVoirFinis(e.target.checked)} /> 🗄 finis / archivés ({nbFinis})
              </label>
            )}
          </div>
        }
      >
        {choisis.length > 0 && (
          <div className="flex flex-wrap items-center gap-2 border-b bg-accent/30 px-3 py-2 text-[11px]">
            <b>{choisis.length} sélectionné(s)</b>
            {(["thermique", "standard", "a4x4", "a4"] as const).map((f) => (
              <Link key={f} href={`/magtissu/etiquettes/rouleaux?ids=${choisis.join(",")}&format=${f}`} target="_blank" className="rounded-md border bg-card px-2 py-1 font-semibold hover:bg-muted">
                🏷 {f === "thermique" ? "100×50" : f === "standard" ? "70×37" : f === "a4x4" ? "A4 ×4" : "A4 ×24"}
              </Link>
            ))}
            {peutSaisir && (
              <Link
                href={`/m/tissu/sortie?codes=${rouleaux.filter((r) => coches.has(r.id)).map((r) => r.code).join(",")}`}
                target="_blank"
                className="rounded-md border border-amber-500 bg-amber-50 px-2 py-1 font-semibold text-amber-900 hover:bg-amber-100"
              >
                🚚 Sortie groupée
              </Link>
            )}
            {peutSaisir && selSortis.length > 0 && (
              <Button
                size="sm"
                className="h-7 bg-slate-900 text-white hover:bg-slate-800"
                disabled={pending}
                onClick={bonDeSortie}
                title="Un seul bon de livraison pour tous les rouleaux cochés déjà sortis chez le même destinataire"
              >
                🖨 Bon de sortie ({choisis.length})
              </Button>
            )}
            {peutSaisir && selSortis.length > 0 && (
              <Button
                size="sm"
                variant="outline"
                className="h-7 border-slate-900"
                disabled={pending}
                onClick={recapitulatif}
                title="Un seul document pour tous les rouleaux cochés partis chez le même destinataire, même s'ils ont déjà chacun leur bon"
              >
                🧾 Bon récapitulatif ({choisis.length})
              </Button>
            )}
            {peutSaisir && (
              <Button size="sm" variant="outline" className="h-7" disabled={pending} onClick={retourFournisseur}>
                ↩ Retour fournisseur
              </Button>
            )}
            <button onClick={() => setCoches(new Set())} className="ml-auto text-muted-foreground hover:underline">
              Tout désélectionner
            </button>
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10px] uppercase text-muted-foreground">
                <th className="w-8 px-3 py-2">
                  <input
                    type="checkbox"
                    checked={affiches.length > 0 && affiches.every((r) => coches.has(r.id))}
                    onChange={(e) => setCoches(e.target.checked ? new Set(affiches.map((r) => r.id)) : new Set())}
                  />
                </th>
                <th className="px-3 py-2 text-left">Rouleau</th>
                <th className="px-3 py-2 text-left">Tissu · couleur</th>
                <th className="px-3 py-2 text-left">Lot · fournisseur</th>
                <th className="px-3 py-2 text-left">Statut</th>
                <th className="px-3 py-2 text-left">Emplacement</th>
                <th className="px-3 py-2 text-right">Initial</th>
                <th className="px-3 py-2 text-right">En coupe</th>
                <th className="px-3 py-2 text-right">Disponible</th>
                <th className="px-3 py-2 text-left">Commande</th>
              </tr>
            </thead>
            <tbody>
              {affiches.length === 0 && (
                <tr>
                  <td colSpan={10} className="py-10 text-center text-muted-foreground">
                    {rouleaux.length === 0
                      ? "Aucun rouleau étiqueté. Saisissez les rouleaux à la réception, ou « Découper en rouleaux » un lot existant."
                      : "Aucun rouleau ne correspond."}
                  </td>
                </tr>
              )}
              {affiches.map((r) => {
                const st = statutLabel(r.statut);
                return (
                  <tr key={r.id} className="border-b hover:bg-accent/30">
                    <td className="px-3 py-1.5">
                      <input
                        type="checkbox"
                        checked={coches.has(r.id)}
                        onChange={(e) =>
                          setCoches((s) => {
                            const x = new Set(s);
                            if (e.target.checked) x.add(r.id);
                            else x.delete(r.id);
                            return x;
                          })
                        }
                      />
                    </td>
                    <td className="px-3 py-1.5">
                      <Link href={`/magtissu/rouleaux/${r.code}`} className="font-mono font-bold text-brand hover:underline">
                        {r.code}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      {[r.lot.reference, r.lot.couleur].filter(Boolean).join(" · ") || "—"}
                      {r.lot.codeCouleur && <span className="text-muted-foreground"> ({r.lot.codeCouleur})</span>}
                    </td>
                    <td className="px-3 py-1.5">
                      <span className="font-mono">{r.lot.identifiant}</span>
                      {r.lot.lotFournisseur && <span className="text-muted-foreground"> · {r.lot.lotFournisseur}</span>}
                      <div className="text-[10px] text-muted-foreground">{r.reception.fournisseur || r.reception.client || "—"}</div>
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                      {r.chez && (
                        <div className="mt-0.5 text-[10px] font-semibold text-warning-foreground">
                          🚚 {r.chez}
                          {r.bonSortie ? (
                            <Link href={`/magtissu/sortie/${encodeURIComponent(r.bonSortie)}`} target="_blank" className="ml-1 font-mono text-brand hover:underline">
                              {r.bonSortie}
                            </Link>
                          ) : (
                            <span className="ml-1 font-normal text-muted-foreground">· sans bon</span>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-1.5 font-mono">{r.emplacement || <span className="text-warning-foreground">—</span>}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{q2.format(r.metrageInitial)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.bilan.enCoupe ? q2.format(r.bilan.enCoupe) : "—"}</td>
                    <td className="px-3 py-1.5 text-right font-bold tabular-nums">{q2.format(r.bilan.disponible)}</td>
                    <td className="px-3 py-1.5 text-[11px]">{r.derniereCommande || r.commandes.map((c) => c.label).join(", ") || "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SectionPanel>

      {recaps.length > 0 && (
        <SectionPanel title={`Bons récapitulatifs (${recaps.length})`} flush>
          <div className="divide-y text-xs">
            {recaps.map((b) => (
              <div key={b.numero} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-mono font-bold">{b.numero}</span>
                <span className="text-muted-foreground">{b.date.slice(0, 10).split("-").reverse().join("/")}</span>
                <span>{b.lieu}</span>
                <span className="text-muted-foreground">
                  {b.rouleaux} rouleau(x) · {q2.format(b.metrage)} m
                </span>
                {b.bons.length > 0 && <span className="text-muted-foreground">regroupe {b.bons.join(", ")}</span>}
                <Link href={`/magtissu/recap/${encodeURIComponent(b.numero)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                  🖨 Récapitulatif
                </Link>
              </div>
            ))}
          </div>
        </SectionPanel>
      )}

      {bons.length > 0 && (
        <SectionPanel title={`Bons de sortie groupée (${bons.length})`} flush>
          <div className="divide-y text-xs">
            {bons.map((b) => (
              <div key={b.numero} className="flex flex-wrap items-center gap-3 px-3 py-2">
                <span className="font-mono font-bold">{b.numero}</span>
                <span className="text-muted-foreground">{b.date.slice(0, 10).split("-").reverse().join("/")}</span>
                <span>{b.lieu}</span>
                <span className="text-muted-foreground">{b.commande}</span>
                <span className="text-muted-foreground">
                  {b.rouleaux} rouleau(x) · {q2.format(b.metrage)} m
                </span>
                <Link href={`/magtissu/sortie/${encodeURIComponent(b.numero)}`} target="_blank" className="ml-auto font-semibold text-brand hover:underline">
                  🖨 Bon
                </Link>
              </div>
            ))}
          </div>
        </SectionPanel>
      )}
    </div>
  );
}

/* ═══════════ rouleaux d'un lot ═══════════ */

/** Dans la fiche d'un lot : ses rouleaux étiquetés, ou — s'il n'en a pas —
 * le découpage du stock existant en rouleaux. */
export function RouleauxDuLot({ lot: l, peutSaisir }: { lot: LotRow; peutSaisir: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (!l.rouleaux.length) return peutSaisir && l.bilan.disponible > 0.001 ? <DecouperEnRouleaux lot={l} /> : null;
  // Créés au bureau, métrage connu : un scan (ou « Tout réceptionner ») les met en stock.
  const attente = l.rouleaux.filter((r) => r.statut === "en_attente").length;
  // Étiquettes posées avant la mesure : leur métrage se tape au scan.
  const aMesurer = l.rouleaux.filter((r) => r.statut === "a_mesurer").length;
  const vivants = l.rouleaux.filter((r) => r.statut !== "annule").length;
  const t = l.rouleaux.reduce((s, r) => ({ dispo: s.dispo + r.bilan.disponible, coupe: s.coupe + r.bilan.enCoupe }), { dispo: 0, coupe: 0 });
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <span className="text-[11px] font-bold uppercase text-muted-foreground">Rouleaux étiquetés ({l.rouleaux.length})</span>
        {attente > 0 && <StatusBadge tone="warning">{attente} à réceptionner au magasin</StatusBadge>}
        {aMesurer > 0 && (
          <StatusBadge tone="warning">
            📏 {vivants - aMesurer}/{vivants} mesurés · {aMesurer} à mesurer au scan
          </StatusBadge>
        )}
        <span className="text-[11px] text-muted-foreground">
          en stock {q2.format(r2(t.dispo))} · en coupe {q2.format(r2(t.coupe))} {l.unite}
        </span>
        <span className="ml-auto flex gap-2 text-[11px]">
          {peutSaisir && attente > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pending}
              onClick={() => {
                if (!confirm(`Valider la réception au magasin des ${attente} rouleau(x) en attente du bon ${l.receptionNumero} ? (Préférez le scan rouleau par rouleau.)`)) return;
                start(async () => {
                  const r = await R.validerReceptionRouleaux({ receptionId: l.receptionId });
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`${r.n} rouleau(x) en stock`);
                  router.refresh();
                });
              }}
            >
              ✔ Tout réceptionner
            </Button>
          )}
          {peutSaisir && (
            <Button
              size="sm"
              variant="outline"
              className="h-7"
              disabled={pending}
              title="Un rouleau arrivé en plus : une étiquette « à mesurer » de plus sur ce lot"
              onClick={() =>
                start(async () => {
                  const r = await R.ajouterEtiquette(l.id);
                  if (!r.ok) return void toast.error(r.error);
                  toast.success(`Étiquette ${r.code} créée : collez-la, le métrage se saisit au scan`);
                  window.open(`/magtissu/etiquettes/rouleaux?ids=${r.id}`, "_blank");
                  router.refresh();
                })
              }
            >
              + Étiquette (rouleau en plus)
            </Button>
          )}
          <Link href={`/magtissu/etiquettes/rouleaux?lot=${l.id}`} target="_blank" className="rounded-md border px-2 py-1 font-semibold hover:bg-muted">
            🏷 Étiquettes du lot
          </Link>
        </span>
      </div>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            <th className="text-left">Rouleau</th>
            <th className="text-left">Statut</th>
            <th className="text-left">Emplacement</th>
            <th className="text-right">Initial</th>
            <th className="text-right">Sorti</th>
            <th className="text-right">Consommé</th>
            <th className="text-right">Chute</th>
            <th className="text-right">En coupe</th>
            <th className="text-right">Disponible</th>
          </tr>
        </thead>
        <tbody>
          {l.rouleaux.map((r) => {
            const st = statutLabel(r.statut);
            return (
              <tr key={r.id} className={`border-t ${r.statut === "annule" ? "text-muted-foreground line-through" : ""}`}>
                <td className="py-1">
                  <Link href={`/magtissu/rouleaux/${r.code}`} className="font-mono font-bold text-brand hover:underline">
                    {r.code}
                  </Link>
                  {r.observations && <span className="ml-1 text-[10px] text-warning-foreground" title={r.observations}>⚠</span>}
                </td>
                <td>
                  <StatusBadge tone={st.tone}>{st.label}</StatusBadge>
                  {peutSaisir && r.statut === "a_mesurer" && (
                    <button
                      disabled={pending}
                      title="Rouleau jamais arrivé : l'étiquette est annulée (elle reste visible, barrée)"
                      onClick={() => {
                        const motif = prompt(`Annuler l'étiquette ${r.code} (rouleau en moins) ?\nMotif :`);
                        if (!motif?.trim()) return;
                        start(async () => {
                          const x = await R.annulerEtiquette(r.code, motif);
                          if (!x.ok) return void toast.error(x.error);
                          toast.success(`Étiquette ${x.code} annulée`);
                          router.refresh();
                        });
                      }}
                      className="ml-1 text-[10px] text-muted-foreground hover:text-[var(--danger-d)] hover:underline"
                    >
                      annuler
                    </button>
                  )}
                </td>
                <td className="font-mono">{r.emplacement || "—"}</td>
                <td className="text-right tabular-nums">{r.aMesurer ? <span className="text-warning-foreground">{r.statut === "annule" ? "—" : "à mesurer"}</span> : q2.format(r.metrageInitial)}</td>
                <td className="text-right tabular-nums">{q2.format(r.bilan.sorti)}</td>
                <td className="text-right tabular-nums">{q2.format(r.bilan.consomme)}</td>
                <td className="text-right tabular-nums">{q2.format(r.bilan.chute)}</td>
                <td className="text-right tabular-nums">{q2.format(r.bilan.enCoupe)}</td>
                <td className="text-right font-bold tabular-nums">{q2.format(r.bilan.disponible)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="mt-2 text-[10.5px] text-muted-foreground">
        Lot suivi par rouleau : sorties, retours, consommations et corrections se font sur chaque rouleau (scan du QR ou fiche rouleau).
      </p>
    </div>
  );
}

/** Stock existant sans étiquettes : on saisit les rouleaux physiques du lot.
 * Pré-rempli depuis l'ancienne fiche de contrôle rouleau si elle existe. */
function DecouperEnRouleaux({ lot: l }: { lot: LotRow }) {
  const router = useRouter();
  const [ouvert, setOuvert] = useState(false);
  const [pending, start] = useTransition();
  const depart = () =>
    l.ficheRouleaux.length
      ? l.ficheRouleaux.map((f) => ({ metrage: String(f.mesure ?? f.annonce ?? ""), laize: f.laize != null ? String(f.laize) : l.laize != null ? String(l.laize) : "", observations: f.defauts }))
      : [{ metrage: String(l.bilan.disponible), laize: l.laize != null ? String(l.laize) : "", observations: "" }];
  const [lignes, setLignes] = useState(depart);
  const [motif, setMotif] = useState("");
  const somme = r2(lignes.reduce((s, x) => s + lire(x.metrage), 0));
  const ecart = r2(somme - l.bilan.disponible);
  if (!ouvert) {
    return (
      <button onClick={() => setOuvert(true)} className="text-[11px] font-semibold text-brand hover:underline">
        ✂ Découper en rouleaux étiquetés (QR par rouleau)
      </button>
    );
  }
  const set = (i: number, k: "metrage" | "laize" | "observations", v: string) => setLignes((s) => s.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  return (
    <div className="rounded-lg border border-brand/40 bg-card p-3">
      <div className="mb-1 text-[11px] font-bold uppercase text-muted-foreground">Découper le stock du lot en rouleaux</div>
      <p className="mb-2 text-[11px] text-muted-foreground">
        Un rouleau = une étiquette QR à vie. Les rouleaux sont réputés au magasin (pas de nouvelle entrée de stock).
        {l.ficheRouleaux.length > 0 && " Pré-rempli depuis la fiche de contrôle rouleau."}
      </p>
      <table className="w-full text-xs">
        <thead>
          <tr className="text-[10px] uppercase text-muted-foreground">
            <th className="w-10 text-left">#</th>
            <th className="text-left">Métrage ({l.unite})</th>
            <th className="text-left">Laize (cm)</th>
            <th className="text-left">Observations</th>
            <th className="w-6" />
          </tr>
        </thead>
        <tbody>
          {lignes.map((x, i) => (
            <tr key={i}>
              <td className="text-muted-foreground">{i + 1}</td>
              {(["metrage", "laize", "observations"] as const).map((k) => (
                <td key={k} className="py-0.5 pr-1">
                  <Input value={x[k]} onChange={(e) => set(i, k, e.target.value)} inputMode={k === "observations" ? "text" : "decimal"} className="h-7 bg-card" />
                </td>
              ))}
              <td>
                <button onClick={() => setLignes((s) => s.filter((_, j) => j !== i))} className="rounded p-0.5 text-muted-foreground hover:bg-muted">
                  <Trash2 className="size-3" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px]">
        <Button size="sm" variant="outline" className="h-7" onClick={() => setLignes((s) => [...s, { metrage: "", laize: l.laize != null ? String(l.laize) : "", observations: "" }])}>
          + Rouleau
        </Button>
        <span>
          Total <b>{q2.format(somme)}</b> / disponible du lot <b>{q2.format(l.bilan.disponible)}</b> {l.unite}
        </span>
        {Math.abs(ecart) > 0.001 && (
          <>
            <span className="font-semibold text-warning-foreground">
              écart {ecart > 0 ? "+" : ""}
              {q2.format(ecart)} {l.unite} → correction du lot
            </span>
            <Input value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Motif de l'écart (obligatoire)" className="h-7 w-64 bg-card" />
          </>
        )}
      </div>
      <div className="mt-2 flex gap-2">
        <Button
          size="sm"
          disabled={pending || somme <= 0 || (Math.abs(ecart) > 0.001 && !motif.trim())}
          onClick={() =>
            start(async () => {
              const r = await R.decouperEnRouleaux({ lotId: l.id, rouleaux: lignes, motif });
              if (!r.ok) return void toast.error(r.error);
              toast.success(`${r.rouleauIds.length} rouleau(x) créés`);
              window.open(`/magtissu/etiquettes/rouleaux?ids=${r.rouleauIds.join(",")}`, "_blank");
              setOuvert(false);
              router.refresh();
            })
          }
        >
          Créer {lignes.filter((x) => lire(x.metrage) > 0).length} rouleau(x) et imprimer les étiquettes
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setOuvert(false)}>
          Annuler
        </Button>
      </div>
    </div>
  );
}
