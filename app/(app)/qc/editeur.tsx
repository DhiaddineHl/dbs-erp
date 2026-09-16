"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Camera, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import { SectionPanel } from "@/components/shared/section-panel";
import {
  FAMILLES_DEFAUT,
  GRAVITES,
  POINTS_MESURE,
  STATUTS_ACTION,
  STATUTS_POINT,
  TYPES_CONTROLE,
  VERDICTS,
  historiqueReference,
  type InspectionBilan,
} from "@/lib/domain/qc";
import type { BaremeRow, ChecklistRow, InspectionRow } from "@/lib/services/qc";
import * as A from "@/lib/actions/qc";
import { ChampAction, BoutonAction, SelectAction, useAction } from "./primitives";

const nb = new Intl.NumberFormat("fr-FR");

export type CommandeChoix = {
  id: number;
  of: string;
  modele: string;
  ref: string;
  couleur: string;
  qte: number;
  client: string;
  faconnier: string;
};

export function Editeur({
  insp,
  baremes,
  checklists,
  commandes,
  toutes,
  onRetour,
  onOuvrir,
}: {
  insp: InspectionRow;
  baremes: BaremeRow[];
  checklists: ChecklistRow[];
  commandes: CommandeChoix[];
  /** Toutes les inspections, pour l'historique qualité de la référence. */
  toutes: InspectionRow[];
  onRetour: () => void;
  onOuvrir: (id: number) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const fige = insp.statut === "cloture";
  const v = VERDICTS[insp.verdict];
  const p = insp.proposition;

  /* Historique de la référence : les contrôles passés du même modèle, hors
   * l'inspection courante. Le contrôleur voit les défauts récurrents avant de
   * commencer. */
  const histo = useMemo(
    () =>
      insp.modele
        ? historiqueReference(
            toutes.filter((i) => i.id !== insp.id) as unknown as (InspectionBilan & { numero?: number })[],
            insp.modele,
          )
        : null,
    [toutes, insp.modele, insp.id],
  );

  const baremeChoisi = insp.baremeApparieId ?? baremes[0]?.id ?? 0;
  const [barId, setBarId] = useState(baremeChoisi);
  const [taille, setTaille] = useState("");
  const bareme = baremes.find((b) => b.id === barId);
  const taillesDispo = bareme?.tailles ?? [];
  const tailleEffective = taille || taillesDispo[0] || "";

  return (
    <>
      {/* ─── barre d'actions ─── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" onClick={onRetour}>
          ← Liste
        </Button>
        <span className="text-lg font-extrabold">{insp.ref_affichee}</span>
        <StatusBadge tone={fige ? v.tone : "brand"}>{fige ? v.label : "✏️ BROUILLON"}</StatusBadge>
        {insp.recontroleDeId && <StatusBadge tone="purple">re-contrôle</StatusBadge>}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => window.open(`/qc/${insp.id}/rapport?type=client`, "_blank")}>
            🖨 Client
          </Button>
          <Button variant="outline" size="sm" onClick={() => window.open(`/qc/${insp.id}/rapport?type=faconnier`, "_blank")}>
            🖨 Façonnier
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              const sujet = `Rapport de contrôle ${insp.ref_affichee} — ${insp.of} ${insp.modele}`;
              const corps = [
                `Bonjour,`, ``,
                `Veuillez trouver le résultat du contrôle qualité ${insp.ref_affichee}.`,
                ``,
                `OF : ${insp.of}`, `Modèle : ${insp.modele} ${insp.couleur}`.trim(),
                `Lot présenté : ${nb.format(insp.lot)} pièces — échantillon contrôlé : ${p.plan.n}`,
                `Verdict : ${v.label}`,
                insp.note ? `` : null, insp.note ? `Observations : ${insp.note}` : null,
                ``, `Cordialement,`, insp.controleur,
              ].filter((l) => l !== null).join("\n");
              window.location.href = `mailto:?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
            }}
          >
            📧
          </Button>
          <BoutonAction
            onRun={async () => {
              const r = await A.dupliquer(insp.id);
              if (r.ok && r.data) onOuvrir(r.data);
              return r;
            }}
            succes="Inspection dupliquée — ajustez la copie"
          >
            📋 Dupliquer
          </BoutonAction>

          {fige && (insp.verdict === "refuse" || insp.verdict === "reserve") && !insp.recontroleId && (
            <BoutonAction
              onRun={async () => {
                const r = await A.creerRecontrole(insp.id);
                if (r.ok && r.data) onOuvrir(r.data);
                return r;
              }}
              succes="Re-contrôle créé"
            >
              🔁 Re-contrôle
            </BoutonAction>
          )}

          {fige ? (
            <BoutonAction onRun={() => A.rouvrir(insp.id)} succes="Inspection rouverte">
              🔓 Rouvrir
            </BoutonAction>
          ) : (
            <Button
              size="sm"
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const r = await A.cloturer(insp.id);
                  if (!r.ok) {
                    toast.error(r.error);
                    return;
                  }
                  if (r.data?.qrqcCree) toast.error("⛔ Lot refusé → un problème QRQC a été ouvert automatiquement");
                  else toast.success(`Inspection clôturée — ${VERDICTS[r.data!.verdict as keyof typeof VERDICTS].label}`);
                  router.refresh();
                })
              }
            >
              ✔ Clôturer l&apos;inspection
            </Button>
          )}
        </div>
      </div>

      {insp.recontroleId && (
        <div className="mb-4 rounded-lg border border-purple bg-purple-muted px-3 py-2 text-xs">
          🔁 Un re-contrôle a été ouvert à la suite de cette inspection.{" "}
          <button className="font-semibold underline" onClick={() => onOuvrir(insp.recontroleId!)}>
            L&apos;ouvrir
          </button>
        </div>
      )}
      {insp.qrqcId && (
        <div className="mb-4 rounded-lg border border-[var(--danger)] bg-[var(--danger-l)] px-3 py-2 text-xs">
          ⛔ Lot refusé — problème qualité ouvert.{" "}
          <Link href="/qrqc" className="font-semibold underline">
            Voir le QRQC
          </Link>
        </div>
      )}

      {/* ─── 1 · OF & échantillonnage ─── */}
      <SectionPanel title="1 · Ordre de fabrication & échantillonnage AQL">
        <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr_1fr]">
          <Bloc label="Ordre de fabrication">
            <select
              value={insp.commandeId ?? ""}
              disabled={fige}
              onChange={(e) =>
                start(async () => {
                  const r = await A.lierCommande(insp.id, e.target.value ? Number(e.target.value) : null);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-xs disabled:opacity-60"
            >
              <option value="">— Choisir un OF —</option>
              {commandes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.of} · {c.modele} {c.couleur ? `· ${c.couleur}` : ""} ({nb.format(c.qte)} pcs)
                </option>
              ))}
            </select>
          </Bloc>
          <Bloc label="Type de contrôle">
            <SelectAction
              valeur={insp.typeControle || "final"}
              options={TYPES_CONTROLE.map((t) => ({ value: t.value, label: t.court }))}
              fige={fige}
              onSave={(x) => A.majInspection(insp.id, "typeControle", x)}
            />
          </Bloc>
          <Bloc label="Date contrôle">
            <ChampAction valeur={insp.date} type="date" fige={fige} onSave={(x) => A.majInspection(insp.id, "date", x)} />
          </Bloc>
          <Bloc label="Contrôleur">
            <ChampAction valeur={insp.controleur} fige={fige} onSave={(x) => A.majInspection(insp.id, "controleur", x)} />
          </Bloc>
          <Bloc label="Taille du lot (pcs)">
            <ChampAction
              valeur={insp.lot ? String(insp.lot) : ""}
              type="number"
              fige={fige}
              className="text-base font-bold"
              onSave={(x) => A.majInspection(insp.id, "lot", x)}
            />
          </Bloc>
        </div>

        {/* Quantités reportées sur le rapport client. */}
        <div className="mt-2.5 grid gap-2.5 sm:grid-cols-3">
          <Bloc label="Qté commandée">
            <ChampAction
              valeur={insp.qteCommande ? String(insp.qteCommande) : ""}
              type="number"
              fige={fige}
              onSave={(x) => A.majInspection(insp.id, "qteCommande", x)}
            />
          </Bloc>
          <Bloc label="Qté produite">
            <ChampAction
              valeur={insp.qteProduite ? String(insp.qteProduite) : ""}
              type="number"
              fige={fige}
              onSave={(x) => A.majInspection(insp.id, "qteProduite", x)}
            />
          </Bloc>
          <Bloc label="Qté contrôlée">
            <ChampAction
              valeur={insp.qteControlee ? String(insp.qteControlee) : ""}
              type="number"
              placeholder={`échantillon ${p.plan.n}`}
              fige={fige}
              onSave={(x) => A.majInspection(insp.id, "qteControlee", x)}
            />
          </Bloc>
        </div>

        <div className="mt-4 grid gap-2.5 sm:grid-cols-4">
          <Tuile titre="Échantillon à contrôler" valeur={String(p.plan.n)} accent />
          <Tuile titre="Majeurs (AQL 2,5)" valeur={`Ac ${p.plan.ac25} · Re ${p.plan.re25}`} />
          <Tuile titre="Mineurs (AQL 4,0)" valeur={`Ac ${p.plan.ac40} · Re ${p.plan.re40}`} />
          <Tuile titre="Critiques" valeur="0 toléré" danger />
        </div>
      </SectionPanel>

      {/* ─── Historique qualité de la référence ─── */}
      {histo && histo.controles > 0 && (
        <SectionPanel title={`Historique qualité — ${insp.modele} (${histo.controles} contrôle(s) passé(s))`}>
          <div className="grid gap-3 lg:grid-cols-[repeat(3,minmax(0,1fr))_2fr]">
            <Tuile
              titre="Taux de conformité"
              valeur={histo.tauxConformite === null ? "—" : `${histo.tauxConformite} %`}
              accent={histo.tauxConformite !== null && histo.tauxConformite >= 90}
              danger={histo.tauxConformite !== null && histo.tauxConformite < 75}
            />
            <Tuile titre="Contrôles" valeur={String(histo.controles)} />
            <Tuile titre="Lots refusés" valeur={String(histo.refuses)} danger={histo.refuses > 0} />
            <div className="rounded-xl border bg-card p-3">
              <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">Défauts récurrents</div>
              {histo.defautsRecurrents.length === 0 ? (
                <div className="text-xs text-muted-foreground">Aucun défaut relevé sur les contrôles passés.</div>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {histo.defautsRecurrents.map((r) => (
                    <span key={r.famille} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                      {r.famille} <b>{r.nombre}</b>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
          {histo.derniers.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {histo.derniers.map((h, i) => {
                const vv = VERDICTS[h.verdict];
                return (
                  <div key={i} className="rounded-lg border bg-muted/30 px-2.5 py-1.5 text-[11px]">
                    <span className="text-muted-foreground">{h.date}</span> ·{" "}
                    <StatusBadge tone={vv.tone}>{vv.label}</StatusBadge>{" "}
                    {h.totalDefauts > 0 && <span className="text-muted-foreground">{h.totalDefauts} déf.</span>}
                  </div>
                );
              })}
            </div>
          )}
          <p className="mt-2 text-[11px] text-muted-foreground">
            💡 Vérifiez les défauts récurrents ci-dessus avant de commencer : ce sont les points à contrôler en priorité
            sur cette référence.
          </p>
        </SectionPanel>
      )}

      {/* ─── Checklist de contrôle ─── */}
      <SectionPanel
        title={`Checklist de contrôle (${insp.checklist.filter((c) => c.statut === "ok").length}/${insp.checklist.length} OK)`}
        actions={
          !fige && (
            <div className="flex items-center gap-2">
              {checklists.length > 0 && (
                <ChargeurChecklist inspId={insp.id} checklists={checklists} />
              )}
              <BoutonAction onRun={() => A.ajouterPointReponse(insp.id, "Nouveau point")} succes="Point ajouté">
                + Point libre
              </BoutonAction>
            </div>
          )
        }
      >
        {insp.checklist.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            {checklists.length === 0
              ? "Aucune checklist configurée. Créez des modèles dans l'onglet « Checklists » (Chemise, Pantalon…)."
              : "Appliquez une checklist (bouton ci-dessus) pour dérouler les points à contrôler, ou ajoutez des points libres."}
          </div>
        ) : (
          <div className="space-y-1.5">
            {insp.checklist.map((pt, i) => (
              <div key={pt.id} className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/20 p-2">
                <span className="w-6 shrink-0 text-right text-[11px] tabular-nums text-muted-foreground">{i + 1}.</span>
                <div className="min-w-[160px] flex-1">
                  <ChampAction
                    valeur={pt.label}
                    fige={fige}
                    onSave={(x) => A.majReponseChecklist(insp.id, pt.id, "label", x)}
                  />
                </div>
                <div className="flex shrink-0 gap-1">
                  {STATUTS_POINT.filter((s) => s.value !== "").map((s) => {
                    const actif = pt.statut === s.value;
                    const couleur =
                      s.value === "ok"
                        ? actif
                          ? "bg-green-600 text-white"
                          : "text-green-700 hover:bg-green-50"
                        : s.value === "ko"
                          ? actif
                            ? "bg-red-600 text-white"
                            : "text-red-700 hover:bg-red-50"
                          : actif
                            ? "bg-neutral-600 text-white"
                            : "text-neutral-600 hover:bg-neutral-100";
                    return (
                      <button
                        key={s.value}
                        type="button"
                        disabled={fige}
                        title={s.label}
                        className={`rounded border px-2 py-1 text-[11px] font-bold ${couleur} disabled:opacity-50`}
                        onClick={async () => {
                          const r = await A.majReponseChecklist(insp.id, pt.id, "statut", actif ? "" : s.value);
                          if (!r.ok) toast.error(r.error);
                          else router.refresh();
                        }}
                      >
                        {s.court}
                      </button>
                    );
                  })}
                </div>
                <div className="min-w-[120px] flex-1">
                  <ChampAction
                    valeur={pt.note}
                    placeholder="Note…"
                    fige={fige}
                    onSave={(x) => A.majReponseChecklist(insp.id, pt.id, "note", x)}
                  />
                </div>
                {!fige && (
                  <BoutonAction variant="ghost" onRun={() => A.supprimerReponseChecklist(insp.id, pt.id)}>
                    <Trash2 className="size-3.5" />
                  </BoutonAction>
                )}
              </div>
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ─── 2 · défauts ─── */}
      <SectionPanel title={`2 · Relevé des défauts (${insp.totalDefauts} au total)`}>
        <div className="grid gap-3 lg:grid-cols-2">
          {FAMILLES_DEFAUT.map((fam) => {
            const liste = insp.defauts.filter((d) => d.famille === fam);
            return (
              <div key={fam} className="rounded-xl border bg-card p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <b className="text-xs">{fam}</b>
                  {!fige && (
                    <BoutonAction variant="ghost" onRun={() => A.ajouterDefaut(insp.id, fam)}>
                      + défaut
                    </BoutonAction>
                  )}
                </div>
                {liste.length === 0 ? (
                  <div className="text-[11px] text-muted-foreground">Aucun défaut relevé.</div>
                ) : (
                  <div className="flex flex-col gap-2">
                    {liste.map((d) => (
                      <LigneDefaut key={d.id} insp={insp} defaut={d} fige={fige} />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </SectionPanel>

      {/* ─── 3 · mesures ─── */}
      <SectionPanel
        title="3 · Prises de mesures"
        actions={
          !fige && (
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={barId}
                onChange={(e) => {
                  setBarId(Number(e.target.value));
                  setTaille("");
                }}
                className="max-w-[280px] rounded-md border border-input bg-card px-2 py-1 text-xs"
              >
                {baremes.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.nom}
                  </option>
                ))}
              </select>
              <select
                value={tailleEffective}
                onChange={(e) => setTaille(e.target.value)}
                className="rounded-md border border-input bg-card px-2 py-1 text-xs"
              >
                {taillesDispo.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <BoutonAction
                variant="default"
                onRun={async () => {
                  const r = await A.chargerBareme(insp.id, barId, tailleEffective);
                  if (r.ok) {
                    toast.success(
                      r.data ? `${r.data} point(s) chargés — taille ${tailleEffective}` : "Points déjà chargés pour cette taille",
                    );
                  }
                  return r;
                }}
              >
                ⤵ Charger le barème
              </BoutonAction>
              <BoutonAction onRun={() => A.ajouterMesure(insp.id)}>＋ Ligne</BoutonAction>
            </div>
          )
        }
        flush
      >
        {insp.baremeApparieId && (
          <div className="bg-success-muted px-3 py-2 text-[11.5px] font-semibold text-success-foreground">
            📐 Barème détecté pour ce modèle : {insp.baremeApparieNom} — choisissez la taille et cliquez « Charger »
          </div>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Point de mesure</th>
                <th className="px-2 py-1.5 text-left">Taille</th>
                <th className="px-2 py-1.5 text-right">Spec (cm)</th>
                <th className="px-2 py-1.5 text-right">Tol. ±</th>
                <th className="px-2 py-1.5 text-right">Mesuré</th>
                <th className="px-2 py-1.5 text-right">Écart</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {insp.mesures.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-5 text-center text-muted-foreground">
                    Chargez un barème ou ajoutez des lignes manuellement.
                  </td>
                </tr>
              ) : (
                insp.mesures.map((m) => (
                  <tr key={m.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <ChampAction
                        valeur={m.point}
                        fige={fige}
                        liste="qc-points"
                        onSave={(x) => A.majMesure(insp.id, m.id, "point", x)}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <ChampAction valeur={m.taille} fige={fige} onSave={(x) => A.majMesure(insp.id, m.id, "taille", x)} />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <ChampAction
                        valeur={m.spec?.toString() ?? ""}
                        type="number"
                        step="0.01"
                        className="text-right"
                        fige={fige}
                        onSave={(x) => A.majMesure(insp.id, m.id, "spec", x)}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-20">
                      <ChampAction
                        valeur={m.tolerance?.toString() ?? ""}
                        type="number"
                        step="0.01"
                        className="text-right"
                        fige={fige}
                        onSave={(x) => A.majMesure(insp.id, m.id, "tolerance", x)}
                      />
                    </td>
                    <td className="px-2 py-1.5 w-24">
                      <ChampAction
                        valeur={m.mesure?.toString() ?? ""}
                        type="number"
                        step="0.01"
                        className="text-right font-semibold"
                        fige={fige}
                        onSave={(x) => A.majMesure(insp.id, m.id, "mesure", x)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      {m.ecart == null ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <StatusBadge tone={m.horsTolerance ? "danger" : "success"}>
                          {m.ecart > 0 ? "+" : ""}
                          {m.ecart}
                          {m.horsTolerance ? " ⚠" : ""}
                        </StatusBadge>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {!fige && (
                        <BoutonAction variant="ghost" onRun={() => A.supprimerMesure(insp.id, m.id)}>
                          <X className="size-3.5" />
                        </BoutonAction>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <datalist id="qc-points">
          {POINTS_MESURE.map((p2) => (
            <option key={p2} value={p2} />
          ))}
        </datalist>
        <div className="px-3 py-2 text-[10.5px] text-muted-foreground">
          Écart colorié automatiquement : vert = dans la tolérance, rouge ⚠ = hors tolérance (compté comme défaut
          majeur dans le verdict AQL).
        </div>
      </SectionPanel>

      {/* ─── 4 · photos générales ─── */}
      <SectionPanel
        title="4 · Photos générales (présentation, pliage, étiquette, packaging…)"
        actions={!fige && <BoutonPhoto inspectionId={insp.id} defautId={null} />}
      >
        {insp.photosGenerales.length === 0 ? (
          <div className="text-xs text-muted-foreground">Aucune photo générale.</div>
        ) : (
          <div className="flex flex-wrap gap-2">
            {insp.photosGenerales.map((ph) => (
              <Vignette key={ph.id} hash={ph.hash} onRetirer={fige ? undefined : () => A.retirerPhoto(insp.id, ph.id)} />
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ─── Actions correctives ─── */}
      <SectionPanel
        title={`Actions correctives (${insp.actions.length})`}
        actions={
          <BoutonAction onRun={() => A.ajouterAction(insp.id, null)} succes="Action créée">
            + Action corrective
          </BoutonAction>
        }
      >
        {insp.actions.length === 0 ? (
          <div className="text-xs text-muted-foreground">
            Aucune action corrective. Sur un défaut important, ouvrez-en une (bouton 🛠 sur le défaut, ou ci-dessus).
            Les actions restent modifiables après clôture — c&apos;est un suivi.
          </div>
        ) : (
          <div className="space-y-2.5">
            {insp.actions.map((a) => (
              <LigneAction key={a.id} action={a} />
            ))}
          </div>
        )}
      </SectionPanel>

      {/* ─── 5 · verdict ─── */}
      <SectionPanel title="5 · Verdict">
        <div className="flex flex-wrap items-center gap-4">
          <div
            className={`rounded-xl px-5 py-3 text-[17px] font-extrabold ${
              v.tone === "success"
                ? "bg-success-muted text-success-foreground"
                : v.tone === "warning"
                  ? "bg-warning-muted text-warning-foreground"
                  : "bg-[var(--danger-l)] text-[var(--danger-d)]"
            }`}
          >
            {v.label}
          </div>
          <div className="text-xs text-muted-foreground">
            Proposition AQL : <b>{VERDICTS[p.verdict].label}</b> — {p.raison}
            <br />
            Critiques : <b>{p.critiques}</b> · Majeurs (défauts + mesures hors tol.) : <b>{p.majeurs}</b> · Mineurs :{" "}
            <b>{p.mineurs}</b>
          </div>
          {!fige && (
            <select
              value={insp.verdictForce}
              onChange={(e) =>
                start(async () => {
                  const r = await A.majInspection(insp.id, "verdictForce", e.target.value);
                  if (!r.ok) toast.error(r.error);
                  router.refresh();
                })
              }
              className="rounded-md border border-input bg-card px-2 py-1.5 text-xs"
            >
              <option value="">Auto (AQL) → {VERDICTS[p.verdict].label}</option>
              <option value="accepte">Forcer : Accepté</option>
              <option value="reserve">Forcer : Accepté sous réserve</option>
              <option value="refuse">Forcer : Refusé</option>
            </select>
          )}
        </div>
        <div className="mt-3">
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Observations / conditions (visibles sur les rapports)
          </label>
          <ChampAction
            valeur={insp.note}
            type="textarea"
            fige={fige}
            placeholder="Ex. : retouches boutonnage sur 12 pcs avant expédition ; nouvelle présentation validée…"
            onSave={(x) => A.majInspection(insp.id, "note", x)}
          />
        </div>
      </SectionPanel>
    </>
  );
}

/* ─────────── éléments ─────────── */

/** Sélecteur + bouton pour appliquer un modèle de checklist à l'inspection. */
function ChargeurChecklist({ inspId, checklists }: { inspId: number; checklists: ChecklistRow[] }) {
  const [choix, setChoix] = useState(checklists[0]?.id ?? 0);
  return (
    <div className="flex items-center gap-1.5">
      <select
        value={choix}
        onChange={(e) => setChoix(Number(e.target.value))}
        className="h-8 rounded-md border border-input bg-card px-2 text-xs"
      >
        {checklists.map((c) => (
          <option key={c.id} value={c.id}>
            {c.nom}
            {c.typeProduit ? ` · ${c.typeProduit}` : ""} ({c.points.length})
          </option>
        ))}
      </select>
      <BoutonAction
        onRun={async () => {
          const r = await A.appliquerChecklist(inspId, choix);
          return r.ok ? { ok: true } : r;
        }}
        succes="Checklist appliquée"
      >
        Appliquer
      </BoutonAction>
    </div>
  );
}

function Bloc({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-bold uppercase text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

function Tuile({ titre, valeur, accent, danger }: { titre: string; valeur: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="rounded-xl bg-muted px-3 py-2.5 text-center">
      <div className="text-[10px] font-bold uppercase text-muted-foreground">{titre}</div>
      <div
        className={`mt-0.5 font-extrabold tabular-nums ${accent ? "text-2xl text-brand" : danger ? "text-[17px] text-[var(--danger-d)]" : "text-[17px]"}`}
      >
        {valeur}
      </div>
    </div>
  );
}

function LigneDefaut({
  insp,
  defaut,
  fige,
}: {
  insp: InspectionRow;
  defaut: InspectionRow["defauts"][number];
  fige: boolean;
}) {
  return (
    <div className="rounded-lg border bg-muted/30 p-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-[140px] flex-1">
          <ChampAction
            valeur={defaut.description}
            placeholder="Description du défaut…"
            fige={fige}
            onSave={(x) => A.majDefaut(insp.id, defaut.id, "description", x)}
          />
        </div>
        <div className="w-32">
          <ChampAction
            valeur={defaut.emplacement}
            placeholder="Emplacement…"
            fige={fige}
            onSave={(x) => A.majDefaut(insp.id, defaut.id, "emplacement", x)}
          />
        </div>
        <div className="w-28">
          <SelectAction
            valeur={defaut.gravite}
            options={GRAVITES.map((g) => ({ value: g.value, label: g.label }))}
            fige={fige}
            onSave={(x) => A.majDefaut(insp.id, defaut.id, "gravite", x)}
          />
        </div>
        <div className="w-16">
          <ChampAction
            valeur={String(defaut.nombre)}
            type="number"
            className="text-right"
            fige={fige}
            onSave={(x) => A.majDefaut(insp.id, defaut.id, "nombre", x)}
          />
        </div>
        {!fige && (
          <>
            <BoutonPhoto inspectionId={insp.id} defautId={defaut.id} compact />
            <BoutonAction
              variant="ghost"
              onRun={() => A.ajouterAction(insp.id, defaut.id)}
              succes="Action corrective créée"
              title="Ouvrir une action corrective pour ce défaut"
            >
              🛠
            </BoutonAction>
            <BoutonAction variant="ghost" onRun={() => A.supprimerDefaut(insp.id, defaut.id)}>
              <Trash2 className="size-3.5" />
            </BoutonAction>
          </>
        )}
      </div>
      {defaut.photos.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {defaut.photos.map((ph) => (
            <Vignette
              key={ph.id}
              hash={ph.hash}
              petite
              onRetirer={fige ? undefined : () => A.retirerPhoto(insp.id, ph.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function Vignette({
  hash,
  petite,
  onRetirer,
}: {
  hash: string;
  petite?: boolean;
  onRetirer?: () => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const run = useAction();
  const taille = petite ? "size-14" : "size-24";
  return (
    <div className={`relative ${taille} overflow-hidden rounded-lg border`}>
      <a href={`/api/fichier/${hash}`} target="_blank" rel="noreferrer">
        {/* Fichier servi par notre route, dimensions inconnues : <img> est ici le bon outil. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`/api/fichier/${hash}`} alt="Photo d'inspection" className="size-full object-cover" />
      </a>
      {onRetirer && (
        <button
          onClick={() => run(onRetirer, "Photo retirée")}
          className="absolute right-0.5 top-0.5 grid size-5 place-items-center rounded-full bg-black/60 text-white"
          aria-label="Retirer la photo"
        >
          <X className="size-3" />
        </button>
      )}
    </div>
  );
}

function BoutonPhoto({
  inspectionId,
  defautId,
  compact,
}: {
  inspectionId: number;
  defautId: number | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();

  return (
    <>
      <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
        <Camera className="size-3.5" /> {compact ? "" : pending ? "Envoi…" : "Ajouter une photo"}
      </Button>
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const compressee = await compresser(f);
          const fd = new FormData();
          fd.set("inspectionId", String(inspectionId));
          if (defautId !== null) fd.set("defautId", String(defautId));
          fd.set("fichier", compressee, "photo.jpg");
          start(async () => {
            const r = await A.televerserPhoto(fd);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Photo ajoutée");
            router.refresh();
          });
        }}
      />
    </>
  );
}

/* ─── Action corrective : une carte éditable, avec photos avant/après ───
 *
 * Modifiable même après clôture (suivi). Statuts : à traiter → en cours →
 * corrigé → vérifié → clôturé. Deux emplacements photo (avant / après) qui
 * réutilisent la compression et le stockage par hash. */
function LigneAction({ action: a }: { action: InspectionRow["actions"][number] }) {
  const st = STATUTS_ACTION.find((s) => s.value === a.statut);
  return (
    <div className="rounded-xl border bg-card p-3">
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <StatusBadge tone={st?.tone ?? "neutral"}>{st?.label ?? a.statut}</StatusBadge>
        <div className="ml-auto flex items-center gap-2">
          <div className="w-40">
            <SelectAction
              valeur={a.statut}
              options={STATUTS_ACTION.map((s) => ({ value: s.value, label: s.label }))}
              onSave={(x) => A.majAction(a.id, "statut", x)}
            />
          </div>
          <BoutonAction variant="ghost" confirmer="Supprimer cette action ?" onRun={() => A.supprimerAction(a.id)}>
            <Trash2 className="size-3.5" />
          </BoutonAction>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <Bloc label="Défaut constaté">
          <ChampAction valeur={a.defaut} placeholder="Défaut…" onSave={(x) => A.majAction(a.id, "defaut", x)} />
        </Bloc>
        <Bloc label="Cause (5M)">
          <ChampAction valeur={a.cause} placeholder="Cause racine…" onSave={(x) => A.majAction(a.id, "cause", x)} />
        </Bloc>
        <Bloc label="Action corrective">
          <ChampAction valeur={a.action} placeholder="Action décidée…" onSave={(x) => A.majAction(a.id, "action", x)} />
        </Bloc>
        <div className="grid grid-cols-2 gap-2">
          <Bloc label="Responsable">
            <ChampAction
              valeur={a.responsable}
              placeholder="Nom…"
              onSave={(x) => A.majAction(a.id, "responsable", x)}
            />
          </Bloc>
          <Bloc label="Échéance">
            <ChampAction valeur={a.echeance} type="date" onSave={(x) => A.majAction(a.id, "echeance", x)} />
          </Bloc>
        </div>
      </div>

      <div className="mt-2 grid grid-cols-2 gap-3">
        <PhotoAction actionId={a.id} quand="avant" hash={a.photoAvant} />
        <PhotoAction actionId={a.id} quand="apres" hash={a.photoApres} />
      </div>
    </div>
  );
}

function PhotoAction({ actionId, quand, hash }: { actionId: number; quand: "avant" | "apres"; hash: string | null }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const label = quand === "avant" ? "Photo AVANT" : "Photo APRÈS";

  return (
    <div className="rounded-lg border border-dashed p-2">
      <div className="mb-1 text-[10.5px] font-bold uppercase text-muted-foreground">{label}</div>
      {hash ? (
        <div className="flex items-start gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={`/api/fichier/${hash}`} alt={label} className="h-24 w-auto rounded border object-cover" />
          <BoutonAction variant="ghost" onRun={() => A.retirerPhotoAction(actionId, quand)}>
            <Trash2 className="size-3.5" />
          </BoutonAction>
        </div>
      ) : (
        <Button variant="outline" size="sm" disabled={pending} onClick={() => input.current?.click()}>
          <Camera className="size-3.5" /> {pending ? "Envoi…" : "Ajouter"}
        </Button>
      )}
      <input
        ref={input}
        type="file"
        accept="image/*"
        capture="environment"
        hidden
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          const compressee = await compresser(f);
          const fd = new FormData();
          fd.set("actionId", String(actionId));
          fd.set("quand", quand);
          fd.set("fichier", compressee, "photo.jpg");
          start(async () => {
            const r = await A.photoAction(fd);
            if (!r.ok) {
              toast.error(r.error);
              return;
            }
            toast.success("Photo ajoutée");
            router.refresh();
          });
        }}
      />
    </div>
  );
}

/** Compression avant envoi — 560 px de côté maximum, JPEG qualité 0,62, comme
 * PilotPro : les rapports restent lisibles et les photos d'atelier ne saturent
 * pas le stockage. */
async function compresser(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const max = 560;
  let { width: w, height: h } = bitmap;
  if (w > h) {
    if (w > max) {
      h = Math.round((h * max) / w);
      w = max;
    }
  } else if (h > max) {
    w = Math.round((w * max) / h);
    h = max;
  }
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(bitmap, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, "image/jpeg", 0.62));
  return blob ?? file;
}
