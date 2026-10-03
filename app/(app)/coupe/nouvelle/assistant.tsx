"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { SectionPanel } from "@/components/shared/section-panel";
import { StatusBadge } from "@/components/shared/status-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import * as cp from "@/lib/domain/coupe";
import { validerFicheCoupe } from "@/lib/actions/coupe";
import type { ContexteCoupe } from "@/lib/services/coupe";

const nb = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 });
const auj = () => new Date().toISOString().slice(0, 10);
const entier = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
};
const metre = (s: string) => {
  const n = Number(String(s).replace(",", "."));
  return Number.isFinite(n) && n > 0 ? Math.round(n * 100) / 100 : 0;
};
const signe = (n: number) => (n > 0 ? `+${nb.format(n)}` : nb.format(n));

/* Assistant de coupe, en six étapes sur une page :
 *   1 plan → identité de la commande (rien à saisir)
 *   2 tailles importées du plan
 *   3 coupé par OF (pré-rempli avec le prévu) → prévu / coupé / écart
 *   4 rouleaux et consommation
 *   5 validation
 *   6 PV (sur la fiche, une fois validée) */
export function AssistantCoupe({ ctx }: { ctx: ContexteCoupe }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const plan = ctx.plan!;
  const sizes = plan.sizes;
  const proposition = useMemo(() => cp.repartitionParDefaut(sizes, plan.prevu, ctx.membres), [sizes, plan.prevu, ctx.membres]);
  const commande = useMemo(() => cp.commandeParMembre(sizes, plan.prevu, ctx.membres), [sizes, plan.prevu, ctx.membres]);
  const [saisie, setSaisie] = useState<Record<number, Record<string, string>>>(() =>
    Object.fromEntries(ctx.membres.map((m) => [m.id, Object.fromEntries(sizes.map((s) => [s, String(proposition[m.id][s])]))])),
  );
  const [motif, setMotif] = useState("");
  const [precision, setPrecision] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(auj());
  const [type, setType] = useState(ctx.porteur.sousTraitee ? "soustraite" : "interne");
  const [matiereRang, setMatiereRang] = useState(plan.matieres[0]?.rang ?? 0);
  const [conso, setConso] = useState<Record<string, { consomme: string; chute: string }>>({});

  const coupeTotal = Object.fromEntries(sizes.map((s) => [s, ctx.membres.reduce((a, m) => a + entier(saisie[m.id]?.[s] ?? ""), 0)]));
  const cmdTotal = Object.fromEntries(sizes.map((s) => [s, ctx.membres.reduce((a, m) => a + commande[m.id][s], 0)]));
  const lignes = cp.ecartsCoupe(sizes, cmdTotal, plan.prevu, coupeTotal, ctx.seuil);
  const tot = cp.totalLignes(lignes);
  const aExpliquer = lignes.filter((l) => l.motifRequis);
  const refus = cp.refusValidation(lignes, motif, precision);

  const matiere = plan.matieres.find((m) => m.rang === matiereRang) ?? plan.matieres[0];
  const consoPiece = matiere?.consoPrevue ?? ctx.porteur.consoTheo;
  const saisieConso = ctx.rouleaux.reduce((s, r) => s + metre(conso[r.code]?.consomme ?? "") + metre(conso[r.code]?.chute ?? ""), 0);
  const reel = ctx.rouleaux.reduce((s, r) => s + r.dejaDeclare, 0) + ctx.lotsBloc.reduce((s, l) => s + l.net, 0) + saisieConso;
  const bilan = cp.bilanConsommation(consoPiece, tot.coupe, reel);
  const tropConso = ctx.rouleaux.find((r) => metre(conso[r.code]?.consomme ?? "") + metre(conso[r.code]?.chute ?? "") > r.enCoupe + 0.001);

  const valider = () =>
    start(async () => {
      const r = await validerFicheCoupe({
        commandeId: ctx.porteur.id,
        date,
        type,
        coupe: Object.fromEntries(ctx.membres.map((m) => [m.id, Object.fromEntries(sizes.map((s) => [s, entier(saisie[m.id]?.[s] ?? "")]))])),
        motif: aExpliquer.length || tot.ecart !== 0 ? motif : "",
        precision,
        note,
        matiereRang,
        consommations: ctx.rouleaux.map((x) => ({ code: x.code, consomme: metre(conso[x.code]?.consomme ?? ""), chute: metre(conso[x.code]?.chute ?? "") })),
      });
      if (!r.ok) return void toast.error(r.error);
      toast.success(`Fiche de coupe ${r.numero} validée`);
      router.push(`/coupe/fiche/${encodeURIComponent(r.numero)}`);
    });

  return (
    <div className="space-y-4">
      {/* 1 — plan et commande */}
      <SectionPanel title="1 · Plan de coupe et commande">
        <div className="grid gap-3 text-xs sm:grid-cols-3 lg:grid-cols-6">
          <Info l="Client" v={ctx.porteur.client || "—"} />
          <Info l="OF" v={ctx.membres.map((m) => m.of).join(" + ")} />
          <Info l="Modèle" v={ctx.porteur.modele} />
          <Info l="Référence" v={ctx.porteur.refArticle || "—"} />
          <Info l="Couleur" v={ctx.porteur.couleur || "—"} />
          <Info l="Tissu (plan)" v={plan.matieres.map((m) => m.nom).join(", ") || "—"} />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
          <StatusBadge tone={plan.etat.tone}>{plan.etat.label}</StatusBadge>
          Prévu lu dans {plan.source === "traces" ? "les matelas du plan (plis × tracés)" : "les quantités à couper du plan"}.
          {ctx.membres.length > 1 && " OF réunis : un seul plan (porteur), le coupé est réparti par OF."}
          {ctx.fiches.filter((f) => f.statut === "validee").length > 0 && (
            <b className="text-warning-foreground"> Déjà {ctx.fiches.filter((f) => f.statut === "validee").length} fiche(s) validée(s) pour cette commande : celle-ci s&apos;ajoute (complément).</b>
          )}
        </div>
      </SectionPanel>

      {/* 2 + 3 — tailles importées, coupé par OF, écarts */}
      <SectionPanel title="2 · 3 · Tailles importées du plan — prévu / coupé / écart" flush>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-3 py-2 text-left">Taille</th>
                {sizes.map((s) => (
                  <th key={s} className="px-2 py-2 text-center">
                    {s}
                  </th>
                ))}
                <th className="px-3 py-2 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              <LigneLecture label="Commandé" valeurs={lignes.map((l) => l.commande)} total={tot.commande} />
              <LigneLecture label="Prévu (plan de coupe)" valeurs={lignes.map((l) => l.prevu)} total={tot.prevu} fort />
              {ctx.membres.map((m) => (
                <tr key={m.id} className="border-b bg-amber-50/40">
                  <td className="px-3 py-1.5">
                    <b>Coupé {ctx.membres.length > 1 ? m.of : ""}</b>
                    {ctx.membres.length > 1 && <div className="text-[10px] text-muted-foreground">{m.porteur ? "porteur" : "OF réuni"}</div>}
                  </td>
                  {sizes.map((s) => (
                    <td key={s} className="px-1 py-1">
                      <Input
                        value={saisie[m.id]?.[s] ?? ""}
                        onChange={(e) => setSaisie((x) => ({ ...x, [m.id]: { ...x[m.id], [s]: e.target.value.replace(/\D/g, "") } }))}
                        inputMode="numeric"
                        aria-label={`Coupé ${m.of} taille ${s}`}
                        className="h-8 min-w-14 bg-card text-center font-bold tabular-nums"
                      />
                    </td>
                  ))}
                  <td className="px-3 text-right font-bold tabular-nums">{nb.format(sizes.reduce((a, s) => a + entier(saisie[m.id]?.[s] ?? ""), 0))}</td>
                </tr>
              ))}
              {ctx.membres.length > 1 && <LigneLecture label="Coupé total" valeurs={lignes.map((l) => l.coupe)} total={tot.coupe} fort />}
              <tr className="border-b">
                <td className="px-3 py-1.5 font-bold">Écart</td>
                {lignes.map((l) => (
                  <td
                    key={l.taille}
                    className={`px-2 py-1.5 text-center font-bold tabular-nums ${l.motifRequis ? "bg-[var(--danger-l)] text-[var(--danger-d)]" : l.ecart !== 0 ? "text-warning-foreground" : "text-success-foreground"}`}
                    title={l.pct != null ? `${signe(l.pct)} %` : undefined}
                  >
                    {l.ecart === 0 ? "0" : signe(l.ecart)}
                    {l.pct != null && l.ecart !== 0 && <div className="text-[9.5px] font-normal">{signe(l.pct)} %</div>}
                  </td>
                ))}
                <td className={`px-3 text-right font-bold tabular-nums ${tot.ecart ? "text-warning-foreground" : "text-success-foreground"}`}>{signe(tot.ecart)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t px-3 py-2 text-[11px]">
          {tot.ecart === 0 && !lignes.some((l) => l.ecart !== 0) ? (
            <span className="font-semibold text-success-foreground">✓ Coupé conforme au plan.</span>
          ) : (
            <>
              <span className={aExpliquer.length ? "font-bold text-[var(--danger-d)]" : "text-muted-foreground"}>
                {aExpliquer.length ? `Écart au-delà de ${nb.format(ctx.seuil)} % : motif obligatoire →` : `Écart dans la tolérance (${nb.format(ctx.seuil)} %) — motif facultatif :`}
              </span>
              <select value={motif} onChange={(e) => setMotif(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs" aria-label="Motif de l'écart">
                <option value="">— motif de l&apos;écart —</option>
                {cp.MOTIFS_ECART.map((m) => (
                  <option key={m.value} value={m.value}>
                    {m.label}
                  </option>
                ))}
              </select>
              <Input value={precision} onChange={(e) => setPrecision(e.target.value)} placeholder="Précision (obligatoire pour « Autre »)" className="h-8 w-72 bg-card" />
            </>
          )}
        </div>
      </SectionPanel>

      {/* 4 — tissu */}
      <SectionPanel
        title="4 · Rouleaux et consommation"
        flush
        actions={
          plan.matieres.length > 1 ? (
            <select value={matiereRang} onChange={(e) => setMatiereRang(Number(e.target.value))} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
              {plan.matieres.map((m) => (
                <option key={m.rang} value={m.rang}>
                  {m.nom}
                </option>
              ))}
            </select>
          ) : undefined
        }
      >
        {ctx.rouleaux.length === 0 && ctx.lotsBloc.length === 0 ? (
          <p className="px-3 py-4 text-xs text-muted-foreground">
            Aucun rouleau sorti pour {ctx.membres.length > 1 ? "ces OF" : "cet OF"}. Sortez le tissu au magasin (scan → Sortie, ou Sortie groupée) : il apparaîtra ici.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                  <th className="px-3 py-2 text-left">Rouleau</th>
                  <th className="px-3 py-2 text-left">Lot · tissu · couleur</th>
                  <th className="px-3 py-2 text-right">Sorti pour l&apos;OF</th>
                  <th className="px-3 py-2 text-right">Déjà déclaré</th>
                  <th className="px-3 py-2 text-right">Encore en coupe</th>
                  <th className="px-3 py-2 text-center">Consommé</th>
                  <th className="px-3 py-2 text-center">Chute</th>
                </tr>
              </thead>
              <tbody>
                {ctx.rouleaux.map((r) => (
                  <tr key={r.code} className="border-b">
                    <td className="px-3 py-1.5 font-mono font-bold">{r.code}</td>
                    <td className="px-3 py-1.5">
                      {r.lot} · {r.tissu || "—"} · {r.couleur || "—"}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {nb.format(r.sorti)} {r.unite}
                    </td>
                    <td className="px-3 text-right tabular-nums">{r.dejaDeclare ? `${nb.format(r.dejaDeclare)} ${r.unite}` : "—"}</td>
                    <td className="px-3 text-right font-semibold tabular-nums">{nb.format(r.enCoupe)}</td>
                    {(["consomme", "chute"] as const).map((k) => (
                      <td key={k} className="px-1 py-1">
                        <Input
                          value={conso[r.code]?.[k] ?? ""}
                          disabled={r.enCoupe <= 0.001}
                          onChange={(e) => setConso((x) => ({ ...x, [r.code]: { ...(x[r.code] ?? { consomme: "", chute: "" }), [k]: e.target.value.replace(/[^\d.,]/g, "") } }))}
                          inputMode="decimal"
                          aria-label={`${k === "consomme" ? "Consommé" : "Chute"} ${r.code}`}
                          className="h-8 w-24 bg-card text-center tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
                {ctx.lotsBloc.map((l) => (
                  <tr key={l.lot} className="border-b text-muted-foreground">
                    <td className="px-3 py-1.5">(lot en bloc)</td>
                    <td className="px-3 py-1.5">
                      {l.lot} · {l.tissu || "—"} · {l.couleur || "—"}
                    </td>
                    <td className="px-3 text-right tabular-nums">
                      {nb.format(l.net)} {l.unite}
                    </td>
                    <td className="px-3 text-right tabular-nums" colSpan={4}>
                      sortie du magasin, rattachée à la fiche
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {ctx.rouleaux.some((r) => r.enCoupe > 0.001) && (
              <div className="border-t px-3 py-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7"
                  onClick={() => setConso(Object.fromEntries(ctx.rouleaux.filter((r) => r.enCoupe > 0.001).map((r) => [r.code, { consomme: String(r.enCoupe), chute: "" }])))}
                >
                  Tout le tissu encore en coupe a été consommé
                </Button>
                {tropConso && <span className="ml-2 text-[11px] font-semibold text-[var(--danger-d)]">{tropConso.code} : plus que le tissu encore en coupe ({nb.format(tropConso.enCoupe)}).</span>}
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2 border-t px-3 py-3 text-center text-xs sm:grid-cols-4">
          <Info l={`Théorique${consoPiece ? ` (${nb.format(consoPiece)} m/pc × ${nb.format(tot.coupe)})` : ""}`} v={bilan.theorique != null ? `${nb.format(bilan.theorique)} m` : "conso prévue absente"} />
          <Info l="Réel (rouleaux)" v={`${nb.format(bilan.reel)} m`} />
          <Info l="Écart" v={bilan.ecart != null ? `${signe(bilan.ecart)} m` : "—"} />
          <Info l="Écart %" v={bilan.pct != null ? `${signe(bilan.pct)} %` : "—"} />
        </div>
      </SectionPanel>

      {/* 5 — validation */}
      <SectionPanel title="5 · Valider la coupe">
        <div className="flex flex-wrap items-end gap-3 text-xs">
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">
            Date de coupe
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
          </label>
          <label className="flex flex-col gap-1 font-semibold text-muted-foreground">
            Coupe
            <select value={type} onChange={(e) => setType(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs">
              <option value="interne">Interne</option>
              <option value="soustraite">Sous-traitée</option>
            </select>
          </label>
          <label className="flex min-w-64 flex-1 flex-col gap-1 font-semibold text-muted-foreground">
            Note
            <Input value={note} onChange={(e) => setNote(e.target.value)} className="h-8 bg-card" />
          </label>
          <Button disabled={pending || !!refus || !!tropConso} onClick={valider} className="h-9">
            {pending ? "Validation…" : `✔ Valider la coupe · ${nb.format(tot.coupe)} pcs`}
          </Button>
        </div>
        {refus && <p className="mt-2 text-[11px] font-semibold text-[var(--danger-d)]">{refus}</p>}
        <p className="mt-2 text-[11px] text-muted-foreground">
          Une fois validée, la fiche est figée (prévu et coupé conservés). Une erreur se corrige en l&apos;annulant (motif) et en la refaisant. Étape 6 :
          « Générer le PV de coupe » sur la fiche.
        </p>
      </SectionPanel>
    </div>
  );
}

function Info({ l, v }: { l: string; v: string }) {
  return (
    <div className="rounded-lg border bg-card px-3 py-2">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{l}</div>
      <div className="font-semibold">{v}</div>
    </div>
  );
}

function LigneLecture({ label, valeurs, total, fort }: { label: string; valeurs: number[]; total: number; fort?: boolean }) {
  return (
    <tr className="border-b">
      <td className={`px-3 py-1.5 ${fort ? "font-bold" : "text-muted-foreground"}`}>{label}</td>
      {valeurs.map((v, i) => (
        <td key={i} className={`px-2 py-1.5 text-center tabular-nums ${fort ? "font-bold" : ""}`}>
          {nb.format(v)}
        </td>
      ))}
      <td className={`px-3 text-right tabular-nums ${fort ? "font-bold" : ""}`}>{nb.format(total)}</td>
    </tr>
  );
}
