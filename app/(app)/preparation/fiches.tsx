"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Printer } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/components/shared/status-badge";
import { RESPONSABLE_DOMAINE } from "@/lib/domain/feux";
import type { PreparationRow } from "@/lib/services/preparation";
import {
  ajouterLigneFourniture,
  majChamp,
  majEtape,
  majLigneFourniture,
  supprimerLigneFourniture,
} from "@/lib/actions/preparation";
import { BandeauLectureSeule, BoutonAction, ChampServeur, type Droits } from "./ecran";

const nb = new Intl.NumberFormat("fr-FR");

/** Case à cocher pilotée par une action serveur : optimiste à l'affichage,
 * remise à l'état serveur si l'écriture est refusée. */
function CaseServeur({
  coche,
  autorise,
  label,
  onSave,
}: {
  coche: boolean;
  autorise: boolean;
  label: string;
  onSave: (v: boolean) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [v, setV] = useState(coche);
  const [pending, start] = useTransition();
  return (
    <label
      className={`flex items-center gap-2.5 text-sm font-bold ${autorise ? "cursor-pointer" : "cursor-not-allowed"} ${pending ? "opacity-60" : ""}`}
    >
      <input
        type="checkbox"
        checked={v}
        disabled={!autorise || pending}
        onChange={(e) => {
          const next = e.target.checked;
          setV(next);
          start(async () => {
            const res = await onSave(next);
            if (!res.ok) {
              toast.error(res.error);
              setV(coche);
              return;
            }
            router.refresh();
          });
        }}
        className="size-4 accent-[var(--ok)]"
      />
      {label}
    </label>
  );
}

function Champ({ label, children, large }: { label: string; children: React.ReactNode; large?: boolean }) {
  return (
    <div className={large ? "sm:col-span-2" : undefined}>
      <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ═══════════ BUREAU MODÉLISME ═══════════ */

export function FicheModelisme({ row, droits }: { row: PreparationRow; droits: Droits }) {
  const carte = (etape: "patronage" | "traces", label: string, icone: string, aide: string) => {
    const e = row.etapes.find((x) => x.etape === etape);
    const fait = e?.fait === true;
    return (
      <div
        className={`flex-1 min-w-[260px] rounded-xl border-2 p-4 ${fait ? "border-success" : "border-border"} bg-card`}
      >
        <CaseServeur
          coche={fait}
          autorise={droits.modelisme}
          label={`${icone} ${label}`}
          onSave={(next) => majEtape(row.id, etape, next)}
        />
        <div className="mt-2 pl-7 text-[11px] text-muted-foreground">{aide}</div>
        {fait && (
          <div className="mt-2 pl-7 text-[11.5px] font-semibold text-success-foreground">
            ✓ Validé le <b>{e?.date}</b>
            {e?.par ? (
              <>
                {" "}
                par <b>{e.par}</b>
              </>
            ) : null}
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      <BandeauLectureSeule autorise={droits.modelisme} qui={RESPONSABLE_DOMAINE.modelisme} />
      {!row.okPro && (
        <div className="mb-3 rounded-lg border border-warning bg-warning-muted px-3 py-2 text-xs">
          ⏳ Ce modèle n&apos;est pas encore <b>OK production</b> — la tête de série est en cours à la direction technique.
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        {carte("patronage", "Travail de la modéliste", "📐", "Patron de base, gradation des tailles, dossier technique.")}
        {carte("traces", "Tirage des tracés", "🖨", "Placement et tirage du tracé de coupe pour l'atelier.")}
      </div>
      <BlocPlan row={row} droits={droits} />
    </div>
  );
}

/** Le plan de coupe dans l'espace de la modéliste : son état, et l'accès.
 *
 * La préparation suit les mêmes droits que le patronage — c'est le même
 * bureau ; la consultation reste ouverte, l'atelier de coupe doit pouvoir lire
 * la fiche de matelassage. Une sous-commande renvoie vers son porteur : on
 * coupe le tissu une fois pour le groupe. */
function BlocPlan({ row, droits }: { row: PreparationRow; droits: Droits }) {
  const cible = row.parentId ?? row.id;
  const plan = row.plan;

  const etat = !plan
    ? { label: "À préparer", tone: "warning" as const }
    : {
        label:
          `${plan.nbMatieres} matière${plan.nbMatieres > 1 ? "s" : ""} · ${plan.nbTraces} tracé${plan.nbTraces > 1 ? "s" : ""}` +
          (plan.estime ? " · longueurs à confirmer" : " · longueurs réelles ✓") +
          (plan.par ? ` · par ${plan.par}${plan.date ? ` le ${plan.date}` : ""}` : ""),
        tone: plan.estime ? ("warning" as const) : ("success" as const),
      };

  return (
    <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border bg-card p-3">
      <span className="text-[13px] font-bold">📐 Plan de coupe (matelassage)</span>
      {row.parentId ? (
        <StatusBadge tone="neutral">géré par l&apos;OF porteur {row.porteurOf || ""}</StatusBadge>
      ) : (
        <StatusBadge tone={etat.tone}>{etat.label}</StatusBadge>
      )}
      {plan && !row.parentId && (
        <span className="text-[11px] text-muted-foreground">
          {nb.format(plan.pieces)} pièces · {plan.metres.toFixed(1)} m
        </span>
      )}
      <Link
        href={`/modelisme/${cible}/plan`}
        className="ml-auto rounded-md border px-3 py-1.5 text-xs font-semibold hover:bg-muted"
      >
        {droits.modelisme && !row.parentId ? "📐 Préparer le plan" : "👁 Consulter le plan"}
      </Link>
    </div>
  );
}

/* ═══════════ NOMENCLATURE ═══════════ */

export function FicheNomen({ row, droits }: { row: PreparationRow; droits: Droits }) {
  const ec = row.ecartConsoPct;
  return (
    <div>
      <BandeauLectureSeule autorise={droits.nomen} qui={RESPONSABLE_DOMAINE.nomen} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Consommation théorique (m/pièce)">
          <ChampServeur
            valeur={row.consoTheo?.toString() ?? ""}
            type="number"
            step="0.001"
            autorise={droits.nomen}
            onSave={(v) => majChamp(row.id, "consoTheo", v)}
          />
        </Champ>
        <Champ label="Taux de chute (%)">
          <ChampServeur
            valeur={row.chutePct?.toString() ?? ""}
            type="number"
            step="0.1"
            placeholder={`${row.chuteEffective} (défaut)`}
            autorise={droits.nomen}
            onSave={(v) => majChamp(row.id, "chutePct", v)}
          />
        </Champ>
        <Champ label="Consommation réelle constatée (m/pièce)">
          <ChampServeur
            valeur={row.consoReel?.toString() ?? ""}
            type="number"
            step="0.001"
            autorise={droits.nomen}
            onSave={(v) => majChamp(row.id, "consoReel", v)}
          />
        </Champ>
        <Champ label="Besoin total calculé">
          <div className="rounded-md border bg-muted px-2 py-1 text-xs font-bold tabular-nums">
            {row.besoinTissu > 0 ? `${row.besoinTissu.toFixed(1)} m` : "—"}
          </div>
        </Champ>
      </div>
      {ec != null && (
        <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
          Écart théorique / réel :{" "}
          <StatusBadge tone={Math.abs(ec) > 5 ? "danger" : "success"}>
            {ec > 0 ? "+" : ""}
            {ec.toFixed(1)} %
          </StatusBadge>
          {Math.abs(ec) > 5 && " — écart important, la nomenclature mérite d'être révisée pour les prochaines commandes de ce modèle."}
        </div>
      )}
    </div>
  );
}

/* ═══════════ MAGASIN TISSU ═══════════ */

const CONTROLES = [
  { value: "", label: "Non contrôlé" },
  { value: "conforme", label: "Conforme" },
  { value: "reserve", label: "Accepté sous réserve" },
  { value: "refuse", label: "Refusé" },
];

export function FicheTissu({ row, droits }: { row: PreparationRow; droits: Droits }) {
  return (
    <div>
      <BandeauLectureSeule autorise={droits.tissu} qui={RESPONSABLE_DOMAINE.tissu} />

      {/* Le bon s'imprime à tout moment : avant réception il vaut état d'attente,
          après contrôle il vaut accusé. Nouvel onglet, pour ne pas faire perdre
          au magasinier la fiche qu'il est en train de remplir. */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Link
          href={`/magtissu/${row.id}/imprimer`}
          target="_blank"
          className="inline-flex items-center gap-1.5 rounded-md border border-input px-2.5 py-1 text-[11px] font-semibold hover:bg-muted"
        >
          <Printer className="size-3.5" /> Bon de réception
        </Link>
        <span className="text-[11px] text-muted-foreground">
          {row.tissuDateReelle
            ? "Métrage, écart, contrôle et journal des mouvements."
            : "Imprimable dès maintenant — il portera la mention « non réceptionné »."}
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Champ label="Date de réception prévue">
          <ChampServeur
            valeur={row.receptTissu}
            type="date"
            autorise={droits.tissu}
            onSave={(v) => majChamp(row.id, "receptTissu", v)}
          />
        </Champ>
        <Champ label="Date de réception réelle">
          <ChampServeur
            valeur={row.tissuDateReelle}
            type="date"
            autorise={droits.tissu}
            onSave={(v) => majChamp(row.id, "tissuDateReelle", v)}
          />
        </Champ>
        <Champ label="Métrage reçu (m)">
          <ChampServeur
            valeur={row.tissuRecu ? String(row.tissuRecu) : ""}
            type="number"
            step="0.01"
            autorise={droits.tissu}
            onSave={(v) => majChamp(row.id, "tissuRecu", v)}
          />
        </Champ>
        <Champ label="Contrôle qualité">
          <ChampServeur
            valeur={row.tissuControle}
            type="select"
            options={CONTROLES}
            autorise={droits.tissu}
            onSave={(v) => majChamp(row.id, "tissuControle", v)}
          />
        </Champ>
        <Champ label="Observations (nuance, laize, défauts…)" large>
          <ChampServeur
            valeur={row.tissuNote}
            autorise={droits.tissu}
            onSave={(v) => majChamp(row.id, "tissuNote", v)}
          />
        </Champ>
      </div>

      {row.besoinTissu > 0 ? (
        <div className="mt-3 rounded-lg bg-muted px-3 py-2 text-xs">
          Besoin théorique <b>{row.besoinTissu.toFixed(1)} m</b> ({(row.consoTheo ?? 0).toFixed(3)} m/pc +{" "}
          {row.chuteEffective}% de chute × {nb.format(row.qte)} pcs) — reçu <b>{nb.format(row.tissuRecu)} m</b>
          {row.ecartTissu != null && (
            <>
              {" · "}
              <StatusBadge tone={row.ecartTissu < 0 ? "danger" : "success"}>
                {row.ecartTissu < 0
                  ? `manque ${Math.abs(row.ecartTissu).toFixed(1)}`
                  : `excédent ${row.ecartTissu.toFixed(1)}`}{" "}
                m
              </StatusBadge>
            </>
          )}
        </div>
      ) : (
        <div className="mt-3 text-xs text-warning-foreground">
          ⚠ Nomenclature non saisie — le besoin théorique ne peut pas être calculé.
        </div>
      )}
    </div>
  );
}

/* ═══════════ MAGASIN FOURNITURES ═══════════ */

const STATUTS_GLOBAUX = [
  { value: "", label: "En attente" },
  { value: "partiel", label: "Partielles" },
  { value: "complet", label: "Complètes" },
];

export function FicheFournitures({ row, droits }: { row: PreparationRow; droits: Droits }) {
  const detaille = row.fournitures.length > 0;
  return (
    <div>
      <BandeauLectureSeule autorise={droits.four} qui={RESPONSABLE_DOMAINE.four} />

      <div className="mb-3 flex flex-wrap items-center gap-3">
        <label className="text-[11px] font-bold uppercase text-muted-foreground">Statut global</label>
        <div className="w-48">
          <ChampServeur
            valeur={row.fournituresStatut}
            type="select"
            options={STATUTS_GLOBAUX}
            /* Verrouillé dès qu'il y a du détail : c'est lui qui fait foi. */
            autorise={droits.four && !detaille}
            onSave={(v) => majChamp(row.id, "fournituresStatut", v)}
          />
        </div>
        {droits.four && (
          <BoutonAction onRun={() => ajouterLigneFourniture(row.id)} succes="Ligne ajoutée">
            + Ligne de détail
          </BoutonAction>
        )}
        <span className="text-[11px] text-muted-foreground">
          {detaille
            ? "Le détail ci-dessous fait foi et pilote le feu."
            : "Ajoutez des lignes pour suivre chaque référence."}
        </span>
      </div>

      {detaille && (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
                <th className="px-2 py-1.5 text-left">Désignation</th>
                <th className="px-2 py-1.5 text-center">Prévu</th>
                <th className="px-2 py-1.5 text-center">Reçu</th>
                <th className="px-2 py-1.5 text-center">Unité</th>
                <th className="px-2 py-1.5 text-center">Reste</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody>
              {row.fournitures.map((l) => {
                const reste = l.qtePrevue - l.qteRecue;
                return (
                  <tr key={l.id} className="border-b last:border-0">
                    <td className="px-2 py-1.5">
                      <ChampServeur
                        valeur={l.designation}
                        placeholder="Bouton, fermeture, étiquette…"
                        autorise={droits.four}
                        onSave={(v) => majLigneFourniture(l.id, "designation", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <ChampServeur
                        valeur={String(l.qtePrevue)}
                        type="number"
                        step="0.01"
                        className="text-center"
                        autorise={droits.four}
                        onSave={(v) => majLigneFourniture(l.id, "qtePrevue", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <ChampServeur
                        valeur={String(l.qteRecue)}
                        type="number"
                        step="0.01"
                        className="text-center"
                        autorise={droits.four}
                        onSave={(v) => majLigneFourniture(l.id, "qteRecue", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <ChampServeur
                        valeur={l.unite}
                        className="text-center"
                        autorise={droits.four}
                        onSave={(v) => majLigneFourniture(l.id, "unite", v)}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {reste > 0 ? (
                        <StatusBadge tone="danger">{Number(reste.toFixed(2))}</StatusBadge>
                      ) : (
                        <StatusBadge tone="success">✓</StatusBadge>
                      )}
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      {droits.four && (
                        <BoutonAction
                          variant="ghost"
                          onRun={() => supprimerLigneFourniture(l.id)}
                          confirmer="Retirer cette ligne ?"
                          succes="Ligne retirée"
                        >
                          ×
                        </BoutonAction>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
