"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronDown, ChevronRight, Printer, Search } from "lucide-react";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { StatusBadge, type Tone } from "@/components/shared/status-badge";
import { SectionPanel } from "@/components/shared/section-panel";
import { cn } from "@/lib/utils";
import type { PreparationRow } from "@/lib/services/preparation";
import type { DomaineDroit, Feu } from "@/lib/domain/feux";
import { ECRANS, type EcranId, type KpiTone } from "./config";
import { FicheDt } from "./fiche-dt";
import { FicheModelisme, FicheNomen, FicheTissu, FicheFournitures } from "./fiches";
import type { CatalogueFournitureRow } from "@/lib/services/preparation";
import { Journal } from "./journal";

export type Droits = Record<DomaineDroit, boolean>;

const nb = new Intl.NumberFormat("fr-FR");

const KPI_TONE: Record<KpiTone, { value: string; chip: string }> = {
  brand: { value: "text-brand", chip: "bg-accent" },
  success: { value: "text-success-foreground", chip: "bg-success-muted" },
  warning: { value: "text-warning-foreground", chip: "bg-warning-muted" },
  danger: { value: "text-[var(--danger-d)]", chip: "bg-[var(--danger-l)]" },
  purple: { value: "text-purple", chip: "bg-purple-muted" },
  neutral: { value: "text-foreground", chip: "bg-muted" },
};

/** Pastille compacte d'un feu, avec son état en infobulle. */
export function Pastille({ feu }: { feu: Feu }) {
  const symbole = { ok: "●", warn: "●", ko: "✕", wait: "○" }[feu.etat.kind];
  const couleur = {
    ok: "text-success-foreground",
    warn: "text-warning-foreground",
    ko: "text-[var(--danger-d)]",
    wait: "text-muted-foreground",
  }[feu.etat.kind];
  return (
    <span title={`${feu.label} : ${feu.etat.label}`} className={cn("text-[15px] leading-none", couleur)}>
      {symbole}
    </span>
  );
}

export function BandeauLectureSeule({ autorise, qui }: { autorise: boolean; qui: string }) {
  if (autorise) return null;
  return (
    <div className="mb-3 rounded-lg border border-warning bg-warning-muted px-3 py-2 text-xs">
      🔒 <b>Lecture seule</b> — cette partie est renseignée par {qui}.
    </div>
  );
}

export function EcranPreparation({
  ecran,
  rows,
  droits,
  faconniers,
  catalogue = [],
}: {
  ecran: EcranId;
  rows: PreparationRow[];
  droits: Droits;
  faconniers: string[];
  catalogue?: CatalogueFournitureRow[];
}) {
  const cfg = ECRANS[ecran];
  const [onglet, setOnglet] = useState(cfg.defaut);
  const [q, setQ] = useState("");
  const [ouverte, setOuverte] = useState<number | null>(null);

  /* Sur un écran de matière, un OF rattaché n'a rien à y faire : son porteur
     saisit la réception une fois pour toute la référence. Il sort donc des
     onglets de travail et des indicateurs — mais pas de « Tout », où il reste
     consultable avec le n° de celui qui le gère. Une ligne qui existe en base
     doit rester atteignable. */
  const aTraiter = useMemo(
    () => (cfg.porteurSeul ? rows.filter((r) => !r.porteurOf) : rows),
    [cfg, rows],
  );
  const masques = rows.length - aTraiter.length;

  const kpis = useMemo(() => cfg.kpis(aTraiter), [cfg, aTraiter]);

  const filtrees = useMemo(() => {
    const test = cfg.onglets.find((o) => o.k === onglet)?.test ?? null;
    let out = test ? aTraiter.filter(test) : rows;
    const needle = q.trim().toLowerCase();
    if (needle) {
      out = out.filter((r) =>
        `${r.of} ${r.modele} ${r.refArticle} ${r.client} ${r.couleur}`.toLowerCase().includes(needle),
      );
    }
    return cfg.tri ? [...out].sort(cfg.tri) : out;
  }, [cfg, rows, aTraiter, onglet, q]);

  const compte = (k: string) => {
    const t = cfg.onglets.find((o) => o.k === k)?.test;
    return t ? aTraiter.filter(t).length : rows.length;
  };

  return (
    <>
      <div className="mb-4 grid grid-cols-[repeat(auto-fit,minmax(200px,1fr))] gap-3">
        {kpis.map((k) => (
          <div key={k.label} className="rounded-xl border bg-card px-4 py-3">
            <div className="flex items-start justify-between gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                {k.label}
              </span>
              <span className={cn("grid size-7 place-items-center rounded-lg text-sm", KPI_TONE[k.tone].chip)}>
                {k.icone}
              </span>
            </div>
            <div className={cn("mt-1 text-2xl font-bold tabular-nums", KPI_TONE[k.tone].value)}>{k.valeur}</div>
            {k.sub && <div className="mt-0.5 text-[11px] text-muted-foreground">{k.sub}</div>}
          </div>
        ))}
      </div>

      <details className="mb-4 rounded-xl border bg-card px-4 py-3 text-xs leading-relaxed">
        <summary className="cursor-pointer font-semibold">Comment fonctionne cet écran</summary>
        <p className="mt-2 text-muted-foreground">{cfg.aide}</p>
        {cfg.porteurSeul && masques > 0 && (
          <p className="mt-2 text-muted-foreground">
            🔗 <b>{masques}</b> OF sont rattachés à un OF porteur : même client, même référence, donc même matière.
            Leur réception se saisit une seule fois, sur le porteur, pour le besoin du groupe entier. Ils restent
            visibles dans l&apos;onglet « Tout », avec le n° de celui qui les gère.
          </p>
        )}
      </details>

      <SectionPanel
        title={
          <div className="flex flex-wrap items-center gap-1.5">
            {cfg.onglets.map((o) => (
              <button
                key={o.k}
                onClick={() => setOnglet(o.k)}
                className={cn(
                  "rounded-full px-3 py-1 text-[11px] font-semibold transition-colors",
                  onglet === o.k ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {o.label} <span className="tabular-nums opacity-70">{compte(o.k)}</span>
              </button>
            ))}
          </div>
        }
        actions={
          <div className="flex items-center gap-2">
            {ecran === "magfour" && (
              <Link
                href="/magfour/catalogue"
                title="Gérer les fournitures récurrentes (catalogue)"
                className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
              >
                📋 Catalogue
              </Link>
            )}
            {ecran === "magtissu" && (
              <>
                <Link
                  href="/magtissu/reception"
                  title="Bon de réception tissu — entrée physique par lots"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-brand bg-brand px-2.5 text-[11px] font-semibold text-white hover:opacity-90"
                >
                  📦 Réception tissu
                </Link>
                <Link
                  href="/magtissu/inventaire"
                  target="_blank"
                  title="Imprimer l'inventaire tissu (toutes commandes)"
                  className="inline-flex h-8 items-center gap-1.5 rounded-md border border-input px-2.5 text-[11px] font-semibold hover:bg-muted"
                >
                  <Printer className="size-3.5" /> Inventaire
                </Link>
              </>
            )}
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="OF, modèle, réf…"
                className="h-8 w-56 bg-card pl-7"
              />
            </div>
          </div>
        }
        flush
      >
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b bg-muted/40">
                <th className="w-8" />
                {cfg.colonnes.map((c) => (
                  <th
                    key={c.titre}
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-[10.5px] font-bold uppercase tracking-wide text-muted-foreground",
                      c.align === "center" && "text-center",
                      c.align === "right" && "text-right",
                      !c.align && "text-left",
                    )}
                  >
                    {c.titre}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtrees.length === 0 ? (
                <tr>
                  <td colSpan={cfg.colonnes.length + 1} className="py-10 text-center text-muted-foreground">
                    Aucune commande dans cet onglet.
                  </td>
                </tr>
              ) : (
                filtrees.map((r) => (
                  <Ligne
                    key={r.id}
                    ecran={ecran}
                    row={r}
                    droits={droits}
                    faconniers={faconniers}
                    catalogue={catalogue}
                    ouverte={ouverte === r.id}
                    onToggle={() => setOuverte(ouverte === r.id ? null : r.id)}
                    nbColonnes={cfg.colonnes.length + 1}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </SectionPanel>
    </>
  );
}

function Ligne({
  ecran,
  row,
  droits,
  faconniers,
  catalogue,
  ouverte,
  onToggle,
  nbColonnes,
}: {
  ecran: EcranId;
  row: PreparationRow;
  droits: Droits;
  faconniers: string[];
  catalogue: CatalogueFournitureRow[];
  ouverte: boolean;
  onToggle: () => void;
  nbColonnes: number;
}) {
  return (
    <>
      <tr
        className={cn("cursor-pointer border-b hover:bg-accent/50", ouverte && "bg-accent/60")}
        onClick={onToggle}
      >
        <td className="pl-2 text-muted-foreground">
          {ouverte ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
        </td>
        <Cellules ecran={ecran} row={row} />
      </tr>
      {ouverte && (
        <tr className="border-b bg-muted/20">
          <td colSpan={nbColonnes} className="px-4 py-4">
            <Fiche ecran={ecran} row={row} droits={droits} faconniers={faconniers} catalogue={catalogue} />
          </td>
        </tr>
      )}
    </>
  );
}

/* ─────────── cellules par écran ─────────── */

const ColOf = ({ row }: { row: PreparationRow }) => (
  <td className="px-3 py-2">
    <b className="text-brand">{row.of || "—"}</b>
    <br />
    <small className="text-muted-foreground">{row.client}</small>
    {/* Qui gère la matière de cette ligne. Sans ce rappel, un OF absent des
        listes de réception ressemblerait à un oubli plutôt qu'à un choix. */}
    {row.porteurOf && (
      <>
        <br />
        <small className="text-muted-foreground" title={`Matière et contrôle qualité gérés par ${row.porteurOf}`}>
          ↳ {row.porteurOf}
        </small>
      </>
    )}
    {row.estPorteur && (
      <>
        <br />
        <small className="font-semibold text-brand" title="Cet OF porte la matière de son groupe">
          🔗 porteur · {nb.format(row.qteGroupe)} pcs
        </small>
      </>
    )}
  </td>
);
const ColModele = ({ row, second }: { row: PreparationRow; second?: string }) => (
  <td className="px-3 py-2">
    <b>{row.modele}</b>
    <br />
    <small className="text-muted-foreground">{second ?? row.refArticle}</small>
  </td>
);
const ColQte = ({ row }: { row: PreparationRow }) => (
  <td className="px-3 py-2 text-center font-semibold tabular-nums">{nb.format(row.qte)}</td>
);
const ColExport = ({ row }: { row: PreparationRow }) => (
  <td className="px-3 py-2">
    <small>{row.dateExport || "—"}</small>
    {row.joursExport != null && row.joursExport < 0 && !row.lancee && (
      <>
        <br />
        <StatusBadge tone="danger">retard {Math.abs(row.joursExport)}j</StatusBadge>
      </>
    )}
  </td>
);

function Cellules({ ecran, row }: { ecran: EcranId; row: PreparationRow }) {
  if (ecran === "dt") {
    return (
      <>
        <ColOf row={row} />
        <ColModele row={row} />
        <ColQte row={row} />
        {row.feux.map((f) => (
          <td key={f.id} className="px-3 py-2 text-center">
            <Pastille feu={f} />
          </td>
        ))}
        <td className="px-3 py-2">
          <StatusBadge tone={row.statut.tone}>{row.statut.label}</StatusBadge>
          {row.lancement?.derogationMotif && (
            <div className="mt-0.5 text-[10px] font-bold text-[var(--danger-d)]">⚠ dérogation</div>
          )}
        </td>
        <ColExport row={row} />
      </>
    );
  }

  if (ecran === "magtissu") {
    const feu = row.feux.find((f) => f.id === "tissu")!;
    return (
      <>
        <ColOf row={row} />
        <ColModele row={row} second={row.couleur} />
        <ColQte row={row} />
        <td className="px-3 py-2 text-center tabular-nums">
          {row.besoinTissu > 0 ? (
            <b>{row.besoinTissu.toFixed(1)} m</b>
          ) : (
            <small className="text-muted-foreground">nomen. absente</small>
          )}
        </td>
        <td className="px-3 py-2">
          <small>{row.receptTissu || "—"}</small>
          {row.joursRetardReception != null && (
            <>
              <br />
              <StatusBadge tone="danger">{Math.abs(row.joursRetardReception)}j</StatusBadge>
            </>
          )}
        </td>
        <td className="px-3 py-2">
          <small>{row.tissuDateReelle || "—"}</small>
        </td>
        <td className="px-3 py-2 text-center tabular-nums">
          {row.tissuRecu > 0 ? <b>{nb.format(row.tissuRecu)} m</b> : "—"}
        </td>
        <td className="px-3 py-2 text-center">
          {row.ecartTissu == null ? (
            "—"
          ) : (
            <StatusBadge tone={row.ecartTissu < 0 ? "danger" : "success"}>
              {row.ecartTissu > 0 ? "+" : ""}
              {row.ecartTissu.toFixed(1)} m
            </StatusBadge>
          )}
        </td>
        <td className="px-3 py-2">
          <StatusBadge tone={feu.etat.tone}>{feu.etat.label}</StatusBadge>
        </td>
        <td className="px-3 py-2 text-center">
          {/* stopPropagation : la ligne entière déplie la fiche, et imprimer
              n'est pas consulter. */}
          <Link
            href={`/magtissu/${row.id}/imprimer`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            title={`Bon de réception tissu — ${row.of || row.modele}`}
            className="inline-flex rounded border border-input p-1 hover:bg-muted"
          >
            <Printer className="size-3.5" />
          </Link>
        </td>
      </>
    );
  }

  if (ecran === "magfour") {
    const feu = row.feux.find((f) => f.id === "four")!;
    const lignes = row.fournitures;
    const recues = lignes.filter((l) => l.qteRecue >= l.qtePrevue).length;
    return (
      <>
        <ColOf row={row} />
        <ColModele row={row} />
        <ColQte row={row} />
        <td className="px-3 py-2">
          {lignes.length ? <StatusBadge tone="brand">détaillé</StatusBadge> : <StatusBadge>global</StatusBadge>}
        </td>
        <td className="px-3 py-2 text-center tabular-nums">{lignes.length || "—"}</td>
        <td className="px-3 py-2 text-center tabular-nums">
          {lignes.length ? <b className="text-success-foreground">{recues}</b> : "—"}
        </td>
        <td className="px-3 py-2 text-center tabular-nums">
          {lignes.length ? (
            lignes.length - recues > 0 ? (
              <b className="text-[var(--danger-d)]">{lignes.length - recues}</b>
            ) : (
              <StatusBadge tone="success">0</StatusBadge>
            )
          ) : (
            "—"
          )}
        </td>
        <td className="px-3 py-2">
          <StatusBadge tone={feu.etat.tone}>{feu.etat.label}</StatusBadge>
        </td>
        <td className="px-3 py-2 text-center">
          {/* stopPropagation : la ligne entière déplie la fiche, et imprimer
              n'est pas consulter. */}
          <Link
            href={`/magfour/${row.id}/imprimer`}
            target="_blank"
            onClick={(e) => e.stopPropagation()}
            title={`Bon de réception fournitures — ${row.of || row.modele}`}
            className="inline-flex rounded border border-input p-1 hover:bg-muted"
          >
            <Printer className="size-3.5" />
          </Link>
        </td>
      </>
    );
  }

  if (ecran === "modelisme") {
    const cell = (nom: string) => {
      const e = row.etapes.find((x) => x.etape === nom);
      return e?.fait ? (
        <td className="px-3 py-2">
          <StatusBadge tone="success">✓ {e.date ?? ""}</StatusBadge>
          {e.par && <div className="mt-0.5 text-[10px] text-muted-foreground">{e.par}</div>}
        </td>
      ) : (
        <td className="px-3 py-2">
          <StatusBadge>à faire</StatusBadge>
        </td>
      );
    };
    return (
      <>
        <ColOf row={row} />
        <ColModele row={row} />
        <ColQte row={row} />
        <td className="px-3 py-2">
          {row.okPro ? (
            <StatusBadge tone="success">✓ {row.refOkPro}</StatusBadge>
          ) : (
            <StatusBadge tone="warning">en attente</StatusBadge>
          )}
        </td>
        {cell("patronage")}
        {cell("traces")}
        <td className="px-3 py-2">
          {row.parentId ? (
            <small className="text-muted-foreground">porteur {row.porteurOf}</small>
          ) : row.plan ? (
            <>
              <StatusBadge tone={row.plan.estime ? "warning" : "success"}>
                {row.plan.estime ? "à confirmer" : "✓ réel"}
              </StatusBadge>
              <div className="mt-0.5 text-[10px] text-muted-foreground">
                {row.plan.nbTraces} tracé{row.plan.nbTraces > 1 ? "s" : ""} · {row.plan.metres.toFixed(0)} m
              </div>
            </>
          ) : (
            <StatusBadge>à préparer</StatusBadge>
          )}
        </td>
        <ColExport row={row} />
      </>
    );
  }

  // nomen
  const ec = row.ecartConsoPct;
  return (
    <>
      <ColOf row={row} />
      <ColModele row={row} />
      <ColQte row={row} />
      <td className="px-3 py-2 text-center tabular-nums">
        {(row.consoTheo ?? 0) > 0 ? <b className="text-brand">{row.consoTheo!.toFixed(3)}</b> : <StatusBadge>—</StatusBadge>}
      </td>
      <td className="px-3 py-2 text-center tabular-nums">{row.chuteEffective} %</td>
      <td className="px-3 py-2 text-center tabular-nums">
        {row.besoinTissu > 0 ? <b>{row.besoinTissu.toFixed(1)} m</b> : "—"}
      </td>
      <td className="px-3 py-2 text-center tabular-nums">
        {(row.consoReel ?? 0) > 0 ? row.consoReel!.toFixed(3) : "—"}
      </td>
      <td className="px-3 py-2 text-center">
        {ec == null ? (
          "—"
        ) : (
          <StatusBadge tone={Math.abs(ec) > 5 ? "danger" : "success"}>
            {ec > 0 ? "+" : ""}
            {ec.toFixed(1)} %
          </StatusBadge>
        )}
      </td>
    </>
  );
}

/* ─────────── fiche dépliante ─────────── */

function Fiche({
  ecran,
  row,
  droits,
  faconniers,
  catalogue,
}: {
  ecran: EcranId;
  row: PreparationRow;
  droits: Droits;
  faconniers: string[];
  catalogue: CatalogueFournitureRow[];
}) {
  return (
    <div className="flex flex-col gap-4">
      {ecran === "dt" && <FicheDt row={row} droits={droits} faconniers={faconniers} />}
      {ecran === "modelisme" && <FicheModelisme row={row} droits={droits} />}
      {ecran === "nomen" && <FicheNomen row={row} droits={droits} />}
      {ecran === "magtissu" &&
        (row.porteurOf ? <RenvoiPorteur row={row} quoi="La réception tissu" /> : <FicheTissu row={row} droits={droits} />)}
      {ecran === "magfour" &&
        (row.porteurOf ? (
          <RenvoiPorteur row={row} quoi="La réception des fournitures" />
        ) : (
          <FicheFournitures row={row} droits={droits} catalogue={catalogue} />
        ))}
      <Journal commandeId={row.id} domaine={ecran === "dt" ? undefined : DOMAINE_ECRAN[ecran]} />
    </div>
  );
}

/** Ce qu'un OF rattaché montre à la place du formulaire de saisie.
 *
 * Le formulaire est retiré plutôt que grisé : deux champs identiques sur deux
 * OF de la même référence, c'est la double saisie qu'on cherche justement à
 * supprimer. Ce qui est affiché est ce que le porteur a saisi, pour que le
 * magasin voie l'état réel sans changer d'écran. */
function RenvoiPorteur({ row, quoi }: { row: PreparationRow; quoi: string }) {
  return (
    <div className="rounded-lg border border-border bg-muted/40 px-3 py-2.5 text-xs">
      🔗 {quoi} de cet OF est gérée par <b className="text-brand">{row.porteurOf}</b> — même client, même référence,
      donc même matière, commandée et contrôlée une fois pour le groupe.
      <div className="mt-1 text-[11px] text-muted-foreground">
        État repris du porteur : {row.tissuRecu > 0 ? `${nb.format(row.tissuRecu)} m reçus` : "rien reçu"}
        {row.tissuControle ? ` · contrôle ${row.tissuControle}` : " · non contrôlé"}. Pour saisir, ouvrez{" "}
        {row.porteurOf}. Pour que cet OF reprenne sa matière en propre, déliez-le depuis le carnet de commandes.
      </div>
    </div>
  );
}

const DOMAINE_ECRAN: Record<EcranId, string | undefined> = {
  dt: undefined, // la direction technique voit le journal complet
  modelisme: "modelisme",
  nomen: "nomen",
  magtissu: "tissu",
  magfour: "four",
};

/* ─────────── champ générique piloté par une action serveur ─────────── */

export function ChampServeur({
  valeur,
  type = "text",
  autorise,
  onSave,
  className,
  placeholder,
  step,
  options,
}: {
  valeur: string;
  type?: "text" | "number" | "date" | "select" | "textarea";
  autorise: boolean;
  onSave: (v: string) => Promise<{ ok: true } | { ok: false; error: string }>;
  className?: string;
  placeholder?: string;
  step?: string;
  options?: { value: string; label: string }[];
}) {
  const router = useRouter();
  const [v, setV] = useState(valeur);
  const [pending, start] = useTransition();

  const commit = (next: string) => {
    if (next === valeur) return;
    start(async () => {
      const res = await onSave(next);
      if (!res.ok) {
        toast.error(res.error);
        setV(valeur); // remettre la valeur serveur : l'écriture n'a pas eu lieu
        return;
      }
      router.refresh();
    });
  };

  const base = cn(
    "w-full rounded-md border border-input bg-card px-2 py-1 text-xs outline-none focus:border-ring focus:ring-2 focus:ring-ring/40 disabled:opacity-60",
    pending && "opacity-60",
    className,
  );
  const commun = { disabled: !autorise || pending, className: base };

  if (type === "select") {
    return (
      <select {...commun} value={v} onChange={(e) => { setV(e.target.value); commit(e.target.value); }}>
        {options?.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    );
  }
  if (type === "textarea") {
    return (
      <textarea
        {...commun}
        rows={2}
        value={v}
        placeholder={placeholder}
        onChange={(e) => setV(e.target.value)}
        onBlur={() => commit(v)}
      />
    );
  }
  return (
    <input
      {...commun}
      type={type}
      step={step}
      value={v}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => commit(v)}
    />
  );
}

/** Bouton qui déclenche une action serveur et rafraîchit. */
export function BoutonAction({
  onRun,
  children,
  variant = "outline",
  size = "sm",
  confirmer,
  disabled,
  succes,
}: {
  onRun: () => Promise<{ ok: true } | { ok: false; error: string }>;
  children: React.ReactNode;
  variant?: "default" | "outline" | "destructive" | "ghost";
  size?: "sm" | "xs" | "default";
  confirmer?: string;
  disabled?: boolean;
  succes?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant={variant}
      size={size === "xs" ? "sm" : size}
      disabled={disabled || pending}
      onClick={() => {
        if (confirmer && !confirm(confirmer)) return;
        start(async () => {
          const res = await onRun();
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          if (succes) toast.success(succes);
          router.refresh();
        });
      }}
    >
      {children}
    </Button>
  );
}

/** Lien vers l'écran qui alimente un feu. */
export function LienFeu({ feu }: { feu: Feu }) {
  return (
    <Link href={feu.ecran} className="text-[11px] text-brand underline-offset-2 hover:underline">
      → {feu.label}
    </Link>
  );
}

export type { Tone };
