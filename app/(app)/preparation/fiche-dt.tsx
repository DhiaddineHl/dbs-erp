"use client";

import { FichesModele } from "./fiches-modele";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/shared/status-badge";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { RESPONSABLE_DOMAINE } from "@/lib/domain/feux";
import { urlSuivi } from "@/lib/domain/portail";
import type { PreparationRow } from "@/lib/services/preparation";
import {
  ajouterTds,
  annulerLancement,
  lancer,
  lancerParDerogation,
  majTds,
  supprimerTds,
} from "@/lib/actions/preparation";
import { BandeauLectureSeule, BoutonAction, ChampServeur, LienFeu, type Droits } from "./ecran";

const nb = new Intl.NumberFormat("fr-FR");

const VERDICTS = [
  { value: "attente", label: "En attente client" },
  { value: "ok", label: "OK Production" },
  { value: "refus", label: "Refusée" },
];
const VERDICT_BADGE: Record<string, { tone: "success" | "danger" | "warning"; label: string }> = {
  ok: { tone: "success", label: "✓ OK Production" },
  refus: { tone: "danger", label: "✕ Refusée" },
  attente: { tone: "warning", label: "⏳ Attente client" },
};
const VERDICTS_OK = [
  { value: "attente", label: "En attente client" },
  { value: "ok", label: "OK livraison" },
  { value: "refus", label: "Refusé" },
];
const BADGE_OK: Record<string, { tone: "success" | "danger" | "warning"; label: string }> = {
  ok: { tone: "success", label: "✓ OK livraison" },
  refus: { tone: "danger", label: "✕ Refusé" },
  attente: { tone: "warning", label: "⏳ Attente client" },
};

/** Lien de suivi du transporteur (DHL…) — le même que voit le client. */
function LienSuivi({ transporteur, suivi }: { transporteur?: string; suivi?: string }) {
  const url = urlSuivi(transporteur ?? "", suivi ?? "");
  if (!suivi) return null;
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="text-[10.5px] font-semibold text-brand underline">
      Suivre le colis ↗
    </a>
  ) : null;
}

/** Tableau d'envois au client (têtes de série, pièces pour l'OK livraison). */
function TableEnvois({
  lignes,
  prefixe,
  verdicts,
  badges,
  droits,
}: {
  lignes: PreparationRow["tds"];
  prefixe: string;
  verdicts: { value: string; label: string }[];
  badges: Record<string, { tone: "success" | "danger" | "warning"; label: string }>;
  droits: Droits;
}) {
  return (
    <div className="overflow-x-auto rounded-lg border">
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b bg-muted/40 text-[10.5px] uppercase text-muted-foreground">
            <th className="px-2 py-1.5 text-left">{prefixe.trim()}</th>
            <th className="px-2 py-1.5 text-left">Envoyée le</th>
            <th className="px-2 py-1.5 text-left">Transporteur · n° de suivi</th>
            <th className="px-2 py-1.5 text-left">Retour client</th>
            <th className="px-2 py-1.5 text-left">Verdict</th>
            <th className="px-2 py-1.5 text-left">Commentaires client</th>
            <th className="w-8" />
          </tr>
        </thead>
        <tbody>
          {lignes.map((t) => {
            const v = badges[t.verdict] ?? { tone: "warning" as const, label: t.verdict };
            return (
              <tr key={t.id} className="border-b last:border-0">
                <td className="px-2 py-1.5">
                  <b>
                    {prefixe}
                    {t.n}
                  </b>
                  {t.par && <div className="text-[10px] text-muted-foreground">{t.par}</div>}
                </td>
                <td className="px-2 py-1.5">
                  <ChampServeur valeur={t.envoi ?? ""} type="date" autorise={droits.tds} onSave={(val) => majTds(t.id, "envoi", val)} />
                </td>
                <td className="min-w-[170px] px-2 py-1.5">
                  <ChampServeur valeur={t.transporteur ?? ""} placeholder="DHL" autorise={droits.tds} onSave={(val) => majTds(t.id, "transporteur", val)} />
                  <ChampServeur valeur={t.suivi ?? ""} placeholder="N° de suivi" autorise={droits.tds} onSave={(val) => majTds(t.id, "suivi", val)} />
                  <LienSuivi transporteur={t.transporteur} suivi={t.suivi} />
                </td>
                <td className="px-2 py-1.5">
                  <ChampServeur valeur={t.retour ?? ""} type="date" autorise={droits.tds} onSave={(val) => majTds(t.id, "retour", val)} />
                </td>
                <td className="px-2 py-1.5">
                  <ChampServeur valeur={t.verdict} type="select" options={verdicts} autorise={droits.tds} onSave={(val) => majTds(t.id, "verdict", val)} />
                  <div className="mt-1">
                    <StatusBadge tone={v.tone}>{v.label}</StatusBadge>
                  </div>
                </td>
                <td className="min-w-[190px] px-2 py-1.5">
                  <ChampServeur
                    valeur={t.commentaire}
                    type="textarea"
                    placeholder="Remarques du client…"
                    autorise={droits.tds}
                    onSave={(val) => majTds(t.id, "commentaire", val)}
                  />
                </td>
                <td className="px-2 py-1.5 text-center">
                  {droits.tds && (
                    <BoutonAction
                      variant="ghost"
                      onRun={() => supprimerTds(t.id)}
                      confirmer={`Supprimer ${prefixe}${t.n} et son historique ?`}
                      succes="Envoi supprimé"
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
  );
}

export function FicheDt({
  row,
  droits,
  faconniers,
}: {
  row: PreparationRow;
  droits: Droits;
  faconniers: string[];
}) {
  const derniere = row.tds.at(-1);
  const relance = derniere?.verdict === "refus";

  return (
    <div className="flex flex-col gap-4">
      {/* ── fiches du modèle (fiche technique, fiche commentaire) ── */}
      <FichesModele commandeId={row.id} of={row.of} documents={row.documents} peutDeposer={droits.tds} />

      {/* ── têtes de série ── */}
      <div>
        <BandeauLectureSeule autorise={droits.tds} qui={RESPONSABLE_DOMAINE.tds} />
        <div className="mb-2 flex items-center gap-2">
          <b className="text-[12px] uppercase tracking-wide text-muted-foreground">🧵 Têtes de série</b>
          <StatusBadge tone={row.okPro ? "success" : "warning"}>
            {row.okPro ? "OK Production" : row.tds.length ? `TDS${row.tds.length} en cours` : "à lancer"}
          </StatusBadge>
        </div>

        {row.tds.length === 0 ? (
          <div className="mb-2 text-xs text-muted-foreground">Aucune tête de série lancée pour ce modèle.</div>
        ) : (
          <TableEnvois lignes={row.tds} prefixe="TDS" verdicts={VERDICTS} badges={VERDICT_BADGE} droits={droits} />
        )}

        {droits.tds && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <BoutonAction
              variant={!row.tds.length || relance ? "default" : "outline"}
              onRun={() => ajouterTds(row.id)}
              succes="Tête de série lancée"
            >
              +{" "}
              {row.tds.length
                ? `Nouvelle tête de série (TDS${row.tds.length + 1})`
                : "Lancer la tête de série (TDS1)"}
            </BoutonAction>
            {relance && (
              <span className="text-xs font-semibold text-[var(--danger-d)]">
                ⚠ TDS{derniere?.n} refusée — une nouvelle tête de série est nécessaire.
              </span>
            )}
            {row.okPro && (
              <span className="text-xs font-bold text-success-foreground">✓ Modèle OK PRODUCTION</span>
            )}
          </div>
        )}
      </div>

      {/* ── pièces envoyées pour l'OK livraison (hors OK production) ── */}
      <div>
        <div className="mb-2 text-sm font-bold">📦 Pièces pour l&apos;OK livraison</div>
        {row.echantillons.length === 0 ? (
          <div className="mb-2 text-xs text-muted-foreground">Aucun envoi pour l&apos;OK livraison.</div>
        ) : (
          <TableEnvois lignes={row.echantillons} prefixe="Envoi " verdicts={VERDICTS_OK} badges={BADGE_OK} droits={droits} />
        )}
        {droits.tds && (
          <div className="mt-2">
            <BoutonAction variant="outline" onRun={() => ajouterTds(row.id, "ok")} succes="Envoi pour OK livraison enregistré">
              + Envoyer des pièces pour l&apos;OK livraison
            </BoutonAction>
          </div>
        )}
        <div className="mt-1 text-[11px] text-muted-foreground">
          Le client voit ces envois (et le lien de suivi DHL) sur son portail, et peut répondre OK ou refuser en ligne.
        </div>
      </div>

      <BlocLancement row={row} droits={droits} faconniers={faconniers} />
    </div>
  );
}

/* ═══════════ BLOC LANCEMENT ═══════════ */

function BlocLancement({
  row,
  droits,
  faconniers,
}: {
  row: PreparationRow;
  droits: Droits;
  faconniers: string[];
}) {
  const bordure = row.lancee
    ? "border-success"
    : row.pret
      ? "border-brand"
      : "border-[var(--danger)]";
  const fond = row.lancee ? "bg-success-muted" : row.pret ? "bg-accent" : "bg-[var(--danger-l)]";

  return (
    <div className={`overflow-hidden rounded-xl border-2 ${bordure}`}>
      <div className={`border-b px-4 py-2 text-[13px] font-bold ${fond}`}>🏭 Lancement en production</div>
      <div className="bg-card p-4">
        {row.lancee ? (
          <Lancee row={row} droits={droits} />
        ) : row.pret ? (
          <Prete row={row} droits={droits} faconniers={faconniers} />
        ) : (
          <Bloquee row={row} droits={droits} faconniers={faconniers} />
        )}
      </div>
    </div>
  );
}

function Lancee({ row, droits }: { row: PreparationRow; droits: Droits }) {
  const l = row.lancement!;
  return (
    <>
      <div className="mb-2 text-sm font-bold text-success-foreground">
        ✓ Lancée le {l.date} —{" "}
        {l.mode === "soustraitance"
          ? `sous-traitance chez ${row.faconnier || "façonnier non précisé"}`
          : "coupe interne"}
      </div>
      <div className="text-xs text-muted-foreground">Lancée par {l.par || "—"}</div>

      {l.derogationMotif && (
        <div className="mt-3 rounded-lg border-[1.5px] border-[var(--danger)] bg-[var(--danger-l)] p-3">
          <div className="text-[13px] font-bold text-[var(--danger-d)]">⚠ Lancée par dérogation</div>
          <div className="mt-1 text-xs">
            <b>Motif :</b> {l.derogationMotif}
          </div>
          <div className="mt-0.5 text-[11px] text-muted-foreground">
            Accordée par {l.derogationPar} le {l.derogationDate}
          </div>
          {l.derogationManques.length > 0 && (
            <div className="mt-1 text-[11px] text-[var(--danger-d)]">
              Points non satisfaits au lancement : {l.derogationManques.join(" · ")}
            </div>
          )}
        </div>
      )}

      {droits.lancement && (
        <div className="mt-3">
          <BoutonAction
            variant="destructive"
            onRun={() => annulerLancement(row.id)}
            confirmer={`Annuler le lancement de ${row.modele} ?\n\nLa commande repasse en préparation.`}
            succes="Lancement annulé"
          >
            ↺ Annuler le lancement
          </BoutonAction>
        </div>
      )}
    </>
  );
}

function Prete({ row, droits, faconniers }: { row: PreparationRow; droits: Droits; faconniers: string[] }) {
  return (
    <>
      <div className="mb-3 text-[13px] font-semibold text-success-foreground">
        ✓ Tous les feux bloquants sont au vert — la commande peut partir en production.
      </div>
      {droits.lancement ? (
        <div className="flex flex-wrap gap-2">
          <BoutonAction
            variant="default"
            onRun={() => lancer(row.id, "interne")}
            succes={`${row.modele} lancé en coupe interne`}
          >
            ✂️ Lancer en coupe interne
          </BoutonAction>
          <DialogSousTraitance row={row} faconniers={faconniers} />
        </div>
      ) : (
        <div className="text-xs text-muted-foreground">Le lancement est décidé par la direction technique.</div>
      )}
    </>
  );
}

function Bloquee({ row, droits, faconniers }: { row: PreparationRow; droits: Droits; faconniers: string[] }) {
  return (
    <>
      <div className="mb-2 text-[13px] font-bold text-[var(--danger-d)]">
        ⛔ Lancement bloqué — {row.bloquants.length} point(s) à régler :
      </div>
      <ul className="mb-3 ml-5 list-disc text-xs leading-relaxed">
        {row.bloquants.map((f) => (
          <li key={f.id}>
            {f.icone} <b>{f.label}</b> — {f.etat.label} <LienFeu feu={f} />
          </li>
        ))}
      </ul>
      {droits.derogation ? (
        <>
          <DialogDerogation row={row} faconniers={faconniers} />
          <div className="mt-1.5 text-[11px] text-muted-foreground">
            Le motif est obligatoire et reste inscrit dans le journal de la commande.
          </div>
        </>
      ) : (
        <div className="text-xs text-muted-foreground">
          Seuls un administrateur ou un responsable de production peuvent accorder une dérogation.
        </div>
      )}
    </>
  );
}

/* ── envoi en sous-traitance ── */

function DialogSousTraitance({ row, faconniers }: { row: PreparationRow; faconniers: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [fac, setFac] = useState(row.faconnier || faconniers[0] || "");
  const [pending, start] = useTransition();

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button size="sm" disabled={!faconniers.length} />}>
        🤝 Envoyer en sous-traitance
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>🤝 Envoyer {row.modele} en sous-traitance</DialogTitle>
        </DialogHeader>
        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Façonnier *</label>
          <select
            value={fac}
            onChange={(e) => setFac(e.target.value)}
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
          >
            {faconniers.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
          <div className="mt-2 text-xs text-muted-foreground">
            {nb.format(row.qte)} pièces · export prévu le {row.dateExport || "—"}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            disabled={pending || !fac}
            onClick={() =>
              start(async () => {
                const res = await lancer(row.id, "soustraitance", fac);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.success(`${row.modele} envoyé chez ${fac}`);
                setOpen(false);
                router.refresh();
              })
            }
          >
            Confirmer l&apos;envoi
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ── dérogation ── */

function DialogDerogation({ row, faconniers }: { row: PreparationRow; faconniers: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [motif, setMotif] = useState("");
  const [mode, setMode] = useState<"interne" | "soustraitance">("interne");
  const [fac, setFac] = useState(row.faconnier || faconniers[0] || "");
  const [pending, start] = useTransition();

  const motifValide = motif.trim().length >= 10;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="destructive" size="sm" />}>
        ⚠ Forcer le lancement (dérogation motivée)
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>⚠ Dérogation — forcer le lancement de {row.modele}</DialogTitle>
        </DialogHeader>

        <div className="rounded-lg border-[1.5px] border-[var(--danger)] bg-[var(--danger-l)] p-3">
          <div className="mb-1.5 text-[13px] font-bold text-[var(--danger-d)]">Points non satisfaits :</div>
          <ul className="ml-5 list-disc text-xs leading-relaxed">
            {row.bloquants.map((f) => (
              <li key={f.id}>
                {f.icone} <b>{f.label}</b> — {f.etat.label}
              </li>
            ))}
          </ul>
        </div>

        <div>
          <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">
            Motif de la dérogation * <span className="text-[var(--danger-d)]">(obligatoire, conservé au journal)</span>
          </label>
          <textarea
            rows={3}
            value={motif}
            onChange={(e) => setMotif(e.target.value)}
            placeholder="Ex. : tissu contrôlé physiquement à l'atelier, saisie à régulariser — accord client du 12/03"
            className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
          />
          {!motifValide && motif.length > 0 && (
            <div className="mt-1 text-[11px] text-[var(--danger-d)]">10 caractères minimum.</div>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Mode de lancement</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as "interne" | "soustraitance")}
              className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
            >
              <option value="interne">Coupe interne</option>
              <option value="soustraitance">Sous-traitance</option>
            </select>
          </div>
          {mode === "soustraitance" && (
            <div>
              <label className="mb-1 block text-[11px] font-semibold text-muted-foreground">Façonnier</label>
              <select
                value={fac}
                onChange={(e) => setFac(e.target.value)}
                className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm"
              >
                {faconniers.length ? (
                  faconniers.map((f) => (
                    <option key={f} value={f}>
                      {f}
                    </option>
                  ))
                ) : (
                  <option value="">(aucun façonnier enregistré)</option>
                )}
              </select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Annuler
          </Button>
          <Button
            variant="destructive"
            disabled={pending || !motifValide}
            onClick={() =>
              start(async () => {
                const res = await lancerParDerogation(row.id, mode, motif, fac);
                if (!res.ok) {
                  toast.error(res.error);
                  return;
                }
                toast.warning("⚠ Dérogation accordée — lancement forcé");
                setOpen(false);
                router.refresh();
              })
            }
          >
            ⚠ Accorder la dérogation et lancer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
